import { db } from '../db';
import { stamp } from '../ids';
import type {
  Exercise, ID, ISODate, SessionExercise, SessionExerciseStatus, SetRecord, WorkoutExercise, WorkoutSession,
} from '../../domain/types';
import { isValidISODate, todayISO } from '../../domain/dates';
import { activeDurationMs, deriveExerciseStatus } from '../../domain/session';
import { isAlive, requireAlive, ValidationError } from './common';
import { getSettings } from './settings';

export class ActiveSessionError extends Error {
  constructor(public sessionId: ID) {
    super('C’è già un allenamento in corso: riprendilo o terminalo prima di iniziarne un altro.');
    this.name = 'ActiveSessionError';
  }
}

const SESSION_TABLES = () => [db.sessions, db.sessionExercises, db.sets];
const START_TABLES = () => [
  db.sessions, db.sessionExercises, db.sets, db.programs, db.workoutTemplates, db.workoutExercises, db.exercises, db.settings,
];

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
const bySetNumber = (a: SetRecord, b: SetRecord) => a.setNumber - b.setNumber;

export async function getActiveSession(): Promise<WorkoutSession | undefined> {
  const list = await db.sessions.where('status').anyOf('in_progress', 'paused').toArray();
  return list.filter(isAlive).sort((a, b) => b.startedAt - a.startedAt)[0];
}

export async function getSession(id: ID): Promise<WorkoutSession | undefined> {
  const s = await db.sessions.get(id);
  return isAlive(s) ? s : undefined;
}

export interface PastPerformance {
  session: WorkoutSession;
  sets: SetRecord[];
}

/**
 * Ultime prestazioni registrate di un esercizio (sessioni concluse, più recenti prima).
 * Le sessioni in cui l'esercizio non ha serie registrate vengono saltate.
 */
export async function getRecentPerformances(
  exerciseId: ID,
  opts: { excludeSessionId?: ID; limit?: number; beforeDate?: ISODate } = {},
): Promise<PastPerformance[]> {
  const sets = (await db.sets.where('exerciseId').equals(exerciseId).toArray()).filter(
    (s) => isAlive(s) && s.completed && s.sessionId !== opts.excludeSessionId,
  );
  const bySession = new Map<ID, SetRecord[]>();
  for (const s of sets) {
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }
  const sessions = (await db.sessions.bulkGet([...bySession.keys()])).filter(
    (s): s is WorkoutSession => isAlive(s) && s.status === 'completed' && (!opts.beforeDate || s.date <= opts.beforeDate),
  );
  sessions.sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
  return sessions.slice(0, opts.limit ?? 2).map((session) => ({
    session,
    sets: bySession.get(session.id)!.sort(bySetNumber),
  }));
}

function draftSet(se: SessionExercise, session: WorkoutSession, setNumber: number, lastSets: SetRecord[] | undefined, now: number): SetRecord {
  const src = lastSets?.find((s) => s.setNumber === setNumber) ?? lastSets?.[lastSets.length - 1];
  const cardio = se.kind === 'cardio';
  return {
    ...stamp(now),
    sessionId: session.id,
    sessionExerciseId: se.id,
    exerciseId: se.exerciseId,
    date: session.date,
    setNumber,
    // Valori proposti = ultima prestazione. Restano "non registrati" finché l'utente non conferma la serie.
    weightKg: cardio ? null : (src?.weightKg ?? null),
    reps: cardio ? null : (src?.reps ?? se.repsMax ?? se.repsMin ?? null),
    durationSec: cardio ? (se.targetDurationSec ?? src?.durationSec ?? null) : null,
    distanceKm: null,
    speedKmh: cardio ? (src?.speedKmh ?? null) : null,
    inclinePct: cardio ? (src?.inclinePct ?? null) : null,
    level: cardio ? (src?.level ?? null) : null,
    calories: null,
    restSec: null,
    rpe: null,
    rir: null,
    completed: false,
    completedAt: null,
    excludedFromStats: false,
    notes: '',
  };
}

