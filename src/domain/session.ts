import type { Pause, SessionExerciseStatus } from './types';

/** Durata effettiva: tempo totale meno le pause (una pausa aperta si chiude a `endAt`). */
export function activeDurationMs(startedAt: number, pauses: Pause[], endAt: number): number {
  const paused = pauses.reduce((acc, p) => {
    const start = Math.max(p.start, startedAt);
    const end = Math.min(p.end ?? endAt, endAt);
    return acc + Math.max(0, end - start);
  }, 0);
  return Math.max(0, endAt - startedAt - paused);
}

/**
 * Stato di un esercizio in base alle serie registrate.
 * A sessione conclusa, un esercizio senza serie registrate risulta "saltato".
 */
export function deriveExerciseStatus(targetSets: number, completedSets: number, sessionFinished: boolean): SessionExerciseStatus {
  if (completedSets === 0) return sessionFinished ? 'skipped' : 'pending';
  if (completedSets >= Math.max(1, targetSets)) return 'completed';
  return 'partial';
}

export const EXERCISE_STATUS_LABEL: Record<SessionExerciseStatus, string> = {
  pending: 'Da fare',
  completed: 'Completato',
  partial: 'Parziale',
  skipped: 'Saltato',
};
