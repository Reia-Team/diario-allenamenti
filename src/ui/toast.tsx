import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { logger } from '../services/logger';
import { IconAlert, IconCheck, IconInfo } from './icons';
import { classifyDbError, DB_ERROR_MESSAGE } from '../data/db';

type Kind = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  message: string;
  kind: Kind;
}

interface ToastApi {
  show: (message: string, kind?: Kind) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const show = useCallback((message: string, kind: Kind = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-host" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.kind === 'error' ? <IconAlert /> : t.kind === 'success' ? <IconCheck /> : <IconInfo />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Messaggio comprensibile per l'utente. Gli errori tecnici vengono registrati nel log. */
export function errorMessage(err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (e?.name && ['ValidationError', 'NotFoundError', 'ActiveSessionError', 'BackupValidationError', 'DriveError'].includes(e.name)) {
    return e.message ?? 'Operazione non riuscita.';
  }
  const kind = classifyDbError(err);
  if (kind !== 'unknown') return DB_ERROR_MESSAGE[kind];
  logger.error('ui', 'Errore imprevisto', err);
  return 'Si è verificato un errore imprevisto. I dati già salvati non sono stati persi.';
}

/** Esegue un'azione asincrona mostrando un messaggio in caso di errore. */
export function useAction() {
  const { show } = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const result = await fn();
        if (success) show(success, 'success');
        return result;
      } catch (err) {
        show(errorMessage(err), 'error');
        return undefined;
      }
    },
    [show],
  );
}
