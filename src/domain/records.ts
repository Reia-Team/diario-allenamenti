import type { ExerciseKind, ID, ISODate, OneRmFormula } from './types';
import { countsForStats, totalVolume, type SetLike } from './metrics';
import { estimateOneRm } from './oneRm';

export type RecordType = 'max_weight' | 'max_volume' | 'max_reps_at_weight' | 'best_e1rm';

export const RECORD_LABEL: Record<RecordType, string> = {
  max_weight: 'Carico massimo',
  max_volume: 'Volume massimo in sessione',
  max_reps_at_weight: 'Più ripetizioni a questo carico',
  best_e1rm: 'Miglior 1RM stimato',
};

export interface RecordEvent {
  exerciseId: ID;
  sessionId: ID;
  date: ISODate;
  type: RecordType;
  value: number;
  /** Per max_reps_at_weight: il carico (null = corpo libero). */
  weightKg: number | null;
  previous: number;
}

export interface BestValue {
  value: number;
  date: ISODate;
  sessionId: ID;
  weightKg: number | null;
}

export interface ExerciseRecords {
  events: RecordEvent[];
  bests: Partial<Record<Exclude<RecordType, 'max_reps_at_weight'>, BestValue>>;
}

export interface SessionSets {
  sessionId: ID;
  date: ISODate;
  startedAt: number;
  sets: SetLike[];
}

/**
 * Scorre le sessioni in ordine cronologico e registra un evento ogni volta che un valore
 * supera il migliore precedente. La prima sessione crea la baseline (nessun evento).
 * Le serie non completate o escluse manualmente non contano.
 */
export function detectRecords(
  exerciseId: ID,
  kind: ExerciseKind,
  sessions: SessionSets[],
  formula: OneRmFormula,
): ExerciseRecords {
  const result: ExerciseRecords = { events: [], bests: {} };
  if (kind === 'cardio') return result;
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt);
  const repsByWeight = new Map<string, number>();

  const consider = (type: Exclude<RecordType, 'max_reps_at_weight'>, value: number | null, s: SessionSets) => {
    if (value === null || !(value > 0)) return;
    const prev = result.bests[type];
    if (prev && value > prev.value + 1e-9) {
      result.events.push({ exerciseId, sessionId: s.sessionId, date: s.date, type, value, weightKg: null, previous: prev.value });
    }
    if (!prev || value > prev.value + 1e-9) {
      result.bests[type] = { value, date: s.date, sessionId: s.sessionId, weightKg: null };
    }
  };

  for (const s of ordered) {
    const valid = s.sets.filter((x) => countsForStats(x) && x.reps !== null && x.reps > 0);
    if (!valid.length) continue;

    const weights = valid.map((x) => x.weightKg).filter((w): w is number => w !== null);
    consider('max_weight', weights.length ? Math.max(...weights) : null, s);
    consider('max_volume', totalVolume(valid), s);
    const e1rms = valid.map((x) => estimateOneRm(x.weightKg, x.reps, formula)).filter((v): v is number => v !== null);
    consider('best_e1rm', e1rms.length ? Math.max(...e1rms) : null, s);

    const sessionBest = new Map<string, { reps: number; weightKg: number | null }>();
    for (const x of valid) {
      const key = x.weightKg === null ? 'bw' : String(x.weightKg);
      const cur = sessionBest.get(key);
      if (!cur || (x.reps ?? 0) > cur.reps) sessionBest.set(key, { reps: x.reps ?? 0, weightKg: x.weightKg });
    }
    for (const [key, { reps, weightKg }] of sessionBest) {
      const prev = repsByWeight.get(key);
      if (prev !== undefined && reps > prev) {
        result.events.push({ exerciseId, sessionId: s.sessionId, date: s.date, type: 'max_reps_at_weight', value: reps, weightKg, previous: prev });
      }
      if (prev === undefined || reps > prev) repsByWeight.set(key, reps);
    }
  }
  return result;
}
