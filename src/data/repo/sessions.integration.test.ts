import { beforeEach, describe, expect, it } from 'vitest';
import { AppDB, db, useDatabase } from '../db';
import { at, exerciseInSession, freshDb } from '../testDb';
import { SEED_PROGRAM_ID } from '../seed';
import {
  ActiveSessionError, addSet, completeSet, countUnconfirmedSets, finishSession, getActiveSession, getRecentPerformances,
  getSessionDetail, pauseSession, removeSet, resumeSession, setExerciseStatus, startSession, updateSet,
} from './sessions';
import { listWorkoutExercises, updateWorkoutExercise } from './programs';
import { getPlanInput } from './schedule';
import { loadHistoryData } from './stats';
import { getSettings } from './settings';
import { nextPlanned } from '../../domain/schedule';
import { suggestProgression } from '../../domain/progression';
import { formatPerformance } from '../../domain/metrics';
import { buildChartSeries, filterByPeriod, summarizePeriod } from '../../domain/analysis';
import { exerciseMetricsList, sessionRecords } from '../../domain/dashboard';

const CHEST = 'seed-ex-chest-press';
const LEG_PRESS = 'seed-ex-leg-press';
const TREADMILL = 'seed-ex-tapis-roulant';
const A = 'seed-tpl-A';
const B = 'seed-tpl-B';

async function doSets(sessionId: string, exerciseId: string, weightKg: number | null, reps: number[], start: number) {
  const { sets } = await exerciseInSession(sessionId, exerciseId);
  for (let i = 0; i < reps.length; i++) {
    let set = sets[i];
    if (!set) {
      set = await addSet((await exerciseInSession(sessionId, exerciseId)).exercise.id, start);
    }
    await completeSet(set.id, { weightKg, reps: reps[i], restSec: 120 }, start + i * 180_000);
  }
}

async function nextFor(today: string) {
  const input = await getPlanInput(SEED_PROGRAM_ID, today);
  return nextPlanned(input!);
}

