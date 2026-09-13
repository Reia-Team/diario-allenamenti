import type {
  Exercise, ExerciseKind, ID, ISODate, OneRmFormula, Program, SessionExercise, SetRecord, WorkoutSession,
} from './types';
import { computeSessionMetrics, countsForStats, totalVolume, type ExerciseSessionMetrics } from './metrics';
import { buildChartSeries, filterByPeriod, metricValue, sortMetrics, type Metric } from './analysis';
import { detectRecords, type RecordEvent } from './records';
import { addDays, diffDays, startOfWeek } from './dates';
import { pctChange, type TrendResult } from './trend';

/** Dati delle sessioni concluse (vedi data/repo/stats.ts). */
export interface HistoryData {
  sessions: WorkoutSession[];
  sessionExercises: SessionExercise[];
  sets: SetRecord[];
  exercises: Exercise[];
  programs: Program[];
}

export interface HistoryFilter {
  programId?: ID | null;
  templateId?: ID | null;
  exerciseId?: ID | null;
  muscleGroup?: string | null;
  from?: ISODate | null;
  to?: ISODate | null;
}

/** Applica i filtri: le sessioni restano solo se contengono dati coerenti con il filtro. */
export function filterHistory(data: HistoryData, f: HistoryFilter): HistoryData {
  let sessions = data.sessions.filter(
    (s) =>
      (!f.programId || s.programId === f.programId) &&
      (!f.templateId || s.workoutTemplateId === f.templateId) &&
      (!f.from || s.date >= f.from) &&
      (!f.to || s.date <= f.to),
  );
  let ids = new Set(sessions.map((s) => s.id));
  let sessionExercises = data.sessionExercises.filter(
    (se) =>
      ids.has(se.sessionId) &&
      (!f.exerciseId || se.exerciseId === f.exerciseId) &&
      (!f.muscleGroup || se.muscleGroup === f.muscleGroup),
  );
  const seIds = new Set(sessionExercises.map((se) => se.id));
  const sets = data.sets.filter((s) => seIds.has(s.sessionExerciseId));
  if (f.exerciseId || f.muscleGroup) {
    const withData = new Set(sessionExercises.map((se) => se.sessionId));
    sessions = sessions.filter((s) => withData.has(s.id));
    ids = withData;
    sessionExercises = sessionExercises.filter((se) => ids.has(se.sessionId));
  }
  return { ...data, sessions, sessionExercises, sets };
}

export function exerciseKind(data: HistoryData, exerciseId: ID): ExerciseKind {
  return data.exercises.find((e) => e.id === exerciseId)?.kind ?? data.sessionExercises.find((se) => se.exerciseId === exerciseId)?.kind ?? 'strength';
}

/** Metriche per sessione di un esercizio. Le sessioni senza serie registrate non producono punti. */
export function exerciseMetricsList(data: HistoryData, exerciseId: ID, formula: OneRmFormula): ExerciseSessionMetrics[] {
  const sessions = new Map(data.sessions.map((s) => [s.id, s]));
  const groups = new Map<ID, SetRecord[]>();
  for (const s of data.sets) {
    if (s.exerciseId !== exerciseId || !sessions.has(s.sessionId)) continue;
    const list = groups.get(s.sessionId) ?? [];
    list.push(s);
    groups.set(s.sessionId, list);
  }
  const list: ExerciseSessionMetrics[] = [];
  for (const [sid, sets] of groups) {
    const sess = sessions.get(sid)!;
    const m = computeSessionMetrics({ sessionId: sid, date: sess.date, startedAt: sess.startedAt }, sets, formula);
    if (m.setsCompleted > 0) list.push(m);
  }
  return sortMetrics(list);
}

