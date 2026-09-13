import type { SyncMeta } from '../../domain/types';
import { SYNC_TABLES, type SyncTableName } from '../../data/db';
import type { BackupData } from './backup';

export interface MergeStats {
  added: number;
  updated: number;
  deleted: number;
  conflicts: number;
}

export interface TableMerge<T extends SyncMeta> {
  merged: T[];
  /** Record remoti da scrivere in locale. */
  toWriteLocal: T[];
  /** Il remoto non contiene lo stato unito (serve un upload). */
  remoteChanged: boolean;
  stats: MergeStats;
}

/**
 * Unione per id con regola last-write-wins su `updatedAt`.
 * Le cancellazioni sono tombstone (deletedAt) e si propagano come normali modifiche.
 * Un conflitto = record modificato su entrambi i lati dopo l'ultima sincronizzazione:
 * vince la modifica più recente e il conflitto viene conteggiato.
 */
export function mergeRecords<T extends SyncMeta>(local: T[], remote: T[], lastSyncAt: number | null): TableMerge<T> {
  const localMap = new Map(local.map((r) => [r.id, r]));
  const remoteMap = new Map(remote.map((r) => [r.id, r]));
  const ids = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const result: TableMerge<T> = { merged: [], toWriteLocal: [], remoteChanged: false, stats: { added: 0, updated: 0, deleted: 0, conflicts: 0 } };
  const changedSince = (r: T) => lastSyncAt !== null && r.updatedAt > lastSyncAt;

  for (const id of ids) {
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    if (l && !r) {
      result.merged.push(l);
      result.remoteChanged = true;
      continue;
    }
    if (r && !l) {
      result.merged.push(r);
      result.toWriteLocal.push(r);
      if (r.deletedAt === null) result.stats.added++;
      continue;
    }
    if (!l || !r) continue;
    let winner: T;
    if (r.updatedAt > l.updatedAt) winner = r;
    else if (l.updatedAt > r.updatedAt) winner = l;
    else {
      const ls = JSON.stringify(l);
      const rs = JSON.stringify(r);
      if (ls === rs) {
        result.merged.push(l);
        continue;
      }
      winner = rs > ls ? r : l; // pareggio: scelta deterministica, uguale su tutti i dispositivi
    }
    if (changedSince(l) && changedSince(r)) result.stats.conflicts++;
    result.merged.push(winner);
    if (winner === r) {
      result.toWriteLocal.push(r);
      if (r.deletedAt !== null && l.deletedAt === null) result.stats.deleted++;
      else result.stats.updated++;
    } else {
      result.remoteChanged = true;
    }
  }
  return result;
}

export interface DataMerge {
  merged: BackupData;
  toWriteLocal: Partial<Record<SyncTableName, SyncMeta[]>>;
  remoteChanged: boolean;
  stats: MergeStats;
}

export function mergeData(local: BackupData, remote: BackupData, lastSyncAt: number | null): DataMerge {
  const merged = {} as Record<SyncTableName, SyncMeta[]>;
  const toWriteLocal: DataMerge['toWriteLocal'] = {};
  const stats: MergeStats = { added: 0, updated: 0, deleted: 0, conflicts: 0 };
  let remoteChanged = false;
  for (const table of SYNC_TABLES) {
    const m = mergeRecords<SyncMeta>(local[table], remote[table], lastSyncAt);
    merged[table] = m.merged;
    if (m.toWriteLocal.length) toWriteLocal[table] = m.toWriteLocal;
    remoteChanged ||= m.remoteChanged;
    stats.added += m.stats.added;
    stats.updated += m.stats.updated;
    stats.deleted += m.stats.deleted;
    stats.conflicts += m.stats.conflicts;
  }
  return { merged: merged as unknown as BackupData, toWriteLocal, remoteChanged, stats };
}
