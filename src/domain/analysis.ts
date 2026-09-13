import type { ExerciseKind, ISODate } from './types';
import type { ExerciseSessionMetrics } from './metrics';
import { computeTrend, pctChange, type Polarity, type TrendResult } from './trend';
import { diffDays, isoToChartTime, isoToEpochDay } from './dates';

export type Metric = 'weight' | 'reps' | 'volume' | 'e1rm' | 'rpe' | 'rir' | 'duration' | 'distance' | 'speed' | 'calories';

export type ValueKind = 'weight' | 'reps' | 'volume' | 'score' | 'duration' | 'distance' | 'speed' | 'calories' | 'count';

export const METRIC_INFO: Record<Metric, { label: string; short: string; polarity: Polarity; valueKind: ValueKind }> = {
  weight: { label: 'Carico (massimo per sessione)', short: 'Carico', polarity: 'higher', valueKind: 'weight' },
  reps: { label: 'Ripetizioni totali', short: 'Ripetizioni', polarity: 'higher', valueKind: 'reps' },
  volume: { label: 'Volume (carico × ripetizioni)', short: 'Volume', polarity: 'higher', valueKind: 'volume' },
  e1rm: { label: '1RM stimato', short: '1RM stimato', polarity: 'higher', valueKind: 'weight' },
  rpe: { label: 'RPE medio', short: 'RPE', polarity: 'neutral', valueKind: 'score' },
  rir: { label: 'RIR medio', short: 'RIR', polarity: 'neutral', valueKind: 'score' },
  duration: { label: 'Durata', short: 'Durata', polarity: 'higher', valueKind: 'duration' },
  distance: { label: 'Distanza', short: 'Distanza', polarity: 'higher', valueKind: 'distance' },
  speed: { label: 'Velocità media', short: 'Velocità', polarity: 'higher', valueKind: 'speed' },
  calories: { label: 'Calorie', short: 'Calorie', polarity: 'higher', valueKind: 'calories' },
};

export function metricsForKind(kind: ExerciseKind): Metric[] {
  switch (kind) {
    case 'strength':
      return ['weight', 'reps', 'volume', 'e1rm', 'rpe', 'rir'];
    case 'bodyweight':
      return ['reps', 'rpe', 'rir'];
    case 'cardio':
      return ['duration', 'distance', 'speed', 'calories'];
  }
}

export function metricValue(m: ExerciseSessionMetrics, metric: Metric): number | null {
  switch (metric) {
    case 'weight': return m.topWeightKg;
    case 'reps': return m.totalReps;
    case 'volume': return m.volumeKg;
    case 'e1rm': return m.e1rmKg;
    case 'rpe': return m.avgRpe;
    case 'rir': return m.avgRir;
    case 'duration': return m.durationSec;
    case 'distance': return m.distanceKm;
    case 'speed': return m.avgSpeedKmh;
    case 'calories': return m.calories;
  }
}

export function sortMetrics(list: ExerciseSessionMetrics[]): ExerciseSessionMetrics[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt);
}

/** Estremi inclusi. */
export function filterByPeriod(list: ExerciseSessionMetrics[], from: ISODate, to: ISODate): ExerciseSessionMetrics[] {
  return list.filter((m) => m.date >= from && m.date <= to);
}

export interface ChartPoint {
  t: number;
  date: ISODate | null;
  value: number | null;
  trend: number | null;
  sessionId: string | null;
}

export interface ChartSeries {
  points: ChartPoint[];
  trend: TrendResult;
  valueCount: number;
}

/** Oltre questa distanza tra due sessioni la linea viene interrotta. */
export const CHART_GAP_DAYS = 21;

/**
 * Serie per il grafico. Nessun valore inventato:
 * - sessioni senza il dato → punto nullo (linea interrotta);
 * - pause lunghe tra sessioni → punto nullo intermedio (linea interrotta).
 * La linea di tendenza è una retta di regressione, mostrata solo con dati sufficienti.
 */
export function buildChartSeries(list: ExerciseSessionMetrics[], metric: Metric, gapDays = CHART_GAP_DAYS): ChartSeries {
  const sorted = sortMetrics(list);
  const valued = sorted
    .map((m) => ({ m, v: metricValue(m, metric) }))
    .filter((x): x is { m: ExerciseSessionMetrics; v: number } => x.v !== null);
  const trend = computeTrend(
    valued.map((x) => ({ x: isoToEpochDay(x.m.date), y: x.v })),
    { polarity: METRIC_INFO[metric].polarity },
  );
  const reg = trend.status !== 'insufficient' ? trend.regression : null;
  const trendAt = (iso: ISODate) => (reg ? reg.slope * isoToEpochDay(iso) + reg.intercept : null);

  const points: ChartPoint[] = [];
  let prevDate: ISODate | null = null;
  for (const m of sorted) {
    if (prevDate !== null && diffDays(prevDate, m.date) > gapDays) {
      const mid = (isoToChartTime(prevDate) + isoToChartTime(m.date)) / 2;
      points.push({ t: mid, date: null, value: null, trend: null, sessionId: null });
    }
    const value = metricValue(m, metric);
    points.push({ t: isoToChartTime(m.date), date: m.date, value, trend: trendAt(m.date), sessionId: m.sessionId });
    prevDate = m.date;
  }
  return { points, trend, valueCount: valued.length };
}

export interface MetricChange {
  start: number | null;
  end: number | null;
  startDate: ISODate | null;
  endDate: ISODate | null;
  changePct: number | null;
}