/** Esercizi con almeno una serie registrata. */
export function exercisesWithHistory(data: HistoryData): Exercise[] {
  const ids = new Set(data.sets.filter(countsForStats).map((s) => s.exerciseId));
  return data.exercises.filter((e) => ids.has(e.id)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

/** Metrica principale per giudicare la progressione di un esercizio. */
export function mainMetric(kind: ExerciseKind, list: ExerciseSessionMetrics[]): Metric {
  if (kind === 'cardio') return 'duration';
  if (kind === 'bodyweight') return list.some((m) => m.volumeKg !== null) ? 'volume' : 'reps';
  return list.some((m) => m.e1rmKg !== null) ? 'e1rm' : 'weight';
}

export interface ProgressItem {
  exercise: Exercise;
  metric: Metric;
  trend: TrendResult;
  sessions: number;
  lastDate: ISODate;
}

export interface RecentProgress {
  improved: ProgressItem[];
  stable: ProgressItem[];
  worsened: ProgressItem[];
  insufficient: ProgressItem[];
}

export function recentProgress(data: HistoryData, formula: OneRmFormula, today: ISODate, windowDays = 56): RecentProgress {
  const from = addDays(today, -windowDays);
  const result: RecentProgress = { improved: [], stable: [], worsened: [], insufficient: [] };
  for (const exercise of exercisesWithHistory(data)) {
    const list = filterByPeriod(exerciseMetricsList(data, exercise.id, formula), from, today);
    if (!list.length) continue;
    const metric = mainMetric(exercise.kind, list);
    const { trend } = buildChartSeries(list, metric);
    const item: ProgressItem = { exercise, metric, trend, sessions: list.length, lastDate: list[list.length - 1].date };
    const bucket = trend.status === 'positive' ? 'improved' : trend.status === 'negative' ? 'worsened' : trend.status === 'stable' ? 'stable' : 'insufficient';
    result[bucket].push(item);
  }
  return result;
}

export interface RecordWithName extends RecordEvent {
  exerciseName: string;
}

export function allRecordEvents(data: HistoryData, formula: OneRmFormula): RecordWithName[] {
  const sessions = new Map(data.sessions.map((s) => [s.id, s]));
  const events: RecordWithName[] = [];
  for (const exercise of exercisesWithHistory(data)) {
    const bySession = new Map<ID, SetRecord[]>();
    for (const s of data.sets) {
      if (s.exerciseId !== exercise.id) continue;
      const list = bySession.get(s.sessionId) ?? [];
      list.push(s);
      bySession.set(s.sessionId, list);
    }
    const input = [...bySession].flatMap(([sid, sets]) => {
      const sess = sessions.get(sid);
      return sess ? [{ sessionId: sid, date: sess.date, startedAt: sess.startedAt, sets }] : [];
    });
    for (const e of detectRecords(exercise.id, exercise.kind, input, formula).events) {
      events.push({ ...e, exerciseName: exercise.name });
    }
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}

export function recentRecords(data: HistoryData, formula: OneRmFormula, since: ISODate): RecordWithName[] {
  return allRecordEvents(data, formula).filter((e) => e.date >= since);
}

export function sessionRecords(data: HistoryData, sessionId: ID, formula: OneRmFormula): RecordWithName[] {
  return allRecordEvents(data, formula).filter((e) => e.sessionId === sessionId);
}

export function sessionVolume(data: HistoryData, sessionId: ID): number | null {
  return totalVolume(data.sets.filter((s) => s.sessionId === sessionId));
}

export interface WeekSummary {
  weekStart: ISODate;
  sessions: number;
  volumeKg: number | null;
  durationSec: number;
}

export function weeklySummary(data: HistoryData, today: ISODate, weeks = 8): WeekSummary[] {
  const current = startOfWeek(today);
  const result: WeekSummary[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDays(current, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    const sessions = data.sessions.filter((s) => s.date >= weekStart && s.date <= weekEnd);
    const ids = new Set(sessions.map((s) => s.id));
    result.push({
      weekStart,
      sessions: sessions.length,
      volumeKg: totalVolume(data.sets.filter((s) => ids.has(s.sessionId))),
      durationSec: sessions.reduce((a, s) => a + (s.activeDurationSec ?? 0), 0),
    });
  }
  return result;
}

function weeksIn(from: ISODate, to: ISODate): number {
  return Math.max(1, (diffDays(from, to) + 1) / 7);
}

export interface ProgramStat {
  programId: ID | null;
  name: string;
  sessions: number;
  totalVolumeKg: number | null;
  avgDurationSec: number | null;
  perWeek: number;
}

export function programStats(data: HistoryData, from: ISODate, to: ISODate): ProgramStat[] {
  const inRange = data.sessions.filter((s) => s.date >= from && s.date <= to);
  const groups = new Map<string, WorkoutSession[]>();
  for (const s of inRange) {
    const key = s.programId ?? `name:${s.programName}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()]
    .map((sessions) => {
      const ids = new Set(sessions.map((s) => s.id));
      const durations = sessions.map((s) => s.activeDurationSec).filter((d): d is number => d !== null);
      const program = data.programs.find((p) => p.id === sessions[0].programId);
      return {
        programId: sessions[0].programId,
        name: program?.deletedAt === null ? program.name : sessions[0].programName,
        sessions: sessions.length,
        totalVolumeKg: totalVolume(data.sets.filter((s) => ids.has(s.sessionId))),
        avgDurationSec: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
        perWeek: sessions.length / weeksIn(from, to),
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

export interface MuscleGroupStat {
  group: string;
  sets: number;
  volumeKg: number | null;
  sessions: number;
  perWeek: number;
  avgChangePct: number | null;
}

export function muscleGroupStats(data: HistoryData, formula: OneRmFormula, from: ISODate, to: ISODate): MuscleGroupStat[] {
  const period = filterHistory(data, { from, to });
  const seById = new Map(period.sessionExercises.map((se) => [se.id, se]));
  const groups = new Map<string, SetRecord[]>();
  for (const s of period.sets) {
    if (!countsForStats(s)) continue;
    const se = seById.get(s.sessionExerciseId);
    if (!se || se.kind === 'cardio') continue;
    groups.set(se.muscleGroup, [...(groups.get(se.muscleGroup) ?? []), s]);
  }
  return [...groups]
    .map(([group, sets]) => {
      const sessions = new Set(sets.map((s) => s.sessionId)).size;
      const changes: number[] = [];
      for (const exId of new Set(sets.map((s) => s.exerciseId))) {
        const list = exerciseMetricsList(period, exId, formula);
        if (list.length < 2) continue;
        const metric = mainMetric(exerciseKind(data, exId), list);
        const valued = list.filter((m) => metricValue(m, metric) !== null);
        if (valued.length < 2) continue;
        const pct = pctChange(metricValue(valued[0], metric), metricValue(valued[valued.length - 1], metric));
        if (pct !== null) changes.push(pct);
      }
      return {
        group,
        sets: sets.length,
        volumeKg: totalVolume(sets),
        sessions,
        perWeek: sessions / weeksIn(from, to),
        avgChangePct: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
      };
    })
    .sort((a, b) => b.sets - a.sets);
}
