import { describe, expect, it } from 'vitest';
import { AppDB, DB_NAMES, useDatabase } from './db';
import { newId } from './ids';
import { generateDemoData } from './demo';
import { loadHistoryData } from './repo/stats';
import { exerciseMetricsList, recentProgress } from '../domain/dashboard';

describe('dati demo', () => {
  it('si generano solo nel database demo separato', async () => {
    const real = new AppDB(`${DB_NAMES.real}-${newId()}`);
    await expect(generateDemoData(real, '2026-09-14')).rejects.toThrow('database demo');
    expect(await real.sessions.count()).toBe(0);
  });

  it('producono sessioni realistiche con progressione, peggioramento e dati mancanti', async () => {
    const demo = new AppDB(`${DB_NAMES.demo}-${newId()}`);
    useDatabase(demo);
    const { sessions } = await generateDemoData(demo, '2026-09-14');
    expect(sessions).toBeGreaterThan(50);
    const data = await loadHistoryData();
    const chest = exerciseMetricsList(data, 'seed-ex-chest-press', 'epley');
    expect(chest.length).toBeGreaterThan(20);
    expect(chest[chest.length - 1].topWeightKg!).toBeGreaterThan(chest[0].topWeightKg!);
    expect(data.sets.some((s) => !s.completed && s.weightKg === null && s.reps === null)).toBe(true);
    expect(data.sets.every((s) => s.completed || (s.weightKg === null && s.reps === null))).toBe(true);
    const progress = recentProgress(data, 'epley', '2026-09-14', 56);
    expect(progress.improved.length).toBeGreaterThan(0);
    expect(progress.worsened.map((p) => p.exercise.id)).toContain('seed-ex-leg-curl-sdraiato');
  });
});
