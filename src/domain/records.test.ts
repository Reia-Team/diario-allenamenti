import { describe, expect, it } from 'vitest';
import { detectRecords, type SessionSets } from './records';
import { sets } from './testFactories';

const session = (id: string, date: string, s: SessionSets['sets']): SessionSets => ({ sessionId: id, date, startedAt: 0, sets: s });

describe('record personali', () => {
  it('la prima sessione è la baseline, i miglioramenti successivi sono record', () => {
    const r = detectRecords('ex', 'strength', [
      session('1', '2026-09-14', sets(70, [10, 10, 9, 8])),
      session('2', '2026-09-18', sets(72.5, [10, 9, 8, 8])), // volume 2537,5 < 2590: nessun record di volume
    ], 'epley');
    expect(r.events.map((e) => e.type).sort()).toEqual(['best_e1rm', 'max_weight']);
    expect(r.bests.max_weight).toMatchObject({ value: 72.5, sessionId: '2' });
    expect(r.events.find((e) => e.type === 'max_weight')!.previous).toBe(70);
  });

  it('più ripetizioni allo stesso carico', () => {
    const r = detectRecords('ex', 'strength', [
      session('1', '2026-09-14', sets(70, [10, 10, 9, 8])),
      session('2', '2026-09-18', sets(70, [12, 10, 9, 8])),
    ], 'epley');
    const ev = r.events.find((e) => e.type === 'max_reps_at_weight')!;
    expect(ev).toMatchObject({ value: 12, weightKg: 70, previous: 10 });
  });

  it('i dati esclusi (anomali) non generano record', () => {
    const anomaly = sets(700, [10]).map((s) => ({ ...s, excludedFromStats: true }));
    const r = detectRecords('ex', 'strength', [
      session('1', '2026-09-14', sets(70, [10])),
      session('2', '2026-09-18', [...anomaly, ...sets(70, [9]).map((s) => ({ ...s, setNumber: 2 }))]),
    ], 'epley');
    expect(r.events).toEqual([]);
    expect(r.bests.max_weight!.value).toBe(70);
  });

  it('ordine cronologico indipendente dall’input; cardio escluso', () => {
    const r = detectRecords('ex', 'strength', [
      session('2', '2026-09-18', sets(80, [5])),
      session('1', '2026-09-14', sets(70, [5])),
    ], 'epley');
    expect(r.events.find((e) => e.type === 'max_weight')!.sessionId).toBe('2');
    expect(detectRecords('c', 'cardio', [session('1', '2026-09-14', sets(null, [1]))], 'epley').events).toEqual([]);
  });
});
