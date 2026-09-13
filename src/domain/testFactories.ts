import type { SetLike } from './metrics';

/** Crea una serie di test: valori non specificati = null (mai 0). */
export function set(partial: Partial<SetLike> & { setNumber?: number } = {}): SetLike {
  return {
    setNumber: 1,
    weightKg: null,
    reps: null,
    durationSec: null,
    distanceKm: null,
    speedKmh: null,
    inclinePct: null,
    level: null,
    calories: null,
    rpe: null,
    rir: null,
    restSec: null,
    completed: true,
    excludedFromStats: false,
    ...partial,
  };
}

/** sets(70, [10,10,9,8]) → 4 serie da 70 kg. */
export function sets(weightKg: number | null, reps: number[]): SetLike[] {
  return reps.map((r, i) => set({ setNumber: i + 1, weightKg, reps: r }));
}
