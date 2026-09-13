import { db as defaultDb, type AppDB } from '../../data/db';
import { setVolume } from '../../domain/metrics';

/**
 * Esportazione CSV delle serie per analisi esterne.
 * Formato compatibile con Excel/LibreOffice in italiano: separatore ";", decimali con virgola, UTF-8 con BOM.
 * Le serie non registrate hanno celle vuote (mai 0).
 */

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'number') s = Number.isFinite(value) ? String(Math.round(value * 1000) / 1000).replace('.', ',') : '';
  else if (typeof value === 'boolean') s = value ? 'sì' : 'no';
  else s = value;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = [
  'Data', 'Programma', 'Scheda', 'Esercizio', 'Gruppo muscolare', 'Tipo', 'Stato esercizio', 'Serie', 'Registrata',
  'Carico (kg)', 'Ripetizioni', 'Volume (kg)', 'Durata (s)', 'Distanza (km)', 'Velocità (km/h)', 'Inclinazione (%)',
  'Livello', 'Calorie', 'Recupero (s)', 'RPE', 'RIR', 'Esclusa dalle statistiche', 'Note serie', 'Note esercizio', 'Note allenamento',
];

export async function exportSetsCsv(database: AppDB = defaultDb): Promise<string> {
  const [sessions, ses, sets] = await Promise.all([database.sessions.toArray(), database.sessionExercises.toArray(), database.sets.toArray()]);
  const sessionById = new Map(sessions.filter((s) => s.deletedAt === null && s.status === 'completed').map((s) => [s.id, s]));
  const seById = new Map(ses.filter((s) => s.deletedAt === null).map((s) => [s.id, s]));
  const rows = sets
    .filter((s) => s.deletedAt === null && sessionById.has(s.sessionId) && seById.has(s.sessionExerciseId))
    .map((s) => ({ s, session: sessionById.get(s.sessionId)!, se: seById.get(s.sessionExerciseId)! }))
    .sort((a, b) => a.session.date.localeCompare(b.session.date) || a.session.startedAt - b.session.startedAt || a.se.order - b.se.order || a.s.setNumber - b.s.setNumber);

  const lines = [HEADER.map(csvCell).join(';')];
  for (const { s, session, se } of rows) {
    lines.push(
      [
        session.date, session.programName, `${session.templateCode} ${session.templateName}`, se.name, se.muscleGroup, se.kind, se.status,
        s.setNumber, s.completed, s.weightKg, s.reps, s.completed ? setVolume(s) : null, s.durationSec, s.distanceKm, s.speedKmh,
        s.inclinePct, s.level, s.calories, s.restSec, s.rpe, s.rir, s.excludedFromStats, s.notes, se.notes, session.notes,
      ].map(csvCell).join(';'),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
