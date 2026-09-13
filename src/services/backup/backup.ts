import { db as defaultDb, DB_VERSION, SYNC_TABLES, type AppDB, type SyncTableName } from '../../data/db';
import { newId } from '../../data/ids';
import type {
  Exercise, Program, ScheduleOverride, SessionExercise, SetRecord, Settings, SyncMeta, WorkoutExercise, WorkoutSession, WorkoutTemplate,
} from '../../domain/types';
import { backupDataSchema } from './schema';
import { mergeData, type MergeStats } from './merge';

export const BACKUP_FORMAT = 'diario-allenamenti-backup';
/** Versione del formato del file di backup (indipendente dalla versione del DB). */
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupData {
  programs: Program[];
  workoutTemplates: WorkoutTemplate[];
  exercises: Exercise[];
  workoutExercises: WorkoutExercise[];
  sessions: WorkoutSession[];
  sessionExercises: SessionExercise[];
  sets: SetRecord[];
  scheduleOverrides: ScheduleOverride[];
  settings: Settings[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  dbVersion: number;
  exportedAt: number;
  deviceId: string;
  data: BackupData;
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

const appVersion = () => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev');

export async function getDeviceId(database: AppDB = defaultDb): Promise<string> {
  const existing = await database.meta.get('deviceId');
  if (typeof existing?.value === 'string') return existing.value;
  const id = newId();
  await database.meta.put({ key: 'deviceId', value: id });
  return id;
}

export async function readAllData(database: AppDB = defaultDb): Promise<BackupData> {
  const entries = await Promise.all(SYNC_TABLES.map(async (t) => [t, await database.table(t).toArray()] as const));
  return Object.fromEntries(entries) as unknown as BackupData;
}

export async function createBackup(database: AppDB = defaultDb, now = Date.now()): Promise<BackupFile> {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: appVersion(),
    dbVersion: DB_VERSION,
    exportedAt: now,
    deviceId: await getDeviceId(database),
    data: await readAllData(database),
  };
}

/** Migrazioni del formato: oggi esiste solo la v1. */
function migrate(obj: Record<string, unknown>): Record<string, unknown> {
  return obj;
}

function checkIntegrity(data: BackupData): string[] {
  const problems: string[] = [];
  for (const table of SYNC_TABLES) {
    const seen = new Set<string>();
    for (const r of data[table] as SyncMeta[]) {
      if (seen.has(r.id)) problems.push(`${table}: id duplicato ${r.id}`);
      seen.add(r.id);
    }
  }
  const ids = (list: SyncMeta[]) => new Set(list.map((r) => r.id));
  const programs = ids(data.programs);
  const templates = ids(data.workoutTemplates);
  const exercises = ids(data.exercises);
  const sessions = ids(data.sessions);
  const sessionExercises = ids(data.sessionExercises);
  const alive = <T extends SyncMeta>(list: T[]) => list.filter((r) => r.deletedAt === null);

  for (const t of alive(data.workoutTemplates)) if (!programs.has(t.programId)) problems.push(`scheda ${t.id}: programma mancante`);
  for (const w of alive(data.workoutExercises)) {
    if (!templates.has(w.workoutTemplateId)) problems.push(`esercizio di scheda ${w.id}: scheda mancante`);
    if (!exercises.has(w.exerciseId)) problems.push(`esercizio di scheda ${w.id}: esercizio mancante`);
  }
  for (const se of alive(data.sessionExercises)) if (!sessions.has(se.sessionId)) problems.push(`esercizio di sessione ${se.id}: sessione mancante`);
  for (const s of alive(data.sets)) {
    if (!sessions.has(s.sessionId)) problems.push(`serie ${s.id}: sessione mancante`);
    if (!sessionExercises.has(s.sessionExerciseId)) problems.push(`serie ${s.id}: esercizio di sessione mancante`);
  }
  for (const o of alive(data.scheduleOverrides)) if (!programs.has(o.programId)) problems.push(`calendario ${o.id}: programma mancante`);
  return problems;
}

/** Valida un oggetto già decodificato. Solleva BackupValidationError con un messaggio comprensibile. */
export function validateBackupObject(input: unknown): BackupFile {
  if (!input || typeof input !== 'object') throw new BackupValidationError('Il file non contiene un backup valido.');
  let obj = input as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) throw new BackupValidationError('Il file non è un backup di Diario Allenamenti.');
  const version = obj.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BackupValidationError('Versione del backup non riconosciuta.');
  }
  if (version > BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError('Il backup è stato creato da una versione più recente dell’app: aggiorna l’app prima di importarlo.');
  }
  obj = migrate(obj);
  const parsed = backupDataSchema.safeParse(obj.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') ?? '';
    throw new BackupValidationError(`Backup danneggiato o incompleto (${where}: ${issue?.message ?? 'dato non valido'}). Nessun dato è stato modificato.`);
  }
  const data = parsed.data as unknown as BackupData;
  const problems = checkIntegrity(data);
  if (problems.length) {
    throw new BackupValidationError(`Backup incoerente: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? '…' : ''}. Nessun dato è stato modificato.`);
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : 'sconosciuta',
    dbVersion: typeof obj.dbVersion === 'number' ? obj.dbVersion : 0,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : 0,
    deviceId: typeof obj.deviceId === 'string' ? obj.deviceId : '',
    data,
  };
}

