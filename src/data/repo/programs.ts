import { db } from '../db';
import { newId, stamp } from '../ids';
import type { ID, Program, ScheduleConfig, WorkoutExercise, WorkoutTemplate } from '../../domain/types';
import { startOfWeek, todayISO } from '../../domain/dates';
import { isAlive, requireAlive, ValidationError } from './common';
import { getExercise } from './exercises';
import { getSettings, updateSettings } from './settings';

const PROGRAM_TABLES = () => [db.programs, db.workoutTemplates, db.workoutExercises, db.scheduleOverrides, db.settings];

export async function listPrograms(): Promise<Program[]> {
  const all = (await db.programs.toArray()).filter(isAlive);
  return all.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, 'it') : a.status === 'active' ? -1 : 1));
}

export async function getProgram(id: ID): Promise<Program | undefined> {
  const p = await db.programs.get(id);
  return isAlive(p) ? p : undefined;
}

export async function listTemplates(programId: ID): Promise<WorkoutTemplate[]> {
  const all = await db.workoutTemplates.where('programId').equals(programId).toArray();
  return all.filter(isAlive).sort((a, b) => a.position - b.position);
}

/** Schede del programma con il numero di esercizi, lette in un'unica query (nessun conteggio "0" provvisorio). */
export async function listTemplatesWithCounts(programId: ID): Promise<(WorkoutTemplate & { exerciseCount: number })[]> {
  const templates = await listTemplates(programId);
  if (!templates.length) return [];
  const wes = await db.workoutExercises.where('workoutTemplateId').anyOf(templates.map((t) => t.id)).toArray();
  return templates.map((t) => ({
    ...t,
    exerciseCount: wes.filter((w) => isAlive(w) && w.workoutTemplateId === t.id).length,
  }));
}

export async function getTemplate(id: ID): Promise<WorkoutTemplate | undefined> {
  const t = await db.workoutTemplates.get(id);
  return isAlive(t) ? t : undefined;
}

export async function listWorkoutExercises(templateId: ID): Promise<WorkoutExercise[]> {
  const all = await db.workoutExercises.where('workoutTemplateId').equals(templateId).toArray();
  return all.filter(isAlive).sort((a, b) => a.order - b.order);
}

