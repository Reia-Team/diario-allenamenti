import { db } from '../db';
import { stamp } from '../ids';
import type { ID, ISODate, ScheduleOverride } from '../../domain/types';
import type { PlanInput } from '../../domain/schedule';
import { isValidISODate } from '../../domain/dates';
import { isAlive, requireAlive, ValidationError } from './common';
import { getProgram, listTemplates } from './programs';

/** Raccoglie tutti i dati necessari al calcolo del calendario di un programma. */
export async function getPlanInput(programId: ID, today: ISODate): Promise<PlanInput | null> {
  const program = await getProgram(programId);
  if (!program) return null;
  const [templates, sessions, overrides] = await Promise.all([
    listTemplates(programId),
    db.sessions.where('programId').equals(programId).toArray(),
    db.scheduleOverrides.where('programId').equals(programId).toArray(),
  ]);
  return {
    templates,
    schedule: program.schedule,
    sessions: sessions.filter(isAlive),
    overrides: overrides.filter(isAlive),
    today,
  };
}

/**
 * Modifica la scheda di una singola data (null = riposo) senza toccare il programma.
 */
export async function setOverride(programId: ID, date: ISODate, templateId: ID | null, now = Date.now()): Promise<ScheduleOverride> {
  if (!isValidISODate(date)) throw new ValidationError('Data non valida.');
  return db.transaction('rw', [db.scheduleOverrides, db.programs, db.workoutTemplates], async () => {
    requireAlive(await db.programs.get(programId), 'Programma');
    if (templateId) {
      const t = requireAlive(await db.workoutTemplates.get(templateId), 'Scheda');
      if (t.programId !== programId) throw new ValidationError('La scheda non appartiene al programma.');
    }
    const existing = (await db.scheduleOverrides.where('programId').equals(programId).toArray()).find(
      (o) => isAlive(o) && o.date === date,
    );
    const record: ScheduleOverride = existing
      ? { ...existing, workoutTemplateId: templateId, updatedAt: now }
      : { ...stamp(now), programId, date, workoutTemplateId: templateId };
    await db.scheduleOverrides.put(record);
    return record;
  });
}

export async function clearOverride(programId: ID, date: ISODate, now = Date.now()) {
  await db.transaction('rw', db.scheduleOverrides, async () => {
    const list = (await db.scheduleOverrides.where('programId').equals(programId).toArray()).filter(
      (o) => isAlive(o) && o.date === date,
    );
    await db.scheduleOverrides.bulkPut(list.map((o) => ({ ...o, deletedAt: now, updatedAt: now })));
  });
}