export function parseBackup(text: string): BackupFile {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new BackupValidationError('Il file non è un JSON valido (forse è danneggiato o incompleto). Nessun dato è stato modificato.');
  }
  return validateBackupObject(obj);
}

export function summarizeBackup(b: BackupFile) {
  const alive = <T extends SyncMeta>(l: T[]) => l.filter((r) => r.deletedAt === null).length;
  return {
    exportedAt: b.exportedAt,
    appVersion: b.appVersion,
    programs: alive(b.data.programs),
    exercises: alive(b.data.exercises),
    sessions: b.data.sessions.filter((s) => s.deletedAt === null && s.status === 'completed').length,
    sets: b.data.sets.filter((s) => s.deletedAt === null && s.completed).length,
  };
}

const MAX_SNAPSHOTS = 5;

/** Copia di sicurezza locale, creata automaticamente prima di ogni sostituzione dei dati. */
export async function createLocalSnapshot(reason: string, database: AppDB = defaultDb, now = Date.now()) {
  const backup = await createBackup(database, now);
  await database.snapshots.add({ createdAt: now, reason, payload: JSON.stringify(backup) });
  const all = await database.snapshots.orderBy('createdAt').toArray();
  const excess = all.slice(0, Math.max(0, all.length - MAX_SNAPSHOTS));
  await database.snapshots.bulkDelete(excess.map((s) => s.id!));
}

export async function listLocalSnapshots(database: AppDB = defaultDb) {
  const all = await database.snapshots.orderBy('createdAt').reverse().toArray();
  return all.map((s) => ({ id: s.id!, createdAt: s.createdAt, reason: s.reason, size: s.payload.length }));
}

async function writeAll(data: BackupData, database: AppDB) {
  await database.transaction('rw', [...database.syncTables(), database.meta], async () => {
    for (const table of SYNC_TABLES) {
      await database.table(table).clear();
      await database.table(table).bulkPut(data[table]);
    }
    await database.meta.put({ key: 'seeded', value: Date.now() });
  });
}

/**
 * Sostituisce tutti i dati locali con quelli del backup (già validato).
 * Prima crea una copia di sicurezza; la scrittura è atomica (tutto o niente).
 */
export async function replaceAllData(backup: BackupFile, reason: string, database: AppDB = defaultDb) {
  await createLocalSnapshot(reason, database);
  await writeAll(backup.data, database);
}

export async function restoreLocalSnapshot(id: number, database: AppDB = defaultDb) {
  const snap = await database.snapshots.get(id);
  if (!snap) throw new BackupValidationError('Copia di sicurezza non trovata.');
  const backup = parseBackup(snap.payload);
  await createLocalSnapshot('Prima del ripristino di una copia locale', database);
  await writeAll(backup.data, database);
}

/**
 * Scrive in locale i record remoti più recenti. Ogni record viene riletto dentro la transazione:
 * una modifica fatta nel frattempo (es. una serie registrata durante la sincronizzazione) non viene sovrascritta.
 */
export async function applyRemoteRecords(records: Partial<Record<SyncTableName, SyncMeta[]>>, database: AppDB = defaultDb) {
  await database.transaction('rw', database.syncTables(), async () => {
    for (const [table, list] of Object.entries(records) as [SyncTableName, SyncMeta[]][]) {
      const t = database.table<SyncMeta, string>(table);
      const current = await t.bulkGet(list.map((r) => r.id));
      const writes = list.filter((r, i) => !current[i] || r.updatedAt >= current[i]!.updatedAt);
      await t.bulkPut(writes);
    }
  });
}

/** Unisce un backup ai dati locali (nessun duplicato: i record sono identificati per id). */
export async function mergeBackupIntoLocal(backup: BackupFile, database: AppDB = defaultDb): Promise<MergeStats> {
  const local = await readAllData(database);
  const result = mergeData(local, backup.data, null);
  await createLocalSnapshot('Prima dell’unione di un backup', database);
  await applyRemoteRecords(result.toWriteLocal, database);
  return result.stats;
}
