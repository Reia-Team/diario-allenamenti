import { AppDB, useDatabase } from './db';
import { newId } from './ids';
import { ensureSeeded } from './seed';
import { getSessionDetail } from './repo/sessions';

/** Database IndexedDB isolato (fake-indexeddb) con i dati iniziali. */
export async function freshDb(today = '2026-09-14', seed = true): Promise<AppDB> {
  const instance = new AppDB(`test-${newId()}`);
  useDatabase(instance);
  await instance.open();
  if (seed) await ensureSeeded(instance, today);
  return instance;
}

/** Timestamp locale: at('2026-09-14', 18, 30). */
export function at(date: string, hour: number, minute = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).getTime();
}

export async function exerciseInSession(sessionId: string, exerciseId: string) {
  const detail = await getSessionDetail(sessionId);
  const found = detail!.exercises.find((e) => e.exercise.exerciseId === exerciseId);
  if (!found) throw new Error(`Esercizio ${exerciseId} non presente nella sessione`);
  return found;
}
