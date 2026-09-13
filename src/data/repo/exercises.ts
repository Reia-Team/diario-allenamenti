import { db } from '../db';
import { stamp } from '../ids';
import type { CardioField, Exercise, ExerciseKind, ID, ProgressionRule } from '../../domain/types';
import { isAlive, requireAlive, ValidationError } from './common';

export const MUSCLE_GROUPS = [
  'Pettorali', 'Dorso', 'Spalle', 'Bicipiti', 'Tricipiti', 'Gambe/Glutei', 'Polpacci', 'Addome', 'Cardio', 'Total body', 'Altro',
];

export const DEFAULT_CARDIO_FIELDS: CardioField[] = ['durationSec', 'distanceKm', 'calories'];

export async function listExercises(opts: { includeInactive?: boolean } = {}): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  return all
    .filter((e) => isAlive(e) && (opts.includeInactive || e.active))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

export async function getExercise(id: ID): Promise<Exercise | undefined> {
  const e = await db.exercises.get(id);
  return isAlive(e) ? e : undefined;
}

export interface ExerciseInput {
  name: string;
  muscleGroup: string;
  kind: ExerciseKind;
  description?: string;
  notes?: string;
  cardioFields?: CardioField[];
  progression?: ProgressionRule | null;
}

function validate(input: Partial<ExerciseInput>) {
  if (input.name !== undefined && !input.name.trim()) throw new ValidationError('Il nome dell’esercizio è obbligatorio.');
}

export async function createExercise(input: ExerciseInput, now = Date.now()): Promise<Exercise> {
  validate(input);
  const exercise: Exercise = {
    ...stamp(now),
    name: input.name.trim(),
    muscleGroup: input.muscleGroup.trim() || 'Altro',
    description: input.description ?? '',
    kind: input.kind,
    cardioFields: input.kind === 'cardio' ? (input.cardioFields?.length ? input.cardioFields : DEFAULT_CARDIO_FIELDS) : [],
    imageUrl: null,
    notes: input.notes ?? '',
    active: true,
    progression: input.progression ?? null,
  };
  await db.exercises.add(exercise);
  return exercise;
}

export async function updateExercise(id: ID, patch: Partial<Omit<Exercise, 'id' | 'createdAt'>>, now = Date.now()) {
  validate(patch as Partial<ExerciseInput>);
  await db.transaction('rw', db.exercises, async () => {
    const current = requireAlive(await db.exercises.get(id), 'Esercizio');
    const next = { ...current, ...patch, updatedAt: now };
    if (patch.name !== undefined) next.name = patch.name.trim();
    if (next.kind === 'cardio' && !next.cardioFields.length) next.cardioFields = DEFAULT_CARDIO_FIELDS;
    await db.exercises.put(next);
  });
}

export async function exerciseUsage(id: ID): Promise<{ templates: number; sets: number }> {
  const [wes, sets] = await Promise.all([
    db.workoutExercises.where('exerciseId').equals(id).toArray(),
    db.sets.where('exerciseId').equals(id).toArray(),
  ]);
  return { templates: wes.filter(isAlive).length, sets: sets.filter(isAlive).length };
}

/**
 * Un esercizio con storico non si elimina (si disattiva): i dati passati restano consultabili.
 * Un esercizio mai eseguito può essere eliminato; viene rimosso anche dalle schede.
 */
export async function deleteExercise(id: ID, now = Date.now()) {
  await db.transaction('rw', [db.exercises, db.workoutExercises, db.sets], async () => {
    const usage = await exerciseUsage(id);
    if (usage.sets > 0) {
      throw new ValidationError('Questo esercizio ha uno storico: puoi disattivarlo, ma non eliminarlo.');
    }
    const ex = requireAlive(await db.exercises.get(id), 'Esercizio');
    await db.exercises.put({ ...ex, deletedAt: now, updatedAt: now });
    const wes = await db.workoutExercises.where('exerciseId').equals(id).toArray();
    await db.workoutExercises.bulkPut(wes.filter(isAlive).map((w) => ({ ...w, deletedAt: now, updatedAt: now })));
  });
}
