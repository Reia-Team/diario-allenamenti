import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../data/db';
import { at, exerciseInSession, freshDb } from '../../data/testDb';
import { SEED_PROGRAM_ID } from '../../data/seed';
import { completeSet, deleteSession, finishSession, getSessionDetail, listSessions, startSession } from '../../data/repo/sessions';
import {
  BACKUP_FORMAT, BackupValidationError, createBackup, listLocalSnapshots, mergeBackupIntoLocal, parseBackup, replaceAllData,
  restoreLocalSnapshot,
} from './backup';
import { csvCell, exportSetsCsv } from './csv';
import { mergeRecords } from './merge';
import type { SyncMeta } from '../../domain/types';

async function recordWorkout(date: string, weight: number) {
  const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: 'seed-tpl-A' }, at(date, 18));
  const chest = await exerciseInSession(s.id, 'seed-ex-chest-press');
  for (const [i, reps] of [10, 10, 9].entries()) await completeSet(chest.sets[i].id, { weightKg: weight, reps }, at(date, 18, i + 1));
  await finishSession(s.id, at(date, 19));
  return s;
}

beforeEach(async () => {
  await freshDb('2026-09-14');
});

describe('esportazione / importazione JSON', () => {
  it('backup → ripristino riporta esattamente i dati', async () => {
    const s = await recordWorkout('2026-09-14', 72.5);
    const text = JSON.stringify(await createBackup());
    await deleteSession(s.id);
    expect(await listSessions()).toHaveLength(0);

    const parsed = parseBackup(text);
    expect(parsed.format).toBe(BACKUP_FORMAT);
    await replaceAllData(parsed, 'test');
    const detail = await getSessionDetail(s.id);
    expect(detail!.exercises[0].sets.filter((x) => x.completed).map((x) => [x.weightKg, x.reps])).toEqual([[72.5, 10], [72.5, 10], [72.5, 9]]);
    expect(await db.programs.count()).toBe(1);
  });

  it('file JSON corrotto: errore chiaro e database intatto', async () => {
    await recordWorkout('2026-09-14', 70);
    const before = await db.sets.count();
    const text = JSON.stringify(await createBackup());
    expect(() => parseBackup(text.slice(0, text.length / 2))).toThrow(BackupValidationError);
    expect(() => parseBackup('non è json')).toThrow('JSON');
    expect(await db.sets.count()).toBe(before);
  });

  it('schema non valido (tipo sbagliato) viene rifiutato', async () => {
    await recordWorkout('2026-09-14', 70);
    const backup = await createBackup();
    const done = backup.data.sets.find((s) => s.completed)!;
    (done as unknown as { weightKg: string }).weightKg = '70';
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/sets\.\d+\.weightKg/);
  });

  it('riferimenti incoerenti vengono rifiutati', async () => {
    await recordWorkout('2026-09-14', 70);
    const backup = await createBackup();
    backup.data.sessions = [];
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('incoerente');
  });

  it('formato sconosciuto o versione futura', async () => {
    const backup = await createBackup();
    expect(() => parseBackup(JSON.stringify({ ...backup, format: 'altro' }))).toThrow('non è un backup');
    expect(() => parseBackup(JSON.stringify({ ...backup, formatVersion: 99 }))).toThrow('più recente');
  });

  it('prima della sostituzione crea una copia di sicurezza ripristinabile', async () => {
    await recordWorkout('2026-09-14', 70);
    const emptyish = await createBackup();
    emptyish.data.sessions = [];
    emptyish.data.sessionExercises = [];
    emptyish.data.sets = [];
    await replaceAllData(parseBackup(JSON.stringify(emptyish)), 'Prima del test');
    expect(await listSessions()).toHaveLength(0);
    const [snap] = await listLocalSnapshots();
    expect(snap.reason).toBe('Prima del test');
    await restoreLocalSnapshot(snap.id);
    expect(await listSessions()).toHaveLength(1);
  });

  it('unire lo stesso backup due volte non crea duplicati', async () => {
    await recordWorkout('2026-09-14', 70);
    const backup = parseBackup(JSON.stringify(await createBackup()));
    const first = await mergeBackupIntoLocal(backup);
    const second = await mergeBackupIntoLocal(backup);
    expect(first).toMatchObject({ added: 0, updated: 0 });
    expect(second).toMatchObject({ added: 0, updated: 0 });
    expect(await listSessions()).toHaveLength(1);
  });

  it('unione: aggiunge ciò che manca, mantiene i dati locali più recenti', async () => {
    const s = await recordWorkout('2026-09-14', 70);
    const backup = parseBackup(JSON.stringify(await createBackup()));
    await deleteSession(s.id, at('2026-09-15', 8)); // cancellazione più recente del backup
    await recordWorkout('2026-09-16', 72.5);
    const stats = await mergeBackupIntoLocal(backup);
    expect(stats.added).toBe(0);
    expect((await listSessions()).map((x) => x.date)).toEqual(['2026-09-16']); // la cancellazione più recente vince
  });
});

describe('merge last-write-wins', () => {
  const rec = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({ id, createdAt: 0, updatedAt, deletedAt: null, ...extra }) as SyncMeta;

  it('vince il più recente; conflitti conteggiati; tombstone propagate', () => {
    const local = [rec('a', 10, { v: 'L' }), rec('b', 50, { v: 'L' }), rec('c', 5)];
    const remote = [rec('a', 20, { v: 'R' }), rec('b', 40, { v: 'R' }), { ...rec('c', 30), deletedAt: 30 }, rec('d', 1)];
    const m = mergeRecords(local, remote, 8);
    const byId = Object.fromEntries(m.merged.map((r) => [r.id, r as SyncMeta & { v?: string }]));
    expect(byId.a.v).toBe('R');
    expect(byId.b.v).toBe('L');
    expect(byId.c.deletedAt).toBe(30);
    expect(byId.d).toBeDefined();
    expect(m.toWriteLocal.map((r) => r.id).sort()).toEqual(['a', 'c', 'd']);
    expect(m.stats).toMatchObject({ added: 1, updated: 1, deleted: 1, conflicts: 2 });
    expect(m.remoteChanged).toBe(true);
  });

  it('pareggio: scelta deterministica e identica sui due lati', () => {
    const x = rec('p', 0, { start: '2026-09-07' });
    const y = rec('p', 0, { start: '2026-09-14' });
    const ab = mergeRecords([x], [y], null).merged[0];
    const ba = mergeRecords([y], [x], null).merged[0];
    expect(ab).toEqual(ba);
  });
});

describe('CSV', () => {
  it('celle: decimali con virgola, escape, vuoto per null', () => {
    expect(csvCell(72.5)).toBe('72,5');
    expect(csvCell(null)).toBe('');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('di "tutto"')).toBe('"di ""tutto"""');
    expect(csvCell('x"y;')).toBe('"x""y;"');
    expect(csvCell(true)).toBe('sì');
  });

  it('una riga per serie; serie non registrate senza valori', async () => {
    await recordWorkout('2026-09-14', 72.5);
    const csv = await exportSetsCsv();
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toContain('Carico (kg);Ripetizioni;Volume (kg)');
    const chest = lines.filter((l) => l.includes('Chest Press'));
    expect(chest).toHaveLength(4);
    expect(chest[0]).toContain(';1;sì;72,5;10;725;');
    expect(chest[3]).toContain(';4;no;;;;');
  });
});
