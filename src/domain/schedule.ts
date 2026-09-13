import type { ID, ISODate, ScheduleConfig, SessionStatus } from './types';
import { addDays, eachDay, weekday } from './dates';

/**
 * Calendario e sequenza delle schede. Nessuna assunzione su "A/B": funziona con N schede.
 *
 * - keep_sequence: la scheda successiva è quella dopo l'ultima eseguita; un giorno
 *   di allenamento saltato NON consuma la scheda.
 * - follow_calendar: ogni giorno di allenamento (dalla data di inizio) ha uno slot
 *   fisso = indice % N; un giorno saltato consuma lo slot.
 * - override: una data può essere assegnata ad un'altra scheda o a riposo, senza
 *   modificare il programma.
 */

export interface PlanTemplate {
  id: ID;
  code: string;
  name: string;
  position: number;
}

export interface PlanSession {
  id: ID;
  date: ISODate;
  workoutTemplateId: ID | null;
  status: SessionStatus;
  startedAt: number;
}

export interface PlanOverride {
  date: ISODate;
  workoutTemplateId: ID | null;
}

export interface PlanInput {
  templates: PlanTemplate[];
  schedule: ScheduleConfig;
  sessions: PlanSession[];
  overrides: PlanOverride[];
  today: ISODate;
}

export type PlanStatus = 'done' | 'in_progress' | 'missed' | 'planned' | 'rest';

export interface PlanEntry {
  date: ISODate;
  templateId: ID | null;
  status: PlanStatus;
  sessionIds: ID[];
  isOverride: boolean;
  isTrainingDay: boolean;
}

const isActive = (s: PlanSession) => s.status === 'in_progress' || s.status === 'paused';

export function buildPlan(input: PlanInput, from: ISODate, to: ISODate): PlanEntry[] {
  const { schedule, today } = input;
  const templates = [...input.templates].sort((a, b) => a.position - b.position);
  const n = templates.length;
  const indexOf = new Map(templates.map((t, i) => [t.id, i]));
  const trainingDays = new Set(schedule.trainingDays);

  const sessionsByDate = new Map<ISODate, PlanSession[]>();
  for (const s of input.sessions) {
    if (s.status === 'abandoned') continue;
    const list = sessionsByDate.get(s.date) ?? [];
    list.push(s);
    sessionsByDate.set(s.date, list);
  }
  for (const list of sessionsByDate.values()) list.sort((a, b) => a.startedAt - b.startedAt);
  const overrides = new Map(input.overrides.map((o) => [o.date, o]));

  let walkStart = schedule.startDate < from ? schedule.startDate : from;
  for (const d of sessionsByDate.keys()) if (d < walkStart) walkStart = d;

  let pointer = 0; // keep_sequence
  let slot = 0; // follow_calendar
  const entries: PlanEntry[] = [];

  for (const d of eachDay(walkStart, to)) {
    const isTrainingDay = d >= schedule.startDate && trainingDays.has(weekday(d));
    const override = overrides.get(d);
    const daySessions = sessionsByDate.get(d) ?? [];

    let templateId: ID | null = null;
    let scheduled = false;
    if (isTrainingDay && n > 0) {
      templateId = templates[(schedule.mode === 'follow_calendar' ? slot : pointer) % n].id;
      scheduled = true;
    }
    if (override) {
      templateId = override.workoutTemplateId;
      scheduled = override.workoutTemplateId !== null;
    }

    let entry: PlanEntry | null = null;
    if (daySessions.length) {
      const active = daySessions.find(isActive);
      const shown = active ?? daySessions[daySessions.length - 1];
      entry = {
        date: d,
        templateId: shown.workoutTemplateId,
        status: active ? 'in_progress' : 'done',
        sessionIds: daySessions.map((s) => s.id),
        isOverride: !!override,
        isTrainingDay,
      };
      if (schedule.mode === 'keep_sequence') {
        for (const s of daySessions) {
          const idx = s.workoutTemplateId ? indexOf.get(s.workoutTemplateId) : undefined;
          if (idx !== undefined) pointer = (idx + 1) % n;
        }
      }
    } else if (override && override.workoutTemplateId === null) {
      entry = { date: d, templateId: null, status: 'rest', sessionIds: [], isOverride: true, isTrainingDay };
    } else if (scheduled) {
      const upcoming = d >= today;
      entry = {
        date: d,
        templateId,
        status: upcoming ? 'planned' : 'missed',
        sessionIds: [],
        isOverride: !!override,
        isTrainingDay,
      };
      // In keep_sequence si proietta la sequenza sui giorni futuri; i giorni saltati non la consumano.
      if (schedule.mode === 'keep_sequence' && upcoming && templateId) {
        const idx = indexOf.get(templateId);
        if (idx !== undefined) pointer = (idx + 1) % n;
      }
    }

    if (schedule.mode === 'follow_calendar' && isTrainingDay) slot++;
    if (entry && d >= from) entries.push(entry);
  }
  return entries;
}

/** Prossimo allenamento previsto (o in corso) a partire da oggi. */
export function nextPlanned(input: PlanInput, horizonDays = 120): PlanEntry | null {
  const entries = buildPlan(input, input.today, addDays(input.today, horizonDays));
  return entries.find((e) => e.status === 'in_progress' || e.status === 'planned') ?? null;
}

/** Scheda successiva nella sequenza rispetto all'ultima sessione (indipendente dal calendario). */
export function nextTemplateInSequence(templates: PlanTemplate[], sessions: PlanSession[]): PlanTemplate | null {
  const sorted = [...templates].sort((a, b) => a.position - b.position);
  if (!sorted.length) return null;
  const last = [...sessions]
    .filter((s) => s.status !== 'abandoned' && s.workoutTemplateId && sorted.some((t) => t.id === s.workoutTemplateId))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!last) return sorted[0];
  const idx = sorted.findIndex((t) => t.id === last.workoutTemplateId);
  return sorted[(idx + 1) % sorted.length];
}