export interface PeriodSummary {
  hasData: boolean;
  sessions: number;
  firstDate: ISODate | null;
  lastDate: ISODate | null;
  changes: Partial<Record<Metric, MetricChange>>;
  totalVolumeKg: number | null;
  bestE1rmKg: number | null;
  maxWeightKg: number | null;
  trend: TrendResult;
  metric: Metric;
}

function metricChange(list: ExerciseSessionMetrics[], metric: Metric): MetricChange {
  const valued = list.filter((m) => metricValue(m, metric) !== null);
  if (!valued.length) return { start: null, end: null, startDate: null, endDate: null, changePct: null };
  const first = valued[0];
  const last = valued[valued.length - 1];
  const start = metricValue(first, metric);
  const end = metricValue(last, metric);
  return {
    start,
    end,
    startDate: first.date,
    endDate: last.date,
    changePct: valued.length >= 2 ? pctChange(start, end) : null,
  };
}

/** Sintesi di un periodo: si basa solo su dati realmente registrati. */
export function summarizePeriod(list: ExerciseSessionMetrics[], kind: ExerciseKind, metric: Metric): PeriodSummary {
  const sorted = sortMetrics(list).filter((m) => m.setsCompleted > 0);
  const changes: PeriodSummary['changes'] = {};
  for (const k of metricsForKind(kind)) changes[k] = metricChange(sorted, k);
  const volumes = sorted.map((m) => m.volumeKg).filter((v): v is number => v !== null);
  const e1rms = sorted.map((m) => m.e1rmKg).filter((v): v is number => v !== null);
  const weights = sorted.map((m) => m.topWeightKg).filter((v): v is number => v !== null);
  return {
    hasData: sorted.length > 0,
    sessions: sorted.length,
    firstDate: sorted[0]?.date ?? null,
    lastDate: sorted[sorted.length - 1]?.date ?? null,
    changes,
    totalVolumeKg: volumes.length ? volumes.reduce((a, b) => a + b, 0) : null,
    bestE1rmKg: e1rms.length ? Math.max(...e1rms) : null,
    maxWeightKg: weights.length ? Math.max(...weights) : null,
    trend: buildChartSeries(sorted, metric).trend,
    metric,
  };
}

export interface CompareRow {
  key: string;
  label: string;
  valueKind: ValueKind;
  a: number | null;
  b: number | null;
  deltaPct: number | null;
  polarity: Polarity;
}

const avg = (v: number[]) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : null);
const sum = (v: number[]) => (v.length ? v.reduce((x, y) => x + y, 0) : null);
const max = (v: number[]) => (v.length ? Math.max(...v) : null);
const values = (list: ExerciseSessionMetrics[], metric: Metric) =>
  list.map((m) => metricValue(m, metric)).filter((v): v is number => v !== null);

/** Confronto tra due periodi (A = riferimento, B = confronto). */
export function comparePeriods(a: ExerciseSessionMetrics[], b: ExerciseSessionMetrics[], kind: ExerciseKind): CompareRow[] {
  const pa = a.filter((m) => m.setsCompleted > 0);
  const pb = b.filter((m) => m.setsCompleted > 0);
  const defs: { key: string; label: string; valueKind: ValueKind; fn: (l: ExerciseSessionMetrics[]) => number | null; polarity?: Polarity }[] = [
    { key: 'sessions', label: 'Sessioni', valueKind: 'count', fn: (l) => l.length },
  ];
  if (kind === 'strength') {
    defs.push(
      { key: 'avgWeight', label: 'Carico medio', valueKind: 'weight', fn: (l) => avg(values(l, 'weight')) },
      { key: 'maxWeight', label: 'Carico massimo', valueKind: 'weight', fn: (l) => max(values(l, 'weight')) },
      { key: 'avgReps', label: 'Ripetizioni medie / sessione', valueKind: 'reps', fn: (l) => avg(values(l, 'reps')) },
      { key: 'avgVolume', label: 'Volume medio / sessione', valueKind: 'volume', fn: (l) => avg(values(l, 'volume')) },
      { key: 'totalVolume', label: 'Volume totale', valueKind: 'volume', fn: (l) => sum(values(l, 'volume')) },
      { key: 'bestE1rm', label: '1RM stimato (migliore)', valueKind: 'weight', fn: (l) => max(values(l, 'e1rm')) },
    );
  } else if (kind === 'bodyweight') {
    defs.push(
      { key: 'avgReps', label: 'Ripetizioni medie / sessione', valueKind: 'reps', fn: (l) => avg(values(l, 'reps')) },
      { key: 'maxReps', label: 'Ripetizioni totali (massimo)', valueKind: 'reps', fn: (l) => max(values(l, 'reps')) },
    );
  } else {
    defs.push(
      { key: 'avgDuration', label: 'Durata media', valueKind: 'duration', fn: (l) => avg(values(l, 'duration')) },
      { key: 'totalDistance', label: 'Distanza totale', valueKind: 'distance', fn: (l) => sum(values(l, 'distance')) },
      { key: 'avgSpeed', label: 'Velocità media', valueKind: 'speed', fn: (l) => avg(values(l, 'speed')) },
      { key: 'totalCalories', label: 'Calorie totali', valueKind: 'calories', fn: (l) => sum(values(l, 'calories')) },
    );
  }
  return defs.map((d) => {
    const va = pa.length ? d.fn(pa) : null;
    const vb = pb.length ? d.fn(pb) : null;
    return { key: d.key, label: d.label, valueKind: d.valueKind, a: va, b: vb, deltaPct: pctChange(va, vb), polarity: d.polarity ?? 'higher' };
  });
}
