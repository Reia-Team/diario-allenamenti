import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { defaultSettings, getSettings } from '../data/repo/settings';
import type { Settings, ThemePreference } from '../domain/types';
import { restTimer, type TimerState } from '../services/timer';
import { todayISO } from '../domain/dates';

/** Impostazioni correnti (aggiornate in tempo reale). */
export function useSettings(): Settings {
  return useLiveQuery(getSettings, []) ?? defaultSettings();
}

export function useApplyTheme(theme: ThemePreference) {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1115' : '#f3f5f9');
    };
    apply();
    if (theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/** Orologio che si aggiorna periodicamente (per cronometri). */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

/** Data di oggi, aggiornata a mezzanotte e al ritorno in primo piano. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const update = () => setToday(todayISO());
    const id = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return today;
}

export function useTimerState(): TimerState {
  return useSyncExternalStore(restTimer.subscribe, restTimer.getState, restTimer.getState);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
