import { logger } from '../logger';

/**
 * Autenticazione Google tramite Google Identity Services (modello "token", OAuth 2.0 lato client).
 * - Scope minimo: drive.appdata (l'app vede solo i propri file, in una cartella nascosta di Drive).
 * - Il token di accesso resta SOLO in memoria: nessuna credenziale viene salvata.
 * - Disconnessione = revoca del token presso Google.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID_KEY = 'diario-allenamenti.google-client-id';
const CONNECTED_KEY = 'diario-allenamenti.google-connected';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string; message?: string }) => void;
  }): { requestAccessToken(opts?: { prompt?: string }): void };
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export class AuthError extends Error {
  constructor(message: string, public code: 'no_client_id' | 'offline' | 'load_failed' | 'denied' | 'popup' | 'unknown') {
    super(message);
    this.name = 'DriveError';
  }
}

let token: { value: string; expiresAt: number } | null = null;
let gisPromise: Promise<GoogleOAuth2> | null = null;

/**
 * Client ID OAuth dell'app pubblicata (progetto Google Cloud «diario-allenamenti").
 * Non è un segreto: identifica l'app presso Google ed è valido solo per le origini autorizzate.
 */
export const BUILT_IN_CLIENT_ID = '998510680132-m1c29opu3fpo1hfd6lgs3jrd4do4onh6.apps.googleusercontent.com';

function storedClientId(): string | null {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) || null;
  } catch {
    return null;
  }
}

/** Priorità: variabile di build → Client ID inserito dall'utente → Client ID integrato. */
export function getClientId(): string | null {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || storedClientId() || BUILT_IN_CLIENT_ID || null;
}

/** true se il Client ID non è stato inserito a mano (nessun campo da mostrare in Impostazioni). */
export function isClientIdBuiltIn(): boolean {
  return !storedClientId();
}

export function setClientId(id: string) {
  const v = id.trim();
  if (v) localStorage.setItem(CLIENT_ID_KEY, v);
  else localStorage.removeItem(CLIENT_ID_KEY);
}

export function getAccessToken(): string | null {
  if (!token || Date.now() > token.expiresAt - 60_000) return null;
  return token.value;
}

export function hasValidToken(): boolean {
  return getAccessToken() !== null;
}

/** L'utente ha già autorizzato l'app in passato (il token no: va richiesto a ogni avvio). */
export function wasConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearToken() {
  token = null;
}

function loadGis(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('GIS non inizializzato')));
    script.onerror = () => reject(new Error('Script Google non caricato'));
    document.head.appendChild(script);
  }).catch((err) => {
    gisPromise = null;
    throw err;
  });
  return gisPromise;
}

/**
 * Richiede un token di accesso. Va chiamata da un gesto dell'utente (tocco),
 * altrimenti il browser può bloccare la finestra di Google.
 */
export async function signIn(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new AuthError('Configura prima il Client ID OAuth di Google (vedi README).', 'no_client_id');
  if (!navigator.onLine) throw new AuthError('Sei offline: collegati a Internet per accedere a Google Drive.', 'offline');
  let oauth2: GoogleOAuth2;
  try {
    oauth2 = await loadGis();
  } catch (err) {
    logger.warn('drive', 'Caricamento Google Identity Services fallito', err);
    throw new AuthError('Impossibile contattare Google. Controlla la connessione e riprova.', 'load_failed');
  }
  await new Promise<void>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new AuthError(r.error === 'access_denied' ? 'Autorizzazione negata.' : `Accesso non riuscito (${r.error_description ?? r.error ?? 'errore'}).`, 'denied'));
          return;
        }
        token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
        try {
          localStorage.setItem(CONNECTED_KEY, '1');
        } catch {
          // non essenziale
        }
        resolve();
      },
      error_callback: (e) => {
        reject(new AuthError(e.type === 'popup_closed' ? 'Finestra di accesso chiusa.' : 'La finestra di accesso di Google è stata bloccata o chiusa.', 'popup'));
      },
    });
    client.requestAccessToken({ prompt: wasConnected() ? '' : 'consent' });
  });
}

/** Disconnette e revoca l'accesso dell'app all'account Google. */
export async function signOut(): Promise<void> {
  const current = token?.value;
  token = null;
  try {
    localStorage.removeItem(CONNECTED_KEY);
  } catch {
    // ignora
  }
  if (!current) return;
  try {
    const oauth2 = await loadGis();
    await new Promise<void>((resolve) => oauth2.revoke(current, () => resolve()));
  } catch (err) {
    logger.warn('drive', 'Revoca token non completata', err);
  }
}