/** A, B, C … Z, AA, AB … */
export function codeForPosition(position: number): string {
  let n = position;
  let code = '';
  do {
    code = String.fromCharCode(65 + (n % 26)) + code;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return code;
}

export function defaultSchedule(today = todayISO()): ScheduleConfig {
  return { trainingDays: [1, 3, 5], startDate: startOfWeek(today), mode: 'keep_sequence' };
}

export async function createProgram(
  input: { name: string; description?: string; templateCount?: number; schedule?: ScheduleConfig },
  now = Date.now(),
): Promise<Program> {
  if (!input.name.trim()) throw new ValidationError('Il nome del programma è obbligatorio.');
  const program: Program = {
    ...stamp(now),
    name: input.name.trim(),
    description: input.description ?? '',
    status: 'active',
    schedule: input.schedule ?? defaultSchedule(),
  };
  await db.transaction('rw', PROGRAM_TABLES(), async () => {
    await db.programs.add(program);
    const count = Math.max(0, input.templateCount ?? 0);
    for (let i = 0; i < count; i++) {
      await db.workoutTemplates.add({
        ...stamp(now),
        programId: program.id,
        code: codeForPosition(i),
        name: `Allenamento ${codeForPosition(i)}`,
        description: '',
        position: i,
      });
    }
    const settings = await getSettings();
    if (!settings.activeProgramId || !isAlive(await db.programs.get(settings.activeProgramId))) {
      await updateSettings({ activeProgramId: program.id }, now);
    }
  });
  return program;
}

export async function updateProgram(id: ID, patch: Partial<Pick<Program, 'name' | 'description' | 'schedule'>>, now = Date.now()) {
  if (patch.name !== undefined && !patch.name.trim()) throw new ValidationError('Il nome del programma è obbligatorio.');
  await db.transaction('rw', db.programs, async () => {
    const p = requireAlive(await db.programs.get(id), 'Programma');
    await db.programs.put({ ...p, ...patch, updatedAt: now });
  });
}

/** Archiviare non tocca lo storico: le sessioni restano consultabili. */
export async function setProgramStatus(id: ID, status: Program['status'], now = Date.now()) {
  await db.transaction('rw', PROGRAM_TABLES(), async () => {
    const p = requireAlive(await db.programs.get(id), 'Programma');
    await db.programs.put({ ...p, status, updatedAt: now });
    const settings = await getSettings();
    if (status === 'archived' && settings.activeProgramId === id) {
      const other = (await listPrograms()).find((x) => x.id !== id && x.status === 'active');
      await updateSettings({ activeProgramId: other?.id ?? null }, now);
    }
  });
}

export async function setActiveProgram(id: ID) {
  const p = await getProgram(id);
  if (!p) throw new ValidationError('Programma non trovato.');
  if (p.status === 'archived') await setProgramStatus(id, 'active');
  await updateSettings({ activeProgramId: id });
}

/**
 * Elimina il programma e le sue schede. Le sessioni già eseguite NON vengono eliminate:
 * conservano il nome del programma e della scheda al momento dell'esecuzione.
 */
export async function deleteProgram(id: ID, now = Date.now()) {
  await db.transaction('rw', PROGRAM_TABLES(), async () => {
    const p = requireAlive(await db.programs.get(id), 'Programma');
    const del = <T extends { deletedAt: number | null; updatedAt: number }>(r: T): T => ({ ...r, deletedAt: now, updatedAt: now });
    await db.programs.put(del(p));
    const templates = (await db.workoutTemplates.where('programId').equals(id).toArray()).filter(isAlive);
    await db.workoutTemplates.bulkPut(templates.map(del));
    for (const t of templates) {
      const wes = (await db.workoutExercises.where('workoutTemplateId').equals(t.id).toArray()).filter(isAlive);
      await db.workoutExercises.bulkPut(wes.map(del));
    }
    const overrides = (await db.scheduleOverrides.where('programId').equals(id).toArray()).filter(isAlive);
    await db.scheduleOverrides.bulkPut(overrides.map(del));
    const settings = await getSettings();
    if (settings.activeProgramId === id) {
      const other = (await listPrograms()).find((x) => x.status === 'active');
      await updateSettings({ activeProgramId: other?.id ?? null }, now);
    }
  });
}

export async function duplicateProgram(id: ID, now = Date.now()): Promise<Program> {
  return db.transaction('rw', PROGRAM_TABLES(), async () => {
    const src = requireAlive(await db.programs.get(id), 'Programma');
    const copy: Program = { ...src, ...stamp(now), name: `${src.name} (copia)`, status: 'active' };
    await db.programs.add(copy);
    for (const t of await listTemplates(id)) {
      const newTemplateId = newId();
      await db.workoutTemplates.add({ ...t, ...stamp(now), id: newTemplateId, programId: copy.id });
      const wes = await listWorkoutExercises(t.id);
      await db.workoutExercises.bulkAdd(wes.map((w) => ({ ...w, ...stamp(now), workoutTemplateId: newTemplateId })));
    }
    return copy;
  });
}

export async function createTemplate(programId: ID, input: { name?: string; code?: string; description?: string } = {}, now = Date.now()) {
  return db.transaction('rw', [db.programs, db.workoutTemplates], async () => {
    requireAlive(await db.programs.get(programId), 'Programma');
    const existing = await listTemplates(programId);
    const position = existing.length;
    const code = input.code?.trim() || codeForPosition(position);
    const template: WorkoutTemplate = {
      ...stamp(now),
      programId,
      code,
      name: input.name?.trim() || `Allenamento ${code}`,
      description: input.description ?? '',
      position,
    };
    await db.workoutTemplates.add(template);
    return template;
  });
}

export async function updateTemplate(id: ID, patch: Partial<Pick<WorkoutTemplate, 'name' | 'code' | 'description'>>, now = Date.now()) {
  if (patch.name !== undefined && !patch.name.trim()) throw new ValidationError('Il nome della scheda è obbligatorio.');
  if (patch.code !== undefined && !patch.code.trim()) throw new ValidationError('Il codice della scheda è obbligatorio.');
  await db.transaction('rw', db.workoutTemplates, async () => {
    const t = requireAlive(await db.workoutTemplates.get(id), 'Scheda');
    await db.workoutTemplates.put({ ...t, ...patch, updatedAt: now });
  });
}

async function renumberTemplates(programId: ID, ordered: WorkoutTemplate[], now: number) {
  void programId;
  await db.workoutTemplates.bulkPut(
    ordered.map((t, i) => (t.position === i ? t : { ...t, position: i, updatedAt: now })),
  );
}

export async function deleteTemplate(id: ID, now = Date.now()) {
  await db.transaction('rw', [db.workoutTemplates, db.workoutExercises, db.scheduleOverrides], async () => {
    const t = requireAlive(await db.workoutTemplates.get(id), 'Scheda');
    await db.workoutTemplates.put({ ...t, deletedAt: now, updatedAt: now });
    const wes = await listWorkoutExercises(id);
    await db.workoutExercises.bulkPut(wes.map((w) => ({ ...w, deletedAt: now, updatedAt: now })));
    const overrides = (await db.scheduleOverrides.where('programId').equals(t.programId).toArray())
      .filter((o) => isAlive(o) && o.workoutTemplateId === id);
    await db.scheduleOverrides.bulkPut(overrides.map((o) => ({ ...o, deletedAt: now, updatedAt: now })));
    await renumberTemplates(t.programId, await listTemplates(t.programId), now);
  });
}

export async function moveTemplate(id: ID, direction: -1 | 1, now = Date.now()) {
  await db.transaction('rw', db.workoutTemplates, async () => {
    const t = requireAlive(await db.workoutTemplates.get(id), 'Scheda');
    const list = await listTemplates(t.programId);
    const idx = list.findIndex((x) => x.id === id);
    const target = idx + direction;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    await renumberTemplates(t.programId, list, now);
  });
}

export interface WorkoutExerciseTargets {
  targetSets?: number;
  repsMin?: number | null;
  repsMax?: number | null;
  restSec?: number | null;
  targetDurationSec?: number | null;
  notes?: string;
}

export function validateTargets(t: WorkoutExerciseTargets) {
  if (t.targetSets !== undefined && (!Number.isInteger(t.targetSets) || t.targetSets < 1 || t.targetSets > 20)) {
    throw new ValidationError('Le serie devono essere un numero intero tra 1 e 20.');
  }
  for (const [label, v] of [['Ripetizioni minime', t.repsMin], ['Ripetizioni massime', t.repsMax]] as const) {
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 1 || v > 200)) {
      throw new ValidationError(`${label}: inserisci un numero intero tra 1 e 200.`);
    }
  }
  if (t.repsMin != null && t.repsMax != null && t.repsMin > t.repsMax) {
    throw new ValidationError('Le ripetizioni minime non possono superare le massime.');
  }
  if (t.restSec != null && (t.restSec < 0 || t.restSec > 3600)) throw new ValidationError('Recupero non valido.');
  if (t.targetDurationSec != null && (t.targetDurationSec < 0 || t.targetDurationSec > 24 * 3600)) {
    throw new ValidationError('Durata non valida.');
  }
}

