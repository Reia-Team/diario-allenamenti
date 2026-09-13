import { DB_NAMES, SYNC_TABLES, type AppDB } from './db';
import { buildSeed } from './seed';
import { defaultSettings } from './repo/settings';
import { newId } from './ids';
import { addDays, diffDays, parseISODate, startOfWeek, weekday } from '../domain/dates';
import type { ISODate, SessionExercise, SetRecord, WorkoutSession } from '../domain/types';
import { deriveExerciseStatus } from '../domain/session';

/**
 * Dataset demo per provare grafici e progressioni.
 * Viene scritto SOLO nel database demo (separato): i dati reali non vengono mai toccati.
 */

export function isDemoDatabase(database: AppDB): boolean {
  return database.name === DB_NAMES.demo || database.name.startsWith(`${DB_NAMES.demo}-`);
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOADS: Record<string, { start: number; step: number }> = {
  'seed-ex-chest-press': { start: 50, step: 2.5 },
  'seed-ex-croci-panca-piana': { start: 8, step: 1 },
  'seed-ex-lat-machine-avanti': { start: 45, step: 2.5 },
  'seed-ex-pulley-basso': { start: 40, step: 2.5 },
  'seed-ex-alzate-laterali': { start: 6, step: 1 },
  'seed-ex-lento-avanti-manubri': { start: 12, step: 1 },
  'seed-ex-alzate-al-mento': { start: 20, step: 2.5 },
  'seed-ex-leg-press': { start: 80, step: 5 },
  'seed-ex-leg-extension': { start: 30, step: 2.5 },
  'seed-ex-leg-curl-sdraiato': { start: 25, step: 2.5 },
  'seed-ex-curl-bilanciere': { start: 20, step: 2.5 },
  'seed-ex-curl-manubri': { start: 10, step: 1 },
  'seed-ex-push-down-cavi': { start: 20, step: 2.5 },
};

export async function generateDemoData(database: AppDB, today: ISODate, weeks = 26, seed = 7): Promise<{ sessions: number }> {
  if (!isDemoDatabase(database)) throw new Error('I dati demo possono essere generati solo nel database demo.');
  const rand = mulberry32(seed);
  const start = startOfWeek(addDays(today, -weeks * 7));
  const s = buildSeed(start);
  const exById = new Map(s.exercises.map((e) => [e.id, e]));
  // k = sessioni già svolte con il carico attuale: più sono, meno cala la prestazione nelle ultime serie.
  const progress = new Map(Object.entries(LOADS).map(([id, l]) => [id, { weight: l.start, k: 0 }]));
  const sessions: WorkoutSession[] = [];
  const sessionExercises: SessionExercise[] = [];
  const sets: SetRecord[] = [];
  let tplIdx = 0;

  for (let d = start; d < today; d = addDays(d, 1)) {
    if (![1, 3, 5].includes(weekday(d))) continue;
    if (rand() < 0.12) continue; // allenamento saltato
    const tpl = s.templates[tplIdx++ % s.templates.length];
    const wes = s.workoutExercises.filter((w) => w.workoutTemplateId === tpl.id);
    const sessionId = newId();
    const startedAt = parseISODate(d).getTime() + (17 * 60 + Math.floor(rand() * 150)) * 60_000;
    let clock = startedAt;
    const weeksIn = diffDays(start, d) / 7;

    wes.forEach((we, order) => {
      const ex = exById.get(we.exerciseId)!;
      const seId = newId();
      const skipped = rand() < 0.04;
      const target = we.repsMax ?? we.repsMin ?? 10;
      const p = progress.get(ex.id);
      let completedCount = 0;
      let allHit = true;
      for (let n = 1; n <= we.targetSets; n++) {
        const set: SetRecord = {
          id: newId(), createdAt: clock, updatedAt: clock, deletedAt: null, sessionId, sessionExerciseId: seId, exerciseId: ex.id,
          date: d, setNumber: n, weightKg: null, reps: null, durationSec: null, distanceKm: null, speedKmh: null, inclinePct: null,
          level: null, calories: null, restSec: null, rpe: null, rir: null, completed: false, completedAt: null,
          excludedFromStats: false, notes: '',
        };
        // Ogni tanto l'ultima serie non viene registrata (dato mancante, non zero).
        if (skipped || (n === we.targetSets && n > 2 && rand() < 0.05)) {
          sets.push(set);
          allHit = false;
          continue;
        }
        clock += 40_000 + rand() * 30_000;
        if (ex.kind === 'cardio') {
          const dur = we.targetDurationSec ?? 600;
          set.durationSec = dur;
          if (ex.id === 'seed-ex-tapis-roulant') {
            set.speedKmh = Math.round((6.8 + weeksIn * 0.04 + rand() * 0.8) * 10) / 10;
            set.inclinePct = Math.round(rand() * 3 * 2) / 2;
            set.distanceKm = Math.round(((set.speedKmh * dur) / 3600) * 100) / 100;
            set.calories = Math.round((dur / 60) * (8 + rand() * 2));
          } else {
            set.level = 5 + Math.floor(rand() * 3 + weeksIn / 10);
            set.distanceKm = Math.round(((dur / 3600) * (9 + rand())) * 100) / 100;
            set.calories = Math.round((dur / 60) * (7 + rand() * 2));
          }
        } else {
          const adaptation = p ? p.k : 3;
          const fatigue = Math.max(0, Math.round((n - 1) * Math.max(0, 1.2 - 0.4 * adaptation) + (rand() - 0.5)));
          let reps = Math.max(1, target - fatigue);
          // Esempio di peggioramento recente per il Leg Curl.
          if (ex.id === 'seed-ex-leg-curl-sdraiato' && diffDays(d, today) <= 30) reps = Math.max(4, target - 3 - Math.floor(rand() * 2));
          set.reps = reps;
          if (reps < target) allHit = false;
          if (p) {
            set.weightKg = p.weight;
            set.rpe = Math.round((7 + rand() * 2.5) * 2) / 2;
          }
          set.restSec = we.restSec ? Math.round(we.restSec + (rand() - 0.3) * 40) : null;
        }
        set.completed = true;
        set.completedAt = clock;
        set.updatedAt = clock;
        clock += (set.restSec ?? 60) * 1000;
        completedCount++;
        sets.push(set);
      }
      if (p && !skipped) {
        const frozen = ex.id === 'seed-ex-leg-curl-sdraiato' && diffDays(d, today) <= 60;
        if (allHit && rand() < 0.85 && !frozen) {
          p.weight += LOADS[ex.id].step;
          p.k = 0;
        } else {
          p.k++;
        }
      }
      sessionExercises.push({
        id: seId, createdAt: startedAt, updatedAt: clock, deletedAt: null, sessionId, exerciseId: ex.id, workoutExerciseId: we.id,
        order, name: ex.name, muscleGroup: ex.muscleGroup, kind: ex.kind, cardioFields: ex.cardioFields, targetSets: we.targetSets,
        repsMin: we.repsMin, repsMax: we.repsMax, restSec: we.restSec, targetDurationSec: we.targetDurationSec, templateNotes: we.notes,
        status: deriveExerciseStatus(we.targetSets, completedCount, true), statusManual: false, notes: '',
      });
    });

    sessions.push({
      id: sessionId, createdAt: startedAt, updatedAt: clock, deletedAt: null, programId: s.program.id, workoutTemplateId: tpl.id,
      programName: s.program.name, templateName: tpl.name, templateCode: tpl.code, date: d, startedAt, endedAt: clock, pauses: [],
      activeDurationSec: Math.round((clock - startedAt) / 1000), status: 'completed', notes: rand() < 0.08 ? 'Oggi poca energia.' : '',
      currentIndex: 0,
    });
  }

  await database.transaction('rw', [...database.syncTables(), database.meta], async () => {
    for (const t of SYNC_TABLES) await database.table(t).clear();
    await database.exercises.bulkPut(s.exercises);
    await database.programs.put(s.program);
    await database.workoutTemplates.bulkPut(s.templates);
    await database.workoutExercises.bulkPut(s.workoutExercises);
    await database.sessions.bulkPut(sessions);
    await database.sessionExercises.bulkPut(sessionExercises);
    await database.sets.bulkPut(sets);
    await database.settings.put({ ...defaultSettings(), activeProgramId: s.program.id });
    await database.meta.put({ key: 'seeded', value: Date.now() });
  });
  return { sessions: sessions.length };
}
