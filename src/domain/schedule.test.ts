import { describe, expect, it } from 'vitest';
import { buildPlan, nextPlanned, nextTemplateInSequence, type PlanInput, type PlanSession } from './schedule';
import type { CalendarMode } from './types';

const AB = [
  { id: 'A', code: 'A', name: 'Allenamento A', position: 0 },
  { id: 'B', code: 'B', name: 'Allenamento B', position: 1 },
];
const ABCD = ['A', 'B', 'C', 'D'].map((c, i) => ({ id: c, code: c, name: c, position: i }));

// 14/09/2026 = lunedì
const input = (mode: CalendarMode, today: string, sessions: PlanSession[] = [], extra: Partial<PlanInput> = {}): PlanInput => ({
  templates: AB,
  schedule: { trainingDays: [1, 3, 5], startDate: '2026-09-14', mode },
  sessions,
  overrides: [],
  today,
  ...extra,
});

const done = (id: string, date: string, tpl: string, hour = 18): PlanSession => ({
  id,
  date,
  workoutTemplateId: tpl,
  status: 'completed',
  startedAt: new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime(),
});

const summary = (entries: ReturnType<typeof buildPlan>) => entries.map((e) => `${e.date.slice(8)}:${e.templateId ?? '-'}:${e.status}`);

describe('sequenza A/B su lun/mer/ven', () => {
  it('genera A, B, A, B, A, B', () => {
    const plan = buildPlan(input('keep_sequence', '2026-09-14'), '2026-09-14', '2026-09-25');
    expect(plan.map((e) => e.templateId)).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
    expect(plan.map((e) => e.date)).toEqual(['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-23', '2026-09-25']);
  });

  it('modalità 1 (mantieni sequenza): Lun A, Mer saltato, Ven B', () => {
    const plan = buildPlan(input('keep_sequence', '2026-09-18', [done('s1', '2026-09-14', 'A')]), '2026-09-14', '2026-09-21');
    expect(summary(plan)).toEqual(['14:A:done', '16:B:missed', '18:B:planned', '21:A:planned']);
  });

  it('modalità 2 (segui calendario): il giorno saltato consuma lo slot', () => {
    const plan = buildPlan(input('follow_calendar', '2026-09-18', [done('s1', '2026-09-14', 'A')]), '2026-09-14', '2026-09-21');
    expect(summary(plan)).toEqual(['14:A:done', '16:B:missed', '18:A:planned', '21:B:planned']);
  });

  it('sessioni reali allineano la sequenza (mantieni sequenza)', () => {
    const sessions = [done('s1', '2026-09-14', 'A'), done('s2', '2026-09-16', 'B'), done('s3', '2026-09-18', 'A')];
    const next = nextPlanned(input('keep_sequence', '2026-09-19', sessions));
    expect(next).toMatchObject({ date: '2026-09-21', templateId: 'B', status: 'planned' });
  });

  it('allenamento in corso oggi', () => {
    const s: PlanSession = { ...done('s1', '2026-09-14', 'A'), status: 'in_progress' };
    const next = nextPlanned(input('keep_sequence', '2026-09-14', [s]));
    expect(next).toMatchObject({ date: '2026-09-14', status: 'in_progress', sessionIds: ['s1'] });
  });

  it('oggi già completato → prossimo giorno utile', () => {
    const next = nextPlanned(input('keep_sequence', '2026-09-14', [done('s1', '2026-09-14', 'A')]));
    expect(next).toMatchObject({ date: '2026-09-16', templateId: 'B' });
  });

  it('allenamento extra in un giorno non previsto', () => {
    const plan = buildPlan(input('keep_sequence', '2026-09-16', [done('s1', '2026-09-15', 'A')]), '2026-09-14', '2026-09-18');
    expect(summary(plan)).toEqual(['14:A:missed', '15:A:done', '16:B:planned', '18:A:planned']);
  });

  it('le sessioni annullate non contano', () => {
    const s: PlanSession = { ...done('s1', '2026-09-14', 'A'), status: 'abandoned' };
    expect(nextPlanned(input('keep_sequence', '2026-09-15', [s]))).toMatchObject({ date: '2026-09-16', templateId: 'A' });
  });
});

describe('override di una singola data', () => {
  it('assegna un’altra scheda senza modificare il programma (segui calendario)', () => {
    const plan = buildPlan(
      input('follow_calendar', '2026-09-14', [], { overrides: [{ date: '2026-09-16', workoutTemplateId: 'A' }] }),
      '2026-09-14',
      '2026-09-21',
    );
    expect(summary(plan)).toEqual(['14:A:planned', '16:A:planned', '18:A:planned', '21:B:planned']);
    expect(plan[1].isOverride).toBe(true);
  });

  it('giorno di riposo forzato (mantieni sequenza): la scheda slitta', () => {
    const plan = buildPlan(
      input('keep_sequence', '2026-09-14', [], { overrides: [{ date: '2026-09-16', workoutTemplateId: null }] }),
      '2026-09-14',
      '2026-09-21',
    );
    expect(summary(plan)).toEqual(['14:A:planned', '16:-:rest', '18:B:planned', '21:A:planned']);
  });

  it('override in un giorno non di allenamento', () => {
    const plan = buildPlan(
      input('keep_sequence', '2026-09-14', [], { overrides: [{ date: '2026-09-15', workoutTemplateId: 'B' }] }),
      '2026-09-14',
      '2026-09-16',
    );
    expect(summary(plan)).toEqual(['14:A:planned', '15:B:planned', '16:A:planned']);
  });
});

describe('programmi con N schede', () => {
  it('A/B/C/D su 3 giorni', () => {
    const plan = buildPlan(input('follow_calendar', '2026-09-14', [], { templates: ABCD }), '2026-09-14', '2026-10-02');
    expect(plan.map((e) => e.templateId).join('')).toBe('ABCDABCDA');
  });

  it('nessuna scheda o nessun giorno → nessun piano', () => {
    expect(buildPlan(input('keep_sequence', '2026-09-14', [], { templates: [] }), '2026-09-14', '2026-09-30')).toEqual([]);
    const noDays = input('keep_sequence', '2026-09-14');
    noDays.schedule = { ...noDays.schedule, trainingDays: [] };
    expect(nextPlanned(noDays)).toBeNull();
  });

  it('nextTemplateInSequence ignora il calendario', () => {
    expect(nextTemplateInSequence(ABCD, [])!.id).toBe('A');
    expect(nextTemplateInSequence(ABCD, [done('1', '2026-09-14', 'C')])!.id).toBe('D');
    expect(nextTemplateInSequence(ABCD, [done('1', '2026-09-14', 'D')])!.id).toBe('A');
  });

  it('prima della data di inizio non ci sono giorni di allenamento', () => {
    const plan = buildPlan(input('keep_sequence', '2026-09-01'), '2026-09-01', '2026-09-14');
    expect(plan.map((e) => e.date)).toEqual(['2026-09-14']);
  });
});
