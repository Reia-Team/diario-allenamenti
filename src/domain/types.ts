/**
 * Modello dati dell'applicazione.
 *
 * Regole fondamentali:
 * - TEMPLATE (Program, WorkoutTemplate, WorkoutExercise) = ciò che si dovrebbe fare.
 * - SESSIONE REALE (WorkoutSession, SessionExercise, SetRecord) = ciò che è stato fatto.
 *   All'avvio i target vengono copiati nella sessione: modificare una scheda non altera il passato.
 * - Un valore non registrato è `null`, mai 0.
 * - I carichi sono sempre salvati in kg; la conversione in lb avviene solo in visualizzazione.
 */

export type ID = string;
/** Data locale in formato yyyy-mm-dd. */
export type ISODate = string;

/** Campi comuni a tutti i record sincronizzabili. `deletedAt` è una tombstone. */
export interface SyncMeta {
  id: ID;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type ProgramStatus = 'active' | 'archived';

/**
 * keep_sequence: un giorno saltato non consuma la scheda (Lun A, Mer saltato, Ven B).
 * follow_calendar: ogni giorno di allenamento ha il suo slot; un giorno saltato lo consuma.
 */
export type CalendarMode = 'keep_sequence' | 'follow_calendar';

export interface ScheduleConfig {
  /** Giorni della settimana: 0 = domenica … 6 = sabato. */
  trainingDays: number[];
  startDate: ISODate;
  mode: CalendarMode;
}

export interface Program extends SyncMeta {
  name: string;
  description: string;
  status: ProgramStatus;
  schedule: ScheduleConfig;
}

export interface WorkoutTemplate extends SyncMeta {
  programId: ID;
  /** Codice breve mostrato nella sequenza (A, B, C…). */
  code: string;
  name: string;
  description: string;
  /** Posizione nella sequenza del programma (0-based). */
  position: number;
}

export type ExerciseKind = 'strength' | 'bodyweight' | 'cardio';

export type CardioField = 'durationSec' | 'distanceKm' | 'speedKmh' | 'inclinePct' | 'level' | 'calories';

export type ProgressionRuleType = 'fixed' | 'percent' | 'double' | 'maintain' | 'manual' | 'none';

export interface ProgressionRule {
  type: ProgressionRuleType;
  /** Incremento per le regole fixed/double. */
  incrementKg: number;
  /** Incremento percentuale per la regola percent. */
  percent: number;
  /** Arrotondamento del carico suggerito (es. 2,5 kg). */
  roundToKg: number;
  /** Calo di prestazione (in %) oltre il quale viene segnalato un peggioramento. */
  worseningThresholdPct: number;
}

export interface Exercise extends SyncMeta {
  name: string;
  muscleGroup: string;
  description: string;
  kind: ExerciseKind;
  /** Campi registrabili per il cardio. Ignorato per gli altri tipi. */
  cardioFields: CardioField[];
  imageUrl: string | null;
  notes: string;
  active: boolean;
  /** Regola specifica dell'esercizio; null = regola predefinita delle impostazioni. */
  progression: ProgressionRule | null;
}

export interface WorkoutExercise extends SyncMeta {
  workoutTemplateId: ID;
  exerciseId: ID;
  order: number;
  targetSets: number;
  repsMin: number | null;
  repsMax: number | null;
  restSec: number | null;
  targetDurationSec: number | null;
  notes: string;
}

export type SessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned';

export interface Pause {
  start: number;
  end: number | null;
}

export interface WorkoutSession extends SyncMeta {
  programId: ID | null;
  workoutTemplateId: ID | null;
  /** Snapshot testuale: resta leggibile anche se programma/scheda vengono rinominati o eliminati. */
  programName: string;
  templateName: string;
  templateCode: string;
  date: ISODate;
  startedAt: number;
  endedAt: number | null;
  pauses: Pause[];
  /** Durata effettiva esclusa la pausa, calcolata alla chiusura. */
  activeDurationSec: number | null;
  status: SessionStatus;
  notes: string;
  /** Indice dell'esercizio visualizzato: consente di riprendere dopo una chiusura. */
  currentIndex: number;
}

export type SessionExerciseStatus = 'pending' | 'completed' | 'partial' | 'skipped';

export interface SessionExercise extends SyncMeta {
  sessionId: ID;
  exerciseId: ID;
  workoutExerciseId: ID | null;
  order: number;
  // --- snapshot dei target al momento dell'avvio ---
  name: string;
  muscleGroup: string;
  kind: ExerciseKind;
  cardioFields: CardioField[];
  targetSets: number;
  repsMin: number | null;
  repsMax: number | null;
  restSec: number | null;
  targetDurationSec: number | null;
  templateNotes: string;
  // --- esecuzione ---
  status: SessionExerciseStatus;
  /** true se lo stato è stato impostato manualmente dall'utente. */
  statusManual: boolean;
  notes: string;
}

export interface SetRecord extends SyncMeta {
  sessionId: ID;
  sessionExerciseId: ID;
  exerciseId: ID;
  date: ISODate;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  speedKmh: number | null;
  inclinePct: number | null;
  level: number | null;
  calories: number | null;
  /** Recupero effettivo dopo questa serie. */
  restSec: number | null;
  rpe: number | null;
  rir: number | null;
  /** false = serie non registrata: esclusa da grafici e statistiche. */
  completed: boolean;
  completedAt: number | null;
  /** Dato anomalo escluso manualmente da record e statistiche. */
  excludedFromStats: boolean;
  notes: string;
}

export interface ScheduleOverride extends SyncMeta {
  programId: ID;
  date: ISODate;
  /** null = giorno di riposo forzato. */
  workoutTemplateId: ID | null;
}

export type WeightUnit = 'kg' | 'lb';
export type OneRmFormula = 'epley' | 'brzycki' | 'lombardi';
export type ThemePreference = 'dark' | 'light' | 'system';

export interface Settings extends SyncMeta {
  weightUnit: WeightUnit;
  timerSound: boolean;
  timerVibration: boolean;
  /** Volume 0..1 del segnale acustico. */
  timerVolume: number;
  timerNotification: boolean;
  defaultRestSec: number;
  defaultProgression: ProgressionRule;
  oneRmFormula: OneRmFormula;
  theme: ThemePreference;
  activeProgramId: ID | null;
  weightStepKg: number;
  keepScreenOn: boolean;
  autoBackup: boolean;
}

export const SETTINGS_ID = 'settings';