describe('scenario reale: A/B su lunedì/mercoledì/venerdì', () => {
  beforeEach(async () => {
    await freshDb('2026-09-14');
  });

  it('Lun A → Mer B → Ven A: ultima volta, suggerimento, grafico, storico, volume, date', async () => {
    // --- Lunedì 14/09: il calendario propone A ---
    expect(await nextFor('2026-09-14')).toMatchObject({ date: '2026-09-14', templateId: A });
    const mon = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-14', 18));
    expect(mon.date).toBe('2026-09-14');
    await doSets(mon.id, CHEST, 70, [10, 10, 9, 8], at('2026-09-14', 18, 5));
    const tread = await exerciseInSession(mon.id, TREADMILL);
    await completeSet(tread.sets[0].id, { durationSec: 900, distanceKm: 1.9, speedKmh: 7.6 }, at('2026-09-14', 19));
    expect(await countUnconfirmedSets(mon.id)).toBeGreaterThan(0);
    await finishSession(mon.id, at('2026-09-14', 19, 15));

    // --- Mercoledì 16/09: B ---
    expect(await nextFor('2026-09-16')).toMatchObject({ date: '2026-09-16', templateId: B });
    const wed = await startSession({ programId: SEED_PROGRAM_ID, templateId: B }, at('2026-09-16', 18));
    await doSets(wed.id, LEG_PRESS, 100, [12, 12, 12], at('2026-09-16', 18, 10));
    await finishSession(wed.id, at('2026-09-16', 19));

    // --- Venerdì 18/09: di nuovo A ---
    expect(await nextFor('2026-09-18')).toMatchObject({ date: '2026-09-18', templateId: A });
    const fri = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-18', 18));

    // Ultima volta
    const [last] = await getRecentPerformances(CHEST, { excludeSessionId: fri.id });
    expect(last.session.id).toBe(mon.id);
    expect(formatPerformance(last.sets, 'strength', 'kg')).toBe('70 kg × 10 / 10 / 9 / 8');

    // Valori proposti = ultima prestazione, non ancora registrati
    const chestFri = await exerciseInSession(fri.id, CHEST);
    expect(chestFri.sets.map((s) => [s.weightKg, s.reps, s.completed])).toEqual([
      [70, 10, false], [70, 10, false], [70, 9, false], [70, 8, false],
    ]);

    // Suggerimento coerente: obiettivo 4 × 10 non raggiunto → mantieni 70 kg
    const settings = await getSettings();
    const suggestion = suggestProgression({
      rule: settings.defaultProgression,
      kind: 'strength',
      target: { sets: chestFri.exercise.targetSets, repsMin: chestFri.exercise.repsMin, repsMax: chestFri.exercise.repsMax },
      lastSets: last.sets,
      unit: 'kg',
    });
    expect(suggestion).toMatchObject({ type: 'maintain', weightKg: 70 });

    // Venerdì completa 4 × 10: la volta successiva il suggerimento è di aumentare
    await doSets(fri.id, CHEST, 70, [10, 10, 10, 10], at('2026-09-18', 18, 5));
    await finishSession(fri.id, at('2026-09-18', 19));
    const [lastFri, prevMon] = await getRecentPerformances(CHEST);
    const after = suggestProgression({
      rule: settings.defaultProgression, kind: 'strength', target: { sets: 4, repsMin: 10, repsMax: 10 },
      lastSets: lastFri.sets, previousSets: prevMon.sets, unit: 'kg',
    });
    expect(after).toMatchObject({ type: 'increase', weightKg: 72.5 });
    expect(await nextFor('2026-09-19')).toMatchObject({ date: '2026-09-21', templateId: B });

    // Grafico: solo Chest Press, date corrette, volume corretto
    const data = await loadHistoryData();
    const metrics = exerciseMetricsList(data, CHEST, 'epley');
    expect(metrics.map((m) => [m.date, m.topWeightKg, m.volumeKg, m.totalReps])).toEqual([
      ['2026-09-14', 70, 2590, 37],
      ['2026-09-18', 70, 2800, 40],
    ]);
    const chart = buildChartSeries(metrics, 'volume');
    expect(chart.points.map((p) => p.value)).toEqual([2590, 2800]);

    // Record: volume massimo nella sessione di venerdì (il massimo di reps in una serie a 70 kg resta 10)
    const records = sessionRecords(data, fri.id, 'epley').filter((r) => r.exerciseId === CHEST).map((r) => r.type).sort();
    expect(records).toEqual(['max_volume']);

    // Storico: serie per serie, recuperi, stati
    const monDetail = await getSessionDetail(mon.id);
    const chestMon = monDetail!.exercises.find((e) => e.exercise.exerciseId === CHEST)!;
    expect(chestMon.sets.map((s) => `${s.weightKg}x${s.reps}`)).toEqual(['70x10', '70x10', '70x9', '70x8']);
    expect(chestMon.sets.map((s) => s.restSec)).toEqual([120, 120, 120, 120]);
    expect(chestMon.exercise.status).toBe('completed');
    expect(monDetail!.session).toMatchObject({ status: 'completed', date: '2026-09-14', activeDurationSec: 75 * 60 });

    // Esercizi non eseguiti: saltati, serie "non registrate" (null, mai 0)
    const lat = monDetail!.exercises.find((e) => e.exercise.exerciseId === 'seed-ex-lat-machine-avanti')!;
    expect(lat.exercise.status).toBe('skipped');
    expect(lat.sets.every((s) => !s.completed && s.weightKg === null && s.reps === null)).toBe(true);
  });

  it('analisi progressione: solo Chest Press, solo nel periodo, periodo vuoto', async () => {
    const plan: [string, number[], number][] = [
      ['2025-12-29', [10, 10, 10, 10], 45], // fuori periodo
      ['2026-01-05', [10, 10, 10, 10], 50],
      ['2026-03-02', [10, 10, 9, 9], 60],
      ['2026-06-01', [10, 10, 9, 8], 65],
      ['2026-09-14', [10, 10, 9, 8], 70],
    ];
    for (const [date, reps, w] of plan) {
      const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: A, date }, at(date, 18));
      await doSets(s.id, CHEST, w, reps, at(date, 18, 5));
      await doSets(s.id, 'seed-ex-lat-machine-avanti', 55, [10, 10, 10, 10], at(date, 18, 30));
      await finishSession(s.id, at(date, 19));
    }
    const data = await loadHistoryData();
    const inRange = filterByPeriod(exerciseMetricsList(data, CHEST, 'epley'), '2026-01-01', '2026-12-31');
    expect(inRange.map((m) => m.date)).toEqual(['2026-01-05', '2026-03-02', '2026-06-01', '2026-09-14']);
    expect(inRange.map((m) => m.topWeightKg)).toEqual([50, 60, 65, 70]); // mai i 55 kg della Lat Machine

    const summary = summarizePeriod(inRange, 'strength', 'weight');
    expect(summary.sessions).toBe(4);
    expect(summary.changes.weight).toMatchObject({ start: 50, end: 70 });
    expect(summary.changes.weight!.changePct).toBeCloseTo(40);
    expect(summary.changes.volume).toMatchObject({ start: 2000, end: 2590 });
    expect(summary.trend.status).toBe('positive');

    const empty = filterByPeriod(exerciseMetricsList(data, CHEST, 'epley'), '2024-01-01', '2024-12-31');
    expect(summarizePeriod(empty, 'strength', 'weight').hasData).toBe(false);
  });
});

