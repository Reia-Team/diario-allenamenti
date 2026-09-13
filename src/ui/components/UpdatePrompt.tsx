import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { logger } from '../../services/logger';
import { useToast } from '../toast';

/**
 * Registrazione del service worker. Un aggiornamento non viene mai applicato da solo:
 * ricaricare durante un allenamento sarebbe fastidioso (i dati comunque sono già salvati).
 */
export function UpdatePrompt() {
  const { show } = useToast();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Controllo periodico di nuove versioni quando l'app resta aperta a lungo.
      if (registration) setInterval(() => void registration.update().catch(() => {}), 60 * 60 * 1000);
    },
    onRegisterError(err) {
      logger.warn('pwa', 'Service worker non registrato', err);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      show('App pronta per l’uso offline', 'success');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, show]);

  if (!needRefresh) return null;
  return (
    <div className="toast-host" style={{ bottom: 'calc(var(--nav-h) + 80px + var(--safe-b))' }}>
      <div className="toast" role="status">
        <span className="grow">Nuova versione disponibile. I dati restano salvati.</span>
        <button type="button" className="btn sm" onClick={() => setNeedRefresh(false)}>Dopo</button>
        <button type="button" className="btn sm primary" onClick={() => void updateServiceWorker(true)}>Aggiorna</button>
      </div>
    </div>
  );
}