async function createSessionExercise(
  session: WorkoutSession,
  exercise: Exercise,
  we: WorkoutExercise | null,
  order: number,
  defaultRestSec: number,
  now: number,
): Promise<SessionExercise> {
  const cardio = exercise.kind === 'cardio';
  const se: SessionExercise = {
    ...stamp(now),
    sessionId: session.id,
    exerciseId: exercise.id,
    workoutExerciseId: we?.id ?? null,
    order,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    kind: exercise.kind,
    cardioFields: [...exercise.cardioFields],
    targetSets: we?.targetSets ?? (cardio ? 1 : 3),
    repsMin: we ? we.repsMin : null,
    repsMax: we ? we.repsMax : null,
    restSec: we?.restSec ?? (cardio ? null : defaultRestSec),
    targetDurationSec: we?.targetDurationSec ?? null,
    templateNotes: we?.notes ?? '',
    status: 'pending',
    statusManual: false,
    notes: '',
  };
  await db.sessionExercises.add(se);
  const [last] = await getRecentPerformances(exercise.id, { excludeSessionId: session.id, limit: 1 });
  const drafts = Array.from({ length: se.targetSets }, (_, i) => draftSet(se, session, i + 1, last?.sets, now));
  await db.sets.bulkAdd(drafts);
  return se;
}

/**
 * Avvia un allenamento: copia i target della scheda nella sessione (snapshot).
 * Da questo momento la sessione è indipendente dalla scheda.
 */
export async function startSession(input: { programId: ID; templateId: ID; date?: ISODate }, now = Date.now()): Promise<WorkoutSession> {
  return db.transaction('rw', START_TABLES(), async () => {
    const active = await getActiveSession();
    if (active) throw new ActiveSessionError(active.id);
    const program = requireAlive(await db.programs.get(input.programId), 'Programma');
    const template = requireAlive(await db.workoutTemplates.get(input.templateId), 'Scheda');
    if (template.programId !== program.id) throw new ValidationError('La scheda non appartiene al programma selezionato.');
    const date = input.date ?? todayISO(new Date(now));
    if (!isValidISODate(date)) throw new ValidationError('Data non valida.');
    const settings = await getSettings();
    const wes = (await db.workoutExercises.where('workoutTemplateId').equals(template.id).toArray()).filter(isAlive).sort(byOrder);

    const session: WorkoutSession = {
      ...stamp(now),
      programId: program.id,
      workoutTemplateId: template.id,
      programName: program.name,
      templateName: template.name,
      templateCode: template.code,
      date,
      startedAt: now,
      endedAt: null,
      pauses: [],
      activeDurationSec: null,
      status: 'in_progress',
      notes: '',
      currentIndex: 0,
    };
    await db.sessions.add(session);
    let order = 0;
    for (const we of wes) {
      const exercise = await db.exercises.get(we.exerciseId);
      if (!isAlive(exercise)) continue;
      await createSessionExercise(session, exercise, we, order++, settings.defaultRestSec, now);
    }
    return session;
  });
}

export async function addExerciseToSession(sessionId: ID, exerciseId: ID, now = Date.now()): Promise<SessionExercise> {
  return db.transaction('rw', [...SESSION_TABLES(), db.exercises, db.settings], async () => {
    const session = requireAlive(await db.sessions.get(sessionId), 'Allenamento');
    const exercise = requireAlive(await db.exercises.get(exerciseId), 'Esercizio');
    const existing = (await db.sessionExercises.where('sessionId').equals(sessionId).toArray()).filter(isAlive);
    const settings = await getSettings();
    return createSessionExercise(session, exercise, null, existing.length, settings.defaultRestSec, now);
  });
}

export interface SessionExerciseDetail {
  exercise: SessionExercise;
  sets: SetRecord[];
}

