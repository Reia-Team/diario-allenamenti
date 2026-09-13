import { describe, expect, it } from 'vitest';
import { computeSessionMetrics, formatPerformance, referenceWeight, setVolume, totalVolume } from './metrics';
import { set, sets } from './testFactories';

const meta = { sessionId: 's1', date: '2026-09-14', startedAt: 0 };

describe('volume', () => {
  it('volume = carico × ripetizioni sommato su tutte le serie', () => {
    expect(totalVolume(sets(50, [10, 10, 9]))).toBe(1450);
    expect(totalVolume(sets(70, [10, 10, 9, 8]))).toBe(2590);
  });

  it('una serie senza carico o ripetizioni non vale zero: viene ignorata', () => {
    expect(setVolume(set({ weightKg: 50, reps: null }))).toBeNull();
    const mixed = [...sets(50, [10]), set({ setNumber: 2, weightKg: 50, reps: null })];
    expect(totalVolume(mixed)).toBe(500);
  });

  it('nessun dato valido → null (non 0)', () => {
    expect(totalVolume([])).toBeNull();
    expect(totalVolume(sets(null, [12, 12]))).toBeNull();
  });

  it('serie non completate o escluse non contano', () => {
    const s = [
      ...sets(50, [10]),
      set({ setNumber: 2, weightKg: 50, reps: 10, completed: false }),
      set({ setNumber: 3, weightKg: 500, reps: 10, excludedFromStats: true }),
    ];
    expect(totalVolume(s)).toBe(500);
  });
});

describe('metriche per sessione', () => {
  it('calcola carico massimo, reps totali, volume e 1RM', () => {
    const m = computeSessionMetrics(meta, sets(70, [10, 10, 9, 8]), 'epley');
    expect(m.setsCompleted).toBe(4);
    expect(m.topWeightKg).toBe(70);
    expect(m.totalReps).toBe(37);
    expect(m.volumeKg).toBe(2590);
    expect(m.e1rmKg).toBeCloseTo(70 * (1 + 10 / 30), 5);
    expect(m.avgRpe).toBeNull();
  });

  it('cardio: durata, distanza e velocità derivata', () => {
    const m = computeSessionMetrics(meta, [set({ durationSec: 900, distanceKm: 2 })], 'epley');
    expect(m.durationSec).toBe(900);
    expect(m.distanceKm).toBe(2);
    expect(m.avgSpeedKmh).toBeCloseTo(8, 5);
    expect(m.volumeKg).toBeNull();
    expect(m.calories).toBeNull();
  });

  it('carico di riferimento = più frequente, a parità il maggiore', () => {
    expect(referenceWeight([...sets(70, [10, 10]), ...sets(72.5, [8])])).toBe(70);
    expect(referenceWeight([...sets(70, [10]), ...sets(72.5, [8])])).toBe(72.5);
  });
});

describe('formatPerformance', () => {
  it('stesso carico', () => {
    expect(formatPerformance(sets(70, [10, 10, 9, 8]), 'strength', 'kg')).toBe('70 kg × 10 / 10 / 9 / 8');
  });
  it('carichi diversi', () => {
    const s = [set({ setNumber: 1, weightKg: 70, reps: 10 }), set({ setNumber: 2, weightKg: 72.5, reps: 8 })];
    expect(formatPerformance(s, 'strength', 'kg')).toBe('70 kg × 10 · 72,5 kg × 8');
  });
  it('corpo libero e cardio', () => {
    expect(formatPerformance(sets(null, [15, 15, 12]), 'bodyweight', 'kg')).toBe('15 / 15 / 12 rip.');
    expect(formatPerformance([set({ durationSec: 900, distanceKm: 2.1 })], 'cardio', 'kg')).toBe('15 min · 2,1 km');
  });
  it('nessuna serie', () => {
    expect(formatPerformance([], 'strength', 'kg')).toBe('Nessuna serie registrata');
  });
});