describe('template vs sessione reale', () => {
  beforeEach(async () => {
    await freshDb('2026-09-14');
  });

  it('modificare la scheda non altera gli allenamenti già eseguiti', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-14', 18));
    await doSets(s.id, CHEST, 70, [10, 10, 9, 8], at('2026-09-14', 18, 5));
    await finishSession(s.id, at('2026-09-14', 19));

    const chestWe = (await listWorkoutExercises(A)).find((w) => w.exerciseId === CHEST)!;
    await updateWorkoutExercise(chestWe.id, { targetSets: 3, repsMin: 8, repsMax: 8 });

    const past = await exerciseInSession(s.id, CHEST);
    expect(past.exercise).toMatchObject({ targetSets: 4, repsMin: 10, repsMax: 10 });
    expect(past.sets).toHaveLength(4);

    const next = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-16', 18));
    const future = await exerciseInSession(next.id, CHEST);
    expect(future.exercise).toMatchObject({ targetSets: 3, repsMin: 8, repsMax: 8 });
    expect(future.sets).toHaveLength(3);
  });
});

describe('allenamento attivo', () => {
  beforeEach(async () => {
    await freshDb('2026-09-14');
  });

  it('un solo allenamento in corso alla volta', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-14', 18));
    await expect(startSession({ programId: SEED_PROGRAM_ID, templateId: B }, at('2026-09-14', 18, 1))).rejects.toBeInstanceOf(ActiveSessionError);
    expect((await getActiveSession())!.id).toBe(s.id);
  });

  it('la pausa non conta nella durata effettiva', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-14', 18));
    await pauseSession(s.id, at('2026-09-14', 18, 20));
    expect((await getActiveSession())!.status).toBe('paused');
    await resumeSession(s.id, at('2026-09-14', 18, 35));
    await pauseSession(s.id, at('2026-09-14', 18, 50));
    const done = await finishSession(s.id, at('2026-09-14', 19)); // pausa aperta chiusa alla fine
    expect(done.activeDurationSec).toBe(35 * 60);
  });

  it('recupero dopo chiusura dell’app: i dati sono già su disco', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-14', 18));
    const chest = await exerciseInSession(s.id, CHEST);
    await completeSet(chest.sets[0].id, { weightKg: 72.5, reps: 9 }, at('2026-09-14', 18, 5));
    await updateSet(chest.sets[1].id, { weightKg: 72.5 }, at('2026-09-14', 18, 6));

    const name = db.name;
    db.close();
    const reopened = new AppDB(name);
    useDatabase(reopened);
    const active = await getActiveSession();
    expect(active!.id).toBe(s.id);
    const again = await exerciseInSession(s.id, CHEST);
    expect(again.sets[0]).toMatchObject({ completed: true, weightKg: 72.5, reps: 9 });
    expect(again.sets[1]).toMatchObject({ completed: false, weightKg: 72.5 });
    expect(again.exercise.status).toBe('partial');
  });

  it('completato / parziale / saltato, anche manuale', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-14', 18));
    await doSets(s.id, CHEST, 70, [10, 10], at('2026-09-14', 18, 5));
    const croci = await exerciseInSession(s.id, 'seed-ex-croci-panca-piana');
    await setExerciseStatus(croci.exercise.id, 'skipped');
    await finishSession(s.id, at('2026-09-14', 19));
    expect((await exerciseInSession(s.id, CHEST)).exercise.status).toBe('partial');
    expect((await exerciseInSession(s.id, 'seed-ex-croci-panca-piana')).exercise).toMatchObject({ status: 'skipped', statusManual: true });
  });

  it('validazione: ripetizioni obbligatorie, valori fuori range rifiutati', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-14', 18));
    const chest = await exerciseInSession(s.id, CHEST);
    await expect(completeSet(chest.sets[0].id, { reps: null })).rejects.toThrow('ripetizioni');
    await expect(updateSet(chest.sets[0].id, { weightKg: -5 })).rejects.toThrow('Carico');
    await expect(updateSet(chest.sets[0].id, { reps: 8.5 })).rejects.toThrow('Ripetizioni');
    const tread = await exerciseInSession(s.id, TREADMILL);
    await expect(completeSet(tread.sets[0].id, { durationSec: null })).rejects.toThrow('durata');
  });

  it('aggiunta e rimozione serie rinumera', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: A }, at('2026-09-14', 18));
    const chest = await exerciseInSession(s.id, CHEST);
    await addSet(chest.exercise.id);
    await removeSet(chest.sets[1].id);
    const after = await exerciseInSession(s.id, CHEST);
    expect(after.sets.map((x) => x.setNumber)).toEqual([1, 2, 3, 4]);
  });

  it('cardio: durata proposta dal target, nessun carico', async () => {
    const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: B }, at('2026-09-16', 18));
    const detail = await getSessionDetail(s.id);
    const warmup = detail!.exercises[0];
    expect(warmup.exercise).toMatchObject({ name: 'Ellittica', kind: 'cardio', templateNotes: 'Riscaldamento' });
    expect(warmup.sets[0]).toMatchObject({ durationSec: 300, weightKg: null, reps: null });
    expect(detail!.exercises[8].sets[0].durationSec).toBe(600);
  });
});