export interface SessionDetail {
  session: WorkoutSession;
  exercises: SessionExerciseDetail[];
}

export async function getSessionDetail(sessionId: ID): Promise<SessionDetail | undefined> {
  const session = await getSession(sessionId);
  if (!session) return undefined;
  const [ses, sets] = await Promise.all([
    db.sessionExercises.where('sessionId').equals(sessionId).toArray(),
    db.sets.where('sessionId').equals(sessionId).toArray(),
  ]);
  const aliveSets = sets.filter(isAlive);
  return {
    session,
    exercises: ses
      .filter(isAlive)
      .sort(byOrder)
      .map((exercise) => ({ exercise, sets: aliveSets.filter((s) => s.sessionExerciseId === exercise.id).sort(bySetNumber) })),
  };
}

export type SetValues = Partial<
  Pick<SetRecord, 'weightKg' | 'reps' | 'durationSec' | 'distanceKm' | 'speedKmh' | 'inclinePct' | 'level' | 'calories' | 'restSec' | 'rpe' | 'rir' | 'notes' | 'excludedFromStats'>
>;

const RANGES: Record<string, [number, number, boolean]> = {
  weightKg: [0, 2000, false],
  reps: [0, 1000, true],
  durationSec: [0, 24 * 3600, false],
  distanceKm: [0, 1000, false],
  speedKmh: [0, 100, false],
  inclinePct: [-30, 60, false],
  level: [0, 100, false],
  calories: [0, 20000, false],
  restSec: [0, 24 * 3600, false],
  rpe: [1, 10, false],
  rir: [0, 20, false],
};

const FIELD_LABEL: Record<string, string> = {
  weightKg: 'Carico', reps: 'Ripetizioni', durationSec: 'Durata', distanceKm: 'Distanza', speedKmh: 'Velocità',
  inclinePct: 'Inclinazione', level: 'Livello', calories: 'Calorie', restSec: 'Recupero', rpe: 'RPE', rir: 'RIR',
};

export function validateSetValues(values: SetValues) {
  for (const [key, v] of Object.entries(values)) {
    const range = RANGES[key];
    if (!range || v === null || v === undefined) continue;
    const [min, max, integer] = range;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
      throw new ValidationError(`${FIELD_LABEL[key]}: valore non valido.`);
    }
  }
}

async function refreshExerciseStatus(seId: ID, now: number, finished = false) {
  const se = await db.sessionExercises.get(seId);
  if (!isAlive(se) || se.statusManual) return;
  const sets = (await db.sets.where('sessionExerciseId').equals(seId).toArray()).filter((s) => isAlive(s) && s.completed);
  const status = deriveExerciseStatus(se.targetSets, sets.length, finished);
  if (status !== se.status) await db.sessionExercises.put({ ...se, status, updatedAt: now });
}

export async function updateSet(setId: ID, values: SetValues, now = Date.now()) {
  validateSetValues(values);
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const set = requireAlive(await db.sets.get(setId), 'Serie');
    await db.sets.put({ ...set, ...values, updatedAt: now });
  });
}

/** Conferma la serie ("Fine serie"). */
export async function completeSet(setId: ID, values: SetValues = {}, now = Date.now()): Promise<SetRecord> {
  validateSetValues(values);
  return db.transaction('rw', SESSION_TABLES(), async () => {
    const set = requireAlive(await db.sets.get(setId), 'Serie');
    const se = requireAlive(await db.sessionExercises.get(set.sessionExerciseId), 'Esercizio');
    const next: SetRecord = { ...set, ...values, completed: true, completedAt: now, updatedAt: now };
    if (se.kind === 'cardio') {
      const any = [next.durationSec, next.distanceKm, next.calories, next.speedKmh, next.level].some((v) => v !== null);
      if (!any) throw new ValidationError('Inserisci almeno la durata o la distanza.');
    } else if (next.reps === null) {
      throw new ValidationError('Inserisci le ripetizioni eseguite.');
    }
    await db.sets.put(next);
    await refreshExerciseStatus(se.id, now);
    return next;
  });
}

