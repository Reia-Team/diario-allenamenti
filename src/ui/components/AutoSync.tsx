import { useEffect } from 'react';
import { useSettings } from '../hooks';
import { getDataMode } from '../../data/db';
import { getClientId, hasValidToken } from '../../services/drive/googleAuth';
import { backupToDrive, createDriveClient, getSyncMeta, syncWithDrive } from '../../services/drive/syncService';
import { logger } from '../../services/logger';

const MIN_INTERVAL_MS = 2 * 60_000;
const DAILY_MS = 24 * 3600_000;

/**
 * Backup automatico: sincronizza quando c'è rete e un token valido (in avvio, al ritorno online,
 * quando l'app va in background e periodicamente) e crea una versione giornaliera.
 * Senza token valido non fa nulla: i dati restano al sicuro in locale.
 */
export function AutoSync() {
  const { autoBackup } = useSettings();

  useEffect(() => {
    if (!autoBackup || getDataMode() === 'demo') return;
    let running = false;
    let lastAttempt = 0;

    const attempt = async () => {
      if (running || !navigator.onLine || !getClientId() || !hasValidToken()) return;
      if (Date.now() - lastAttempt < MIN_INTERVAL_MS) return;
      running = true;
      lastAttempt = Date.now();
      try {
        const client = createDriveClient();
        await syncWithDrive(client);
        const meta = await getSyncMeta();
        if (!meta.lastBackupAt || Date.now() - meta.lastBackupAt > DAILY_MS) await backupToDrive(client);
      } catch (err) {
        logger.warn('sync', 'Sincronizzazione automatica non riuscita', err);
      } finally {
        running = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastAttempt = 0; // uscendo dall'app si prova subito a salvare
        void attempt();
      }
    };
    void attempt();
    window.addEventListener('online', attempt);
    document.addEventListener('visibilitychange', onVisibility);
    const id = setInterval(attempt, 10 * 60_000);
    return () => {
      window.removeEventListener('online', attempt);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(id);
    };
  }, [autoBackup]);

  return null;
}
