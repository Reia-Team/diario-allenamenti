import Dexie, { type Table } from 'dexie';
import type {
  Exercise, Program, ScheduleOverride, SessionExercise, SetRecord, Settings, WorkoutExercise, WorkoutSession, WorkoutTemplate,
} from '../domain/types';

/**
 * Versione dello schema IndexedDB. Ogni modifica allo schema richiede:
 * 1. incrementare DB_VERSION;
 * 2. aggiungere `this.version(N).stores({...}).upgrade(...)` mantenendo le versioni precedenti.
 */
export const DB_VERSION = 1;

/** Tabelle incluse in backup e sincronizzazione. */
export const SYNC_TABLES = [
  'programs',
  'workoutTemplates',
  'exercises',
  'workoutExercises',
  'sessions',
  'sessionExercises',
  'sets',
  'scheduleOverrides',
  'settings',
] as const;
export type SyncTableName = (typeof SYNC_TABLES)[number];

export interface MetaEntry {
  key: string;
  value: unknown;
}

/** Copia locale di sicurezza creata prima di un ripristino/importazione. */
export interface LocalSnapshot {
  id?: number;
  createdAt: number;
  reason: string;
  payload: string;
}

export class AppDB extends Dexie {
  programs!: Table<Program, string>;
  workoutTemplates!: Table<WorkoutTemplate, string>;
  exercises!: Table<Exercise, string>;
  workoutExercises!: Table<WorkoutExercise, string>;
  sessions!: Table<WorkoutSession, string>;
  sessionExercises!: Table<SessionExercise, string>;
  sets!: Table<SetRecord, string>;
  scheduleOverrides!: Table<ScheduleOverride, string>;
  settings!: Table<Settings, string>;
  meta!: Table<MetaEntry, string>;
  snapshots!: Table<LocalSnapshot, number>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      programs: 'id, status, updatedAt',
      workoutTemplates: 'id, programId, updatedAt',
      exercises: 'id, name, muscleGroup, updatedAt',
      workoutExercises: 'id, workoutTemplateId, exerciseId, updatedAt',
      sessions: 'id, date, status, programId, workoutTemplateId, startedAt, updatedAt',
      sessionExercises: 'id, sessionId, exerciseId, updatedAt',
      sets: 'id, sessionId, sessionExerciseId, exerciseId, date, updatedAt',
      scheduleOverrides: 'id, programId, date, updatedAt',
      settings: 'id',
      meta: 'key',
      snapshots: '++id, createdAt',
    });
  }

  syncTables() {
    return SYNC_TABLES.map((name) => this.table(name));
  }
}

export type DataMode = 'real' | 'demo';

export const DB_NAMES: Record<DataMode, string> = {
  real: 'diario-allenamenti',
  demo: 'diario-allenamenti-demo',
};

const MODE_KEY = 'diario-allenamenti.data-mode';

export function getDataMode(): DataMode {
  try {
    return globalThis.localStorage?.getItem(MODE_KEY) === 'demo' ? 'demo' : 'real';
  } catch {
    return 'real';
  }
}

/** Cambia database (reale/demo). Richiede il ricaricamento dell'app. */
export function setDataMode(mode: DataMode) {
  globalThis.localStorage?.setItem(MODE_KEY, mode);
}

/** Istanza attiva. I dati demo vivono in un database separato e non si mescolano mai con quelli reali. */
export let db = new AppDB(DB_NAMES[getDataMode()]);

/** Sostituisce l'istanza (usato dai test). */
export function useDatabase(instance: AppDB) {
  db = instance;
}

export type DbErrorKind = 'unsupported' | 'quota' | 'version' | 'blocked' | 'unknown';

export function classifyDbError(err: unknown): DbErrorKind {
  const name = (err as { name?: string })?.name ?? '';
  const inner = (err as { inner?: { name?: string } })?.inner?.name ?? '';
  const all = `${name} ${inner}`;
  if (/MissingAPI|InvalidState/.test(all)) return 'unsupported';
  if (/Quota/.test(all)) return 'quota';
  if (/Version/.test(all)) return 'version';
  if (/DatabaseClosed|Blocked/.test(all)) return 'blocked';
  return 'unknown';
}

export const DB_ERROR_MESSAGE: Record<DbErrorKind, string> = {
  unsupported:
    'Il browser non consente di salvare dati in locale (forse è attiva la navigazione privata). Apri l’app in una finestra normale di Chrome.',
  quota: 'Spazio di archiviazione insufficiente sul dispositivo. Libera spazio ed esporta un backup.',
  version: 'Il database è stato creato da una versione più recente dell’app. Aggiorna l’app (ricarica la pagina).',
  blocked: 'Il database è bloccato da un’altra scheda dell’app. Chiudi le altre schede e riprova.',
  unknown: 'Impossibile aprire il database locale.',
};

/** Chiede al browser di non eliminare i dati in caso di poco spazio. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