export async function uncompleteSet(setId: ID, now = Date.now()) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const set = requireAlive(await db.sets.get(setId), 'Serie');
    await db.sets.put({ ...set, completed: false, completedAt: null, restSec: null, updatedAt: now });
    await refreshExerciseStatus(set.sessionExerciseId, now);
  });
}

export async function addSet(sessionExerciseId: ID, now = Date.now()): Promise<SetRecord> {
  return db.transaction('rw', SESSION_TABLES(), async () => {
    const se = requireAlive(await db.sessionExercises.get(sessionExerciseId), 'Esercizio');
    const session = requireAlive(await db.sessions.get(se.sessionId), 'Allenamento');
    const sets = (await db.sets.where('sessionExerciseId').equals(se.id).toArray()).filter(isAlive).sort(bySetNumber);
    const last = sets[sets.length - 1];
    const draft = draftSet(se, session, (last?.setNumber ?? 0) + 1, last ? [last] : undefined, now);
    if (last) Object.assign(draft, { durationSec: last.durationSec ?? draft.durationSec });
    // Aggiunta a posteriori in una sessione conclusa: la serie resta non registrata finché non viene confermata.
    await db.sets.add(draft);
    return draft;
  });
}

export async function removeSet(setId: ID, now = Date.now()) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const set = requireAlive(await db.sets.get(setId), 'Serie');
    await db.sets.put({ ...set, deletedAt: now, updatedAt: now });
    const rest = (await db.sets.where('sessionExerciseId').equals(set.sessionExerciseId).toArray()).filter(isAlive).sort(bySetNumber);
    await db.sets.bulkPut(rest.map((s, i) => (s.setNumber === i + 1 ? s : { ...s, setNumber: i + 1, updatedAt: now })));
    const session = await db.sessions.get(set.sessionId);
    await refreshExerciseStatus(set.sessionExerciseId, now, session?.status === 'completed');
  });
}

/** Stato manuale (completato/parziale/saltato) oppure 'auto' per tornare al calcolo automatico. */
export async function setExerciseStatus(seId: ID, status: SessionExerciseStatus | 'auto', now = Date.now()) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const se = requireAlive(await db.sessionExercises.get(seId), 'Esercizio');
    if (status === 'auto') {
      await db.sessionExercises.put({ ...se, statusManual: false, updatedAt: now });
      const session = await db.sessions.get(se.sessionId);
      await refreshExerciseStatus(seId, now, session?.status === 'completed');
    } else {
      await db.sessionExercises.put({ ...se, status, statusManual: true, updatedAt: now });
    }
  });
}

export async function updateSessionExercise(seId: ID, patch: Partial<Pick<SessionExercise, 'notes' | 'restSec'>>, now = Date.now()) {
  if (patch.restSec != null && (patch.restSec < 0 || patch.restSec > 3600)) throw new ValidationError('Recupero non valido.');
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const se = requireAlive(await db.sessionExercises.get(seId), 'Esercizio');
    await db.sessionExercises.put({ ...se, ...patch, updatedAt: now });
  });
}

export async function setCurrentIndex(sessionId: ID, index: number, now = Date.now()) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = requireAlive(await db.sessions.get(sessionId), 'Allenamento');
    if (s.currentIndex !== index) await db.sessions.put({ ...s, currentIndex: index, updatedAt: now });
  });
}

export async function pauseSession(sessionId: ID, now = Date.now()) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = requireAlive(await db.sessions.get(sessionId), 'Allenamento');
    if (s.status !== 'in_progress') return;
    await db.sessions.put({ ...s, status: 'paused', pauses: [...s.pauses, { start: now, end: null }], updatedAt: now });
  });
}

