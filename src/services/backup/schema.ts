import { z } from 'zod';
import { isValidISODate } from '../../domain/dates';

/** Schemi di validazione dei backup: un file non conforme non tocca mai il database. */

const id = z.string().min(1).max(200);
const ts = z.number().nonnegative();
const meta = { id, createdAt: ts, updatedAt: ts, deletedAt: ts.nullable() };
const isoDate = z.string().refine(isValidISODate, 'data non valida');
const num = z.number().nullable();

const progression = z.object({
  type: z.enum(['fixed', 'percent', 'double', 'maintain', 'manual', 'none']),
  incrementKg: z.number().nonnegative(),
  percent: z.number().nonnegative(),
  roundToKg: z.number().nonnegative(),
  worseningThresholdPct: z.number().nonnegative(),
});

const cardioField = z.enum(['durationSec', 'distanceKm', 'speedKmh', 'inclinePct', 'level', 'calories']);
const kind = z.enum(['strength', 'bodyweight', 'cardio']);

export const programSchema = z.object({
  ...meta,
  name: z.string(),
  description: z.string(),
  status: z.enum(['active', 'archived']),
  schedule: z.object({
    trainingDays: z.array(z.number().int().min(0).max(6)),
    startDate: isoDate,
    mode: z.enum(['keep_sequence', 'follow_calendar']),
  }),
});

export const templateSchema = z.object({
  ...meta,
  programId: id,
  code: z.string(),
  name: z.string(),
  description: z.string(),
  position: z.number().int().nonnegative(),
});

export const exerciseSchema = z.object({
  ...meta,
  name: z.string(),
  muscleGroup: z.string(),
  description: z.string(),
  kind,
  cardioFields: z.array(cardioField),
  imageUrl: z.string().nullable(),
  notes: z.string(),
  active: z.boolean(),
  progression: progression.nullable(),
});

export const workoutExerciseSchema = z.object({
  ...meta,
  workoutTemplateId: id,
  exerciseId: id,
  order: z.number().int().nonnegative(),
  targetSets: z.number().int().min(1),
  repsMin: z.number().int().nullable(),
  repsMax: z.number().int().nullable(),
  restSec: num,
  targetDurationSec: num,
  notes: z.string(),
});

export const sessionSchema = z.object({
  ...meta,
  programId: id.nullable(),
  workoutTemplateId: id.nullable(),
  programName: z.string(),
  templateName: z.string(),
  templateCode: z.string(),
  date: isoDate,
  startedAt: ts,
  endedAt: ts.nullable(),
  pauses: z.array(z.object({ start: ts, end: ts.nullable() })),
  activeDurationSec: num,
  status: z.enum(['in_progress', 'paused', 'completed', 'abandoned']),
  notes: z.string(),
  currentIndex: z.number().int().nonnegative(),
});

export const sessionExerciseSchema = z.object({
  ...meta,
  sessionId: id,
  exerciseId: id,
  workoutExerciseId: id.nullable(),
  order: z.number().int().nonnegative(),
  name: z.string(),
  muscleGroup: z.string(),
  kind,
  cardioFields: z.array(cardioField),
  targetSets: z.number().int().nonnegative(),
  repsMin: num,
  repsMax: num,
  restSec: num,
  targetDurationSec: num,
  templateNotes: z.string(),
  status: z.enum(['pending', 'completed', 'partial', 'skipped']),
  statusManual: z.boolean(),
  notes: z.string(),
});

export const setSchema = z.object({
  ...meta,
  sessionId: id,
  sessionExerciseId: id,
  exerciseId: id,
  date: isoDate,
  setNumber: z.number().int().min(1),
  weightKg: z.number().min(0).max(2000).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
  durationSec: z.number().min(0).nullable(),
  distanceKm: z.number().min(0).nullable(),
  speedKmh: z.number().min(0).nullable(),
  inclinePct: num,
  level: num,
  calories: z.number().min(0).nullable(),
  restSec: z.number().min(0).nullable(),
  rpe: z.number().min(0).max(10).nullable(),
  rir: z.number().min(0).max(20).nullable(),
  completed: z.boolean(),
  completedAt: ts.nullable(),
  excludedFromStats: z.boolean(),
  notes: z.string(),
});

export const overrideSchema = z.object({
  ...meta,
  programId: id,
  date: isoDate,
  workoutTemplateId: id.nullable(),
});

export const settingsSchema = z.object({
  ...meta,
  id: z.literal('settings'),
  weightUnit: z.enum(['kg', 'lb']),
  timerSound: z.boolean(),
  timerVibration: z.boolean(),
  timerVolume: z.number().min(0).max(1),
  timerNotification: z.boolean(),
  defaultRestSec: z.number().min(0).max(3600),
  defaultProgression: progression,
  oneRmFormula: z.enum(['epley', 'brzycki', 'lombardi']),
  theme: z.enum(['dark', 'light', 'system']),
  activeProgramId: id.nullable(),
  weightStepKg: z.number().positive(),
  keepScreenOn: z.boolean(),
  autoBackup: z.boolean(),
});

export const backupDataSchema = z.object({
  programs: z.array(programSchema),
  workoutTemplates: z.array(templateSchema),
  exercises: z.array(exerciseSchema),
  workoutExercises: z.array(workoutExerciseSchema),
  sessions: z.array(sessionSchema),
  sessionExercises: z.array(sessionExerciseSchema),
  sets: z.array(setSchema),
  scheduleOverrides: z.array(overrideSchema),
  settings: z.array(settingsSchema).max(1),
});
