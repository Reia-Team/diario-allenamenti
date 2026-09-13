import { logger } from './logger';

/**
 * Feedback di fine recupero: suono (Web Audio, nessun file da scaricare), vibrazione, notifica.
 * Limiti del browser: l'audio richiede un'interazione utente precedente (sblocco),
 * la vibrazione non esiste su iOS, le notifiche richiedono il permesso.
 */

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function audioCtor(): AudioCtor | null {
  const w = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Da chiamare in un gestore di tocco (es. "Fine serie") per consentire il suono successivo. */
export function unlockAudio() {
  const Ctor = audioCtor();
  if (!Ctor) return;
  try {
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch (err) {
    logger.warn('feedback', 'Audio non disponibile', err);
  }
}

export function beep(volume = 0.8, pulses = 3) {
  unlockAudio();
  if (!ctx) return;
  const gainValue = Math.max(0, Math.min(1, volume));
  if (gainValue === 0) return;
  const start = ctx.currentTime + 0.02;
  for (let i = 0; i < pulses; i++) {
    const t = start + i * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = i === pulses - 1 ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(gainValue * 0.5, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }
}

export function vibrate(pattern: number | number[] = [400, 150, 400, 150, 600]): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? navigator.vibrate(pattern) : false;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export async function showNotification(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag: 'rest-timer', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    else new Notification(title, { body, tag: 'rest-timer' });
  } catch (err) {
    logger.warn('feedback', 'Notifica non mostrata', err);
  }
}

export function deviceCapabilities() {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return {
    vibration: !!nav && typeof nav.vibrate === 'function',
    audio: audioCtor() !== null,
    wakeLock: !!nav && 'wakeLock' in nav,
    notifications: typeof Notification !== 'undefined',
    serviceWorker: !!nav && 'serviceWorker' in nav,
    storagePersist: !!nav?.storage?.persist,
  };
}