export async function resumeSession(sessionId: ID, now = Date.now()) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = requireAlive(await db.sessions.get(sessionId), 'Allenamento');
    if (s.status !== 'paused') return;
    const pauses = s.pauses.map((p) => (p.end === null ? { ...p, end: now } : p));
    await db.sessions.put({ ...s, status: 'in_progress', pauses, updatedAt: now });
  });
}

/** Serie con valori inseriti ma non confermate: alla chiusura verranno salvate come "non registrate". */
export async function countUnconfirmedSets(sessionId: ID): Promise<number> {
  const sets = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter(isAlive);
  return sets.filter((s) => !s.completed).length;
}

/**
 * Chiude l'allenamento.
 * - Le serie non confermate diventano "non registrate": i valori proposti vengono svuotati (mai 0).
 * - Gli esercizi senza serie risultano "saltati", quelli incompleti "parziali".
 * - La durata esclude le pause.
 */
export async function finishSession(sessionId: ID, now = Date.now()): Promise<WorkoutSession> {
  return db.transaction('rw', SESSION_TABLES(), async () => {
    const s = requireAlive(await db.sessions.get(sessionId), 'Allenamento');
    if (s.status === 'completed') return s;
    const sets = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter(isAlive);
    const cleared = sets
      .filter((x) => !x.completed)
      .map((x) => ({
        ...x,
        weightKg: null, reps: null, durationSec: null, distanceKm: null, speedKmh: null, inclinePct: null,
        level: null, calories: null, rpe: null, rir: null, restSec: null, completedAt: null, updatedAt: now,
      }));
    await db.sets.bulkPut(cleared);
    const ses = (await db.sessionExercises.where('sessionId').equals(sessionId).toArray()).filter(isAlive);
    for (const se of ses) await refreshExerciseStatus(se.id, now, true);
    const pauses = s.pauses.map((p) => (p.end === null ? { ...p, end: now } : p));
    const finished: WorkoutSession = {
      ...s,
      status: 'completed',
      endedAt: now,
      pauses,
      activeDurationSec: Math.round(activeDurationMs(s.startedAt, pauses, now) / 1000),
      updatedAt: now,
    };
    await db.sessions.put(finished);
    return finished;
  });
}

export async function updateSessionInfo(
  sessionId: ID,
  patch: { notes?: string; date?: ISODate; activeDurationSec?: number | null },
  now = Date.now(),
) {
  if (patch.date !== undefined && !isValidISODate(patch.date)) throw new ValidationError('Data non valida.');
  if (patch.activeDurationSec != null && (patch.activeDurationSec < 0 || patch.activeDurationSec > 24 * 3600)) {
    throw new ValidationError('Durata non valida.');
  }
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = requireAlive(await db.sessions.get(sessionId), 'Allenamento');
    await db.sessions.put({ ...s, ...patch, updatedAt: now });
    if (patch.date && patch.date !== s.date) {
      const sets = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter(isAlive);
      await db.sets.bulkPut(sets.map((x) => ({ ...x, date: patch.date!, updatedAt: now })));
    }
  });
}

export async function deleteSession(sessionId: ID, now = Date.now()) {
  await db.transaction('rw', SESSION_TABLES(), async () => {
    const s = requireAlive(await db.sessions.get(sessionId), 'Allenamento');
    await db.sessions.put({ ...s, deletedAt: now, updatedAt: now });
    const del = <T extends { deletedAt: number | null; updatedAt: number }>(r: T): T => ({ ...r, deletedAt: now, updatedAt: now });
    const ses = (await db.sessionExercises.where('sessionId').equals(sessionId).toArray()).filter(isAlive);
    await db.sessionExercises.bulkPut(ses.map(del));
    const sets = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter(isAlive);
    await db.sets.bulkPut(sets.map(del));
  });
}

export async function listSessions(): Promise<WorkoutSession[]> {
  const all = (await db.sessions.toArray()).filter(isAlive);
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
}
