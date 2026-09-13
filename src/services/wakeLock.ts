import { useEffect } from 'react';
import { logger } from './logger';

/**
 * Mantiene lo schermo acceso durante l'allenamento (Screen Wake Lock API).
 * Il browser rilascia il lock quando la pagina va in background: lo si richiede di nuovo al ritorno.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch (err) {
        logger.debug('wakeLock', 'Wake lock non ottenuto', err);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
