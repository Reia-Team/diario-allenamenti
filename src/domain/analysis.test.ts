import { describe, expect, it } from 'vitest';
import { buildChartSeries, comparePeriods, filterByPeriod, summarizePeriod } from './analysis';
import { computeSessionMetrics, type ExerciseSessionMetrics } from './metrics';
import { set, sets } from './testFactories';

const m = (id: string, date: string, weight: number | null, reps: number[]): ExerciseSessionMetrics =>
  computeSessionMetrics({ sessionId: id, date, startedAt: 0 }, sets(weight, reps), 'epley');

const history = [
  m('1', '2026-01-05', 50, [10, 10, 10, 10]),
  m('2', '2026-02-02', 55, [10, 10, 10, 9]),
  m('3', '2026-03-02', 60, [10, 10, 9, 9]),
  m('4', '2026-04-06', 65, [10, 10, 9, 8]),
  m('5', '2026-05-04', 70, [10, 10, 9, 8]),
];

describe('filtro periodo', () => {
  it('estremi inclusi, dati fuori periodo esclusi', () => {
    const inRange = filterByPeriod([...history, m('x', '2025-12-31', 40, [10]), m('y', '2027-01-01', 90, [10])], '2026-01-01', '2026-12-31');
    expect(inRange.map((x) => x.sessionId)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('sintesi periodo', () => {
  it('carico iniziale/finale, progressione e trend', () => {
    const s = summarizePeriod(history, 'strength', 'weight');
    expect(s.hasData).toBe(true);
    expect(s.sessions).toBe(5);
    expect(s.changes.weight).toMatchObject({ start: 50, end: 70 });
    expect(s.changes.weight!.changePct).toBeCloseTo(40);
    expect(s.changes.volume).toMatchObject({ start: 2000, end: 2590 });
    expect(s.trend.status).toBe('positive');
    expect(s.totalVolumeKg).toBe(2000 + 55 * 39 + 60 * 38 + 65 * 37 + 2590);
  });

  it('periodo senza dati', () => {
    const s = summarizePeriod([], 'strength', 'weight');
    expect(s.hasData).toBe(false);
    expect(s.sessions).toBe(0);
    expect(s.trend.status).toBe('insufficient');
    expect(s.changes.weight!.start).toBeNull();
  });

  it('una sola sessione: nessuna percentuale inventata', () => {
    const s = summarizePeriod([history[0]], 'strength', 'weight');
    expect(s.changes.weight!.changePct).toBeNull();
    expect(s.trend.status).toBe('insufficient');
  });

  it('peggioramento', () => {
    const s = summarizePeriod([m('1', '2026-01-05', 70, [10]), m('2', '2026-01-12', 65, [10]), m('3', '2026-01-19', 60, [10])], 'strength', 'weight');
    expect(s.trend.status).toBe('negative');
    expect(s.changes.weight!.changePct).toBeCloseTo(-14.2857, 3);
  });
});

describe('serie per il grafico', () => {
  it('interrompe la linea per pause lunghe e per valori mancanti (mai zero)', () => {
    const withRpe = computeSessionMetrics({ sessionId: 'r', date: '2026-05-06', startedAt: 0 }, [set({ weightKg: 70, reps: 10, rpe: 8 })], 'epley');
    const series = buildChartSeries(history.concat(withRpe), 'rpe');
    expect(series.valueCount).toBe(1);
    expect(series.points.filter((p) => p.value === 0)).toEqual([]);

    const weight = buildChartSeries(history, 'weight');
    // gennaio→febbraio 28 giorni > 21: punto nullo intermedio tra ogni coppia
    expect(weight.points.filter((p) => p.date === null).length).toBe(4);
    expect(weight.points.filter((p) => p.date !== null).map((p) => p.value)).toEqual([50, 55, 60, 65, 70]);
    expect(weight.points[0].trend).not.toBeNull();
  });

  it('niente linea di tendenza con meno di 3 sessioni', () => {
    const s = buildChartSeries(history.slice(0, 2), 'weight');
    expect(s.points.every((p) => p.trend === null)).toBe(true);
  });
});

describe('confronto periodi', () => {
  it('calcola valori e variazioni', () => {
    const rows = comparePeriods(history.slice(0, 2), history.slice(3), 'strength');
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.sessions).toMatchObject({ a: 2, b: 2 });
    expect(byKey.avgWeight.a).toBe(52.5);
    expect(byKey.avgWeight.b).toBe(67.5);
    expect(byKey.avgWeight.deltaPct).toBeCloseTo(28.571, 2);
    expect(byKey.maxWeight).toMatchObject({ a: 55, b: 70 });
  });

  it('periodo vuoto → valori null, nessuna variazione', () => {
    const rows = comparePeriods([], history, 'strength');
    const avgWeight = rows.find((r) => r.key === 'avgWeight')!;
    expect(avgWeight.a).toBeNull();
    expect(avgWeight.deltaPct).toBeNull();
  });
});
