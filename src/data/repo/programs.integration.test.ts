import { beforeEach, describe, expect, it } from 'vitest';
import { at, exerciseInSession, freshDb } from '../testDb';
import { SEED_PROGRAM_ID } from '../seed';
import {
  addWorkoutExercise, codeForPosition, createProgram, createTemplate, deleteProgram, deleteTemplate, duplicateProgram,
  listPrograms, listTemplates, listWorkoutExercises, moveTemplate, moveWorkoutExercise, removeWorkoutExercise,
  setProgramStatus, updateTemplate,
} from './programs';
import { createExercise, deleteExercise, listExercises, updateExercise } from './exercises';
import { completeSet, finishSession, getSessionDetail, startSession } from './sessions';
import { getSettings } from './settings';
import { clearOverride, getPlanInput, setOverride } from './schedule';
import { buildPlan } from '../../domain/schedule';
import { db } from '../db';
import { ensureSeeded } from '../seed';

beforeEach(async () => {
  await freshDb('2026-09-14');
});

describe('dati iniziali', () => {
  it('programma "Scheda palestra" con A (9 esercizi) e B (9 esercizi) nell’ordine della scheda', async () => {
    const [program] = await listPrograms();
    expect(program).toMatchObject({ id: SEED_PROGRAM_ID, name: 'Scheda palestra', status: 'active' });
    expect(program.schedule).toMatchObject({ trainingDays: [1, 3, 5], mode: 'keep_sequence' });
    const templates = await listTemplates(SEED_PROGRAM_ID);
    expect(templates.map((t) => t.code)).toEqual(['A', 'B']);
    const exercises = new Map((await listExercises()).map((e) => [e.id, e]));
    const a = await listWorkoutExercises('seed-tpl-A');
    expect(a.map((w) => `${exercises.get(w.exerciseId)!.name} ${w.targetSets}x${w.repsMax ?? w.targetDurationSec! / 60}`)).toEqual([
      'Chest Press (Macchina) 4x10', 'Croci su panca piana 3x12', 'Lat Machine avanti 4x10', 'Pulley basso 3x12',
      'Alzate laterali con manubri 3x12', 'Lento avanti con manubri 3x10', 'Alzate al mento 3x8', 'Crunch a terra 4x15',
      'Tapis Roulant 1x15',
    ]);
    const b = await listWorkoutExercises('seed-tpl-B');
    expect(b.map((w) => exercises.get(w.exerciseId)!.name)).toEqual([
      'Ellittica', 'Squat a corpo libero', 'Leg Press', 'Leg Extension', 'Leg Curl sdraiato', 'Curl con bilanciere',
      'Curl con manubri', 'Push down ai cavi', 'Ellittica',
    ]);
    expect(b[0].notes).toBe('Riscaldamento');
    expect(b[8]).toMatchObject({ notes: 'Defaticamento', targetDurationSec: 600 });
    expect((await getSettings()).activeProgramId).toBe(SEED_PROGRAM_ID);
  });

  it('il seed avviene una sola volta', async () => {
    expect(await ensureSeeded(db, '2026-09-14')).toBe(false);
    expect(await db.programs.count()).toBe(1);
  });
});

