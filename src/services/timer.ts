/**
 * Timer di recupero.
 *
 * Basato su timestamp assoluti (endsAt), non su un contatore: se il browser sospende la pagina
 * (schermo spento, app in background) il tempo residuo resta corretto al ritorno.
 * Lo stato è salvato in localStorage: sopravvive a ricarica o chiusura accidentale.
 */

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface TimerState {
  status: TimerStatus;
  durationMs: number;
  /** Solo in stato running. */
  endsAt: number | null;
  /** Residuo congelato (paused) o 0 (finished). */
  remainingMs: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** Serie a cui è associato il recupero. */
  setId: string | null;
  label: string;
}

export interface RestEnded {
  setId: string | null;
  elapsedSec: number;
  reason: 'finished' | 'skipped' | 'stopped';
}

export interface TimerDeps {
  now: () => number;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export const IDLE_TIMER: TimerState = {
  status: 'idle', durationMs: 0, endsAt: null, remainingMs: 0, startedAt: null, finishedAt: null, setId: null, label: '',
};

/** Oltre questo ritardo non si suona più l'allarme (es. app riaperta dopo ore). */
const LATE_ALERT_MS = 60_000;

export class RestTimer {
  private state: TimerState = IDLE_TIMER;
  private listeners = new Set<(s: TimerState) => void>();
  private endListeners = new Set<(e: RestEnded) => void>();
  private finishListeners = new Set<(s: TimerState) => void>();
  private handle: unknown = null;

  constructor(private deps: TimerDeps, private storageKey = 'diario-allenamenti.rest-timer') {}

  getState = (): TimerState => this.state;

  remainingMs(): number {
    const s = this.state;
    if (s.status === 'running' && s.endsAt !== null) return Math.max(0, s.endsAt - this.deps.now());
    return s.remainingMs;
  }

  subscribe = (fn: (s: TimerState) => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  onRestEnded(fn: (e: RestEnded) => void) {
    this.endListeners.add(fn);
    return () => void this.endListeners.delete(fn);
  }

  /** Scadenza naturale del timer (per suono/vibrazione/notifica). */
  onFinish(fn: (s: TimerState) => void) {
    this.finishListeners.add(fn);
    return () => void this.finishListeners.delete(fn);
  }

  /** Ripristina lo stato salvato. Chiamare dopo aver registrato i listener. */
  hydrate() {
    try {
      const raw = this.deps.storage?.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as TimerState;
        if (parsed && typeof parsed.status === 'string') this.state = { ...IDLE_TIMER, ...parsed };
      }
    } catch {
      this.state = IDLE_TIMER;
    }
    this.sync();
    this.tick();
  }

  start(opts: { durationSec: number; setId?: string | null; label?: string }) {
    this.endCurrent('stopped');
    const now = this.deps.now();
    const durationMs = Math.max(0, Math.round(opts.durationSec * 1000));
    this.set({
      status: 'running', durationMs, endsAt: now + durationMs, remainingMs: durationMs, startedAt: now,
      finishedAt: null, setId: opts.setId ?? null, label: opts.label ?? '',
    });
    this.tick();
  }

  pause() {
    const s = this.state;
    if (s.status !== 'running' || s.endsAt === null) return;
    this.set({ ...s, status: 'paused', remainingMs: Math.max(0, s.endsAt - this.deps.now()), endsAt: null });
  }

  resume() {
    const s = this.state;
    if (s.status !== 'paused') return;
    this.set({ ...s, status: 'running', endsAt: this.deps.now() + s.remainingMs });
  }

  addSeconds(sec: number) {
    const s = this.state;
    const delta = sec * 1000;
    if (s.status === 'running' && s.endsAt !== null) {
      this.set({ ...s, endsAt: s.endsAt + delta, durationMs: s.durationMs + delta });
    } else if (s.status === 'paused') {
      this.set({ ...s, remainingMs: s.remainingMs + delta, durationMs: s.durationMs + delta });
    } else if (s.status === 'finished') {
      const now = this.deps.now();
      this.set({ ...s, status: 'running', endsAt: now + delta, remainingMs: delta, durationMs: s.durationMs + delta, finishedAt: null });
    }
  }

  /** Salta il recupero rimanente. */
  skip() {
    this.endCurrent('skipped');
    this.set(IDLE_TIMER);
  }

  /** Ferma e chiude il timer. */
  stop() {
    this.endCurrent('stopped');
    this.set(IDLE_TIMER);
  }

  /** Chiude la notifica "recupero terminato". */
  dismiss() {
    if (this.state.status === 'finished') this.set(IDLE_TIMER);
  }

  tick() {
    const s = this.state;
    if (s.status !== 'running' || s.endsAt === null) return;
    const now = this.deps.now();
    if (now < s.endsAt) {
      this.emit();
      return;
    }
    const finished: TimerState = { ...s, status: 'finished', remainingMs: 0, endsAt: null, finishedAt: s.endsAt };
    this.set(finished);
    this.emitEnded({ setId: s.setId, elapsedSec: Math.round((s.endsAt - (s.startedAt ?? s.endsAt)) / 1000), reason: 'finished' });
    if (now - s.endsAt <= LATE_ALERT_MS) for (const fn of this.finishListeners) fn(finished);
  }

  private endCurrent(reason: RestEnded['reason']) {
    const s = this.state;
    if ((s.status === 'running' || s.status === 'paused') && s.startedAt !== null) {
      this.emitEnded({ setId: s.setId, elapsedSec: Math.round((this.deps.now() - s.startedAt) / 1000), reason });
    }
  }

  private emitEnded(e: RestEnded) {
    for (const fn of this.endListeners) fn(e);
  }

  private set(next: TimerState) {
    this.state = next;
    try {
      if (next.status === 'idle') this.deps.storage?.removeItem(this.storageKey);
      else this.deps.storage?.setItem(this.storageKey, JSON.stringify(next));
    } catch {
      // storage pieno o non disponibile: il timer funziona comunque in memoria
    }
    this.sync();
    this.emit();
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  private sync() {
    const running = this.state.status === 'running';
    if (running && this.handle === null) this.handle = this.deps.setInterval(() => this.tick(), 250);
    if (!running && this.handle !== null) {
      this.deps.clearInterval(this.handle);
      this.handle = null;
    }
  }
}

function browserStorage(): TimerDeps['storage'] {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const restTimer = new RestTimer({
  now: () => Date.now(),
  storage: browserStorage(),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as number),
});