export async function addWorkoutExercise(templateId: ID, exerciseId: ID, targets: WorkoutExerciseTargets = {}, now = Date.now()) {
  validateTargets(targets);
  return db.transaction('rw', [db.workoutTemplates, db.workoutExercises, db.exercises], async () => {
    requireAlive(await db.workoutTemplates.get(templateId), 'Scheda');
    const exercise = await getExercise(exerciseId);
    if (!exercise) throw new ValidationError('Esercizio non trovato.');
    const existing = await listWorkoutExercises(templateId);
    const cardio = exercise.kind === 'cardio';
    const we: WorkoutExercise = {
      ...stamp(now),
      workoutTemplateId: templateId,
      exerciseId,
      order: existing.length,
      targetSets: targets.targetSets ?? (cardio ? 1 : 3),
      repsMin: targets.repsMin !== undefined ? targets.repsMin : cardio ? null : 8,
      repsMax: targets.repsMax !== undefined ? targets.repsMax : cardio ? null : 12,
      restSec: targets.restSec !== undefined ? targets.restSec : cardio ? null : 90,
      targetDurationSec: targets.targetDurationSec !== undefined ? targets.targetDurationSec : cardio ? 600 : null,
      notes: targets.notes ?? '',
    };
    await db.workoutExercises.add(we);
    return we;
  });
}

export async function updateWorkoutExercise(id: ID, patch: WorkoutExerciseTargets & { exerciseId?: ID }, now = Date.now()) {
  await db.transaction('rw', db.workoutExercises, async () => {
    const we = requireAlive(await db.workoutExercises.get(id), 'Esercizio della scheda');
    const next = { ...we, ...patch, updatedAt: now };
    validateTargets(next);
    await db.workoutExercises.put(next);
  });
}

export async function removeWorkoutExercise(id: ID, now = Date.now()) {
  await db.transaction('rw', db.workoutExercises, async () => {
    const we = requireAlive(await db.workoutExercises.get(id), 'Esercizio della scheda');
    await db.workoutExercises.put({ ...we, deletedAt: now, updatedAt: now });
    const rest = await listWorkoutExercises(we.workoutTemplateId);
    await db.workoutExercises.bulkPut(rest.map((w, i) => (w.order === i ? w : { ...w, order: i, updatedAt: now })));
  });
}

export async function moveWorkoutExercise(id: ID, direction: -1 | 1, now = Date.now()) {
  await db.transaction('rw', db.workoutExercises, async () => {
    const we = requireAlive(await db.workoutExercises.get(id), 'Esercizio della scheda');
    const list = await listWorkoutExercises(we.workoutTemplateId);
    const idx = list.findIndex((x) => x.id === id);
    const target = idx + direction;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    await db.workoutExercises.bulkPut(list.map((w, i) => (w.order === i ? w : { ...w, order: i, updatedAt: now })));
  });
}
