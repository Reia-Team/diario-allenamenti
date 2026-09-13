import { db } from '../db';
import type { HistoryData } from '../../domain/dashboard';
import { isAlive } from './common';

/**
 * Carica i dati delle sessioni CONCLUSE per statistiche e grafici.
 * Il volume di dati di un diario personale (migliaia di serie) è gestibile in memoria.
 */
export async function loadHistoryData(): Promise<HistoryData> {
  const [sessions, sessionExercises, sets, exercises, programs] = await Promise.all([
    db.sessions.where('status').equals('completed').toArray(),
    db.sessionExercises.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
    db.programs.toArray(),
  ]);
  const aliveSessions = sessions.filter(isAlive);
  const ids = new Set(aliveSessions.map((s) => s.id));
  return {
    sessions: aliveSessions,
    sessionExercises: sessionExercises.filter((se) => isAlive(se) && ids.has(se.sessionId)),
    sets: sets.filter((s) => isAlive(s) && ids.has(s.sessionId)),
    // Anche gli esercizi eliminati: lo storico deve restare leggibile.
    exercises,
    programs,
  };
}
