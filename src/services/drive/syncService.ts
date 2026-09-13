import { db as defaultDb, type AppDB } from '../../data/db';
import { logger } from '../logger';
import {
  applyRemoteRecords, BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BackupValidationError, createBackup, parseBackup, readAllData, replaceAllData,
  summarizeBackup, validateBackupObject, type BackupFile,
} from '../backup/backup';
import { mergeData, type MergeStats } from '../backup/merge';
import { DriveClient, DriveError, type DriveFile } from './driveApi';
import { clearToken, getAccessToken } from './googleAuth';
import { DB_VERSION } from '../../data/db';

/**
 * Sincronizzazione e backup su Google Drive.
 *
 * - `sync.json`: stato corrente unito tra dispositivi (merge per id, last-write-wins, tombstone).
 * - `backup-AAAAMMGG-HHMMSS.json`: versioni complete, conservate le ultime MAX_BACKUPS.
 * Il database locale resta la fonte primaria: se Drive non è raggiungibile nulla viene perso.
 */

export const SYNC_FILE = 'sync.json';
export const BACKUP_PREFIX = 'backup-';
export const MAX_BACKUPS = 10;

export function createDriveClient(): DriveClient {
  return new DriveClient(getAccessToken, undefined, clearToken);
}

export interface SyncMeta {
  lastSyncAt: number | null;
  lastBackupAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
}

async function metaValue<T>(database: AppDB, key: string): Promise<T | null> {
  return ((await database.meta.get(key))?.value as T | undefined) ?? null;
}

export async function getSyncMeta(database: AppDB = defaultDb): Promise<SyncMeta> {
  const [lastSyncAt, lastBackupAt, lastError, lastErrorAt] = await Promise.all([
    metaValue<number>(database, 'lastSyncAt'),
    metaValue<number>(database, 'lastBackupAt'),
    metaValue<string>(database, 'lastSyncError'),
    metaValue<number>(database, 'lastSyncErrorAt'),
  ]);
  return { lastSyncAt, lastBackupAt, lastError, lastErrorAt };
}

export async function recordSyncError(err: unknown, database: AppDB = defaultDb) {
  const message = err instanceof Error ? err.message : 'Errore sconosciuto';
  await database.meta.bulkPut([
    { key: 'lastSyncError', value: message },
    { key: 'lastSyncErrorAt', value: Date.now() },
  ]);
}

/** Numero di record modificati localmente dopo l'ultima sincronizzazione. */
export async function countPendingChanges(database: AppDB = defaultDb): Promise<number> {
  const lastSyncAt = (await metaValue<number>(database, 'lastSyncAt')) ?? 0;
  let count = 0;
  for (const t of database.syncTables()) {
    try {
      count += await t.filter((r: { updatedAt: number }) => r.updatedAt > lastSyncAt).count();
    } catch {
      // tabella non leggibile: il conteggio è solo indicativo
    }
  }
  return count;
}

function backupName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${BACKUP_PREFIX}${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
}

export interface SyncResult {
  stats: MergeStats;
  uploaded: boolean;
  at: number;
}

export async function syncWithDrive(client: DriveClient, database: AppDB = defaultDb, now = Date.now()): Promise<SyncResult> {
  try {
    const lastSyncAt = await metaValue<number>(database, 'lastSyncAt');
    const remoteFile = await client.findByName(SYNC_FILE);
    const local = await readAllData(database);
    let stats: MergeStats = { added: 0, updated: 0, deleted: 0, conflicts: 0 };
    let upload = !remoteFile;
    let mergedData = local;

    if (remoteFile) {
      let remote: BackupFile;
      try {
        remote = validateBackupObject(JSON.parse(await client.download(remoteFile.id)));
      } catch (err) {
        if (err instanceof DriveError) throw err;
        logger.error('sync', 'File di sincronizzazione remoto non valido', err);
        throw new DriveError(
          'invalid',
          err instanceof BackupValidationError && /più recente/.test(err.message)
            ? err.message
            : 'Il file di sincronizzazione su Drive non è valido: nessun dato locale è stato modificato.',
        );
      }
      const merge = mergeData(local, remote.data, lastSyncAt);
      await applyRemoteRecords(merge.toWriteLocal, database);
      stats = merge.stats;
      upload = merge.remoteChanged;
      mergedData = merge.merged;
    }

    if (upload) {
      const file: BackupFile = {
        ...(await createBackup(database, now)),
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        dbVersion: DB_VERSION,
        data: mergedData,
      };
      const content = JSON.stringify(file);
      if (remoteFile) await client.update(remoteFile.id, content);
      else await client.create(SYNC_FILE, content);
    }

    await database.meta.bulkPut([
      { key: 'lastSyncAt', value: now },
      { key: 'lastSyncError', value: null },
    ]);
    if (stats.conflicts) logger.warn('sync', `Conflitti risolti (vince la modifica più recente): ${stats.conflicts}`);
    return { stats, uploaded: upload, at: now };
  } catch (err) {
    await recordSyncError(err, database);
    throw err;
  }
}

/** Crea una nuova versione di backup su Drive e conserva solo le più recenti. */
export async function backupToDrive(client: DriveClient, database: AppDB = defaultDb, now = Date.now()): Promise<DriveFile> {
  try {
    const backup = await createBackup(database, now);
    const file = await client.create(backupName(now), JSON.stringify(backup));
    const backups = await listDriveBackups(client);
    for (const old of backups.slice(MAX_BACKUPS)) {
      await client.remove(old.id).catch((err) => logger.warn('sync', 'Backup vecchio non eliminato', err));
    }
    await database.meta.put({ key: 'lastBackupAt', value: now });
    return file;
  } catch (err) {
    await recordSyncError(err, database);
    throw err;
  }
}

export async function listDriveBackups(client: DriveClient): Promise<DriveFile[]> {
  const files = await client.listFiles();
  return files.filter((f) => f.name.startsWith(BACKUP_PREFIX)).sort((a, b) => b.name.localeCompare(a.name));
}

export async function downloadDriveBackup(client: DriveClient, fileId: string): Promise<BackupFile> {
  return parseBackup(await client.download(fileId));
}

/** Ripristino completo da una versione su Drive (con copia locale di sicurezza). */
export async function restoreFromDrive(client: DriveClient, fileId: string, database: AppDB = defaultDb) {
  const backup = await downloadDriveBackup(client, fileId);
  await replaceAllData(backup, 'Prima del ripristino da Google Drive', database);
  // Dopo un ripristino la prossima sincronizzazione deve ripartire dallo stato ripristinato.
  await database.meta.put({ key: 'lastSyncAt', value: null });
  return summarizeBackup(backup);
}