describe('programmi', () => {
  it('programma A/B/C/D personalizzato', async () => {
    const p = await createProgram({ name: 'Ipertrofia', templateCount: 4 });
    expect((await listTemplates(p.id)).map((t) => t.code)).toEqual(['A', 'B', 'C', 'D']);
    const c = (await listTemplates(p.id))[2];
    await updateTemplate(c.id, { name: 'Gambe' });
    await moveTemplate(c.id, -1);
    expect((await listTemplates(p.id)).map((t) => t.name)).toEqual(['Allenamento A', 'Gambe', 'Allenamento B', 'Allenamento D']);
    const e = await createTemplate(p.id);
    expect(e.code).toBe('E');
    expect(codeForPosition(26)).toBe('AA');
  });

  it('duplica con schede ed esercizi, id nuovi', async () => {
    const copy = await duplicateProgram(SEED_PROGRAM_ID);
    expect(copy.name).toBe('Scheda palestra (copia)');
    const templates = await listTemplates(copy.id);
    expect(templates).toHaveLength(2);
    expect(templates[0].id).not.toBe('seed-tpl-A');
    expect(await listWorkoutExercises(templates[0].id)).toHaveLength(9);
    expect(await listWorkoutExercises('seed-tpl-A')).toHaveLength(9);
  });

  it('archiviare o eliminare un programma non elimina lo storico', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: 'seed-tpl-A' }, at('2026-09-14', 18));
    const chest = await exerciseInSession(s.id, 'seed-ex-chest-press');
    await completeSet(chest.sets[0].id, { weightKg: 70, reps: 10 }, at('2026-09-14', 18, 5));
    await finishSession(s.id, at('2026-09-14', 19));

    const other = await createProgram({ name: 'Altro', templateCount: 1 });
    await setProgramStatus(SEED_PROGRAM_ID, 'archived');
    expect((await getSettings()).activeProgramId).toBe(other.id);
    expect((await getSessionDetail(s.id))!.session.programName).toBe('Scheda palestra');

    await setProgramStatus(SEED_PROGRAM_ID, 'active');
    await deleteProgram(SEED_PROGRAM_ID);
    expect((await listPrograms()).map((p) => p.id)).toEqual([other.id]);
    const detail = await getSessionDetail(s.id);
    expect(detail!.session).toMatchObject({ programName: 'Scheda palestra', templateName: 'Allenamento A' });
    expect(detail!.exercises[0].sets[0]).toMatchObject({ weightKg: 70, reps: 10 });
  });

  it('esercizi della scheda: aggiungi, riordina, rimuovi, validazione', async () => {
    const ex = await createExercise({ name: 'Panca piana', muscleGroup: 'Pettorali', kind: 'strength' });
    const we = await addWorkoutExercise('seed-tpl-A', ex.id, { targetSets: 5, repsMin: 5, repsMax: 5, restSec: 180 });
    expect(we.order).toBe(9);
    await moveWorkoutExercise(we.id, -1);
    let list = await listWorkoutExercises('seed-tpl-A');
    expect(list[8].exerciseId).toBe(ex.id);
    await removeWorkoutExercise(list[0].id);
    list = await listWorkoutExercises('seed-tpl-A');
    expect(list.map((w) => w.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(list[0].exerciseId).toBe('seed-ex-croci-panca-piana');
    await expect(addWorkoutExercise('seed-tpl-A', ex.id, { repsMin: 12, repsMax: 8 })).rejects.toThrow('minime');
    await expect(addWorkoutExercise('seed-tpl-A', ex.id, { targetSets: 0 })).rejects.toThrow('serie');
  });

  it('eliminazione scheda rimuove i suoi esercizi e i suoi override', async () => {
    await setOverride(SEED_PROGRAM_ID, '2026-09-16', 'seed-tpl-A');
    await deleteTemplate('seed-tpl-B');
    expect((await listTemplates(SEED_PROGRAM_ID)).map((t) => t.code)).toEqual(['A']);
    expect(await listWorkoutExercises('seed-tpl-B')).toEqual([]);
    await setOverride(SEED_PROGRAM_ID, '2026-09-18', null);
    const input = await getPlanInput(SEED_PROGRAM_ID, '2026-09-14');
    expect(input!.overrides).toHaveLength(2);
    await expect(setOverride(SEED_PROGRAM_ID, '2026-09-20', 'seed-tpl-B')).rejects.toThrow();
  });
});

describe('esercizi', () => {
  it('un esercizio con storico si disattiva ma non si elimina', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: 'seed-tpl-A' }, at('2026-09-14', 18));
    const chest = await exerciseInSession(s.id, 'seed-ex-chest-press');
    await completeSet(chest.sets[0].id, { weightKg: 70, reps: 10 });
    await expect(deleteExercise('seed-ex-chest-press')).rejects.toThrow('storico');
    await updateExercise('seed-ex-chest-press', { active: false });
    expect((await listExercises()).some((e) => e.id === 'seed-ex-chest-press')).toBe(false);
    expect((await listExercises({ includeInactive: true })).some((e) => e.id === 'seed-ex-chest-press')).toBe(true);

    const fresh = await createExercise({ name: 'Hip thrust', muscleGroup: 'Gambe/Glutei', kind: 'strength' });
    await addWorkoutExercise('seed-tpl-B', fresh.id);
    await deleteExercise(fresh.id);
    expect((await listWorkoutExercises('seed-tpl-B')).some((w) => w.exerciseId === fresh.id)).toBe(false);
  });

  it('nome obbligatorio; cardio con campi predefiniti', async () => {
    await expect(createExercise({ name: '  ', muscleGroup: 'Altro', kind: 'strength' })).rejects.toThrow('obbligatorio');
    const bike = await createExercise({ name: 'Cyclette', muscleGroup: 'Cardio', kind: 'cardio' });
    expect(bike.cardioFields).toEqual(['durationSec', 'distanceKm', 'calories']);
  });
});

describe('calendario con override', () => {
  it('modificare una data non modifica il programma', async () => {
    await setOverride(SEED_PROGRAM_ID, '2026-09-16', 'seed-tpl-A');
    let input = await getPlanInput(SEED_PROGRAM_ID, '2026-09-14');
    let plan = buildPlan(input!, '2026-09-14', '2026-09-18');
    expect(plan.map((e) => e.templateId)).toEqual(['seed-tpl-A', 'seed-tpl-A', 'seed-tpl-B']);
    await clearOverride(SEED_PROGRAM_ID, '2026-09-16');
    input = await getPlanInput(SEED_PROGRAM_ID, '2026-09-14');
    plan = buildPlan(input!, '2026-09-14', '2026-09-18');
    expect(plan.map((e) => e.templateId)).toEqual(['seed-tpl-A', 'seed-tpl-B', 'seed-tpl-A']);
    expect(input!.templates.map((t) => t.code)).toEqual(['A', 'B']);
  });
});
