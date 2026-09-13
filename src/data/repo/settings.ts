import { db } from '../db';
import { SETTINGS_ID, type Settings } from '../../domain/types';
import { DEFAULT_PROGRESSION } from '../../domain/progression';

export function defaultSettings(): Settings {
  return {
    id: SETTINGS_ID,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    weightUnit: 'kg',
    timerSound: true,
    timerVibration: true,
    timerVolume: 0.8,
    timerNotification: false,
    defaultRestSec: 90,
    defaultProgression: { ...DEFAULT_PROGRESSION },
    oneRmFormula: 'epley',
    theme: 'dark',
    activeProgramId: null,
    weightStepKg: 2.5,
    keepScreenOn: true,
    autoBackup: false,
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get(SETTINGS_ID);
  const defaults = defaultSettings();
  return stored ? { ...defaults, ...stored, defaultProgression: { ...defaults.defaultProgression, ...stored.defaultProgression } } : defaults;
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>, now = Date.now()): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const current = await getSettings();
    const next: Settings = { ...current, ...patch, id: SETTINGS_ID, updatedAt: now };
    await db.settings.put(next);
    return next;
  });
}
