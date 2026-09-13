import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDB, useDatabase } from '../../data/db';
import { newId } from '../../data/ids';
import { ensureSeeded, SEED_PROGRAM_ID } from '../../data/seed';
import { at, exerciseInSession } from '../../data/testDb';
import { completeSet, deleteSession, finishSession, getSessionDetail, startSession, updateSet } from '../../data/repo/sessions';
import { DriveClient, DriveError } from './driveApi';
import { backupToDrive, getSyncMeta, listDriveBackups, MAX_BACKUPS, restoreFromDrive, SYNC_FILE, syncWithDrive } from './syncService';

interface FakeFile { id: string; name: string; content: string; modifiedTime: string }

/** Simulazione in memoria delle API Drive v3 usate dall'app (appDataFolder). */
class FakeDrive {
  files = new Map<string, FakeFile>();
  token = 'good';
  private seq = 1;

  private res(status: number, body: string) {
    return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) } as Response;
  }

  private meta(f: FakeFile) {
    return { id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: String(f.content.length) };
  }

  fetch = async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (headers.Authorization !== `Bearer ${this.token}`) return this.res(401, '{"error":"invalid_token"}');
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const stamp = new Date(1_800_000_000_000 + this.seq * 1000).toISOString();
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      return this.res(200, JSON.stringify({ files: [...this.files.values()].map((f) => this.meta(f)) }));
    }
    let m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (m && method === 'GET') {
      const f = this.files.get(m[1]);
      return f ? this.res(200, f.content) : this.res(404, '');
    }
    if (m && method === 'DELETE') {
      this.files.delete(m[1]);
      return this.res(204, '');
    }
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const boundary = /boundary=(.+)$/.exec(headers['Content-Type'])![1];
      const parts = String(init.body).split(`--${boundary}`);
      const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1]);
      const content = parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      expect(metadata.parents).toEqual(['appDataFolder']);
      const f = { id: `f${this.seq++}`, name: metadata.name, content, modifiedTime: stamp };
      this.files.set(f.id, f);
      return this.res(200, JSON.stringify(this.meta(f)));
    }
    m = u.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const f = this.files.get(m[1]);
      if (!f) return this.res(404, '');
      f.content = String(init.body);
      f.modifiedTime = stamp;
      this.seq++;
      return this.res(200, JSON.stringify(this.meta(f)));
    }
    return this.res(400, `richiesta inattesa ${method} ${u.pathname}`);
  };
}

const TODAY = '2026-09-14';

async function device(name: string): Promise<AppDB> {
  const d = new AppDB(`${name}-${newId()}`);
  await d.open();
  useDatabase(d);
  await ensureSeeded(d, TODAY);
  return d;
}

async function recordWorkout(date: string, weight: number) {
  const s = await startSession({ programId: SEED_PROGRAM_ID, templateId: 'seed-tpl-A' }, at(date, 18));
  const chest = await exerciseInSession(s.id, 'seed-ex-chest-press');
  await completeSet(chest.sets[0].id, { weightKg: weight, reps: 10 }, at(date, 18, 5));
  await finishSession(s.id, at(date, 19));
  return { session: s, setId: chest.sets[0].id };
}

describe('sincronizzazione Google Drive tra due dispositivi', () => {
  let drive: FakeDrive;
  let client: DriveClient;
  beforeEach(() => {
    drive = new FakeDrive();
    client = new DriveClient(() => drive.token, drive.fetch);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allenamento su A → visibile su B; cancellazione su B → propagata ad A; nessun duplicato', async () => {
    const A = await device('A');
    const { session } = await recordWorkout('2026-09-14', 70);
    const first = await syncWithDrive(client, A, at('2026-09-14', 20));
    expect(first.uploaded).toBe(true);
    expect([...drive.files.values()].map((f) => f.name)).toEqual([SYNC_FILE]);

    const B = await device('B');
    const r = await syncWithDrive(client, B, at('2026-09-14', 21));
    expect(r.stats.added).toBeGreaterThan(0);
    expect((await getSessionDetail(session.id))!.exercises[0].sets[0]).toMatchObject({ weightKg: 70, reps: 10 });
    expect(await B.programs.count()).toBe(1); // i dati iniziali hanno id deterministici
    expect(await B.exercises.count()).toBe(await A.exercises.count());

    await deleteSession(session.id, at('2026-09-15', 8));
    await syncWithDrive(client, B, at('2026-09-15', 9));

    useDatabase(A);
    await syncWithDrive(client, A, at('2026-09-15', 10));
    expect((await A.sessions.get(session.id))!.deletedAt).not.toBeNull();
    expect(await getSessionDetail(session.id)).toBeUndefined();
  });

  it('conflitto sulla stessa serie: vince la modifica più recente su entrambi i dispositivi', async () => {
    const A = await device('A');
    const { setId } = await recordWorkout('2026-09-14', 70);
    await syncWithDrive(client, A, at('2026-09-14', 20));
    const B = await device('B');
    await syncWithDrive(client, B, at('2026-09-14', 20, 5));

    useDatabase(A);
    await updateSet(setId, { weightKg: 72.5 }, at('2026-09-14', 21));
    useDatabase(B);
    await updateSet(setId, { weightKg: 75 }, at('2026-09-14', 22));

    await syncWithDrive(client, A, at('2026-09-14', 23));
    const onB = await syncWithDrive(client, B, at('2026-09-14', 23, 5));
    expect(onB.stats.conflicts).toBeGreaterThanOrEqual(1);
    await syncWithDrive(client, A, at('2026-09-14', 23, 10));
    expect((await A.sets.get(setId))!.weightKg).toBe(75);
    expect((await B.sets.get(setId))!.weightKg).toBe(75);
  });

  it('offline: nessuna perdita di dati, errore registrato', async () => {
    const A = await device('A');
    await recordWorkout('2026-09-14', 70);
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(syncWithDrive(client, A)).rejects.toMatchObject({ name: 'DriveError', kind: 'network' });
    spy.mockRestore();
    expect(await A.sessions.count()).toBe(1);
    expect((await getSyncMeta(A)).lastError).toContain('offline');
  });

  it('token scaduto → errore di autenticazione e token azzerato', async () => {
    const A = await device('A');
    let cleared = false;
    drive.token = 'rinnovato';
    const stale = new DriveClient(() => 'vecchio', drive.fetch, () => { cleared = true; });
    await expect(syncWithDrive(stale, A)).rejects.toMatchObject({ kind: 'auth' });
    expect(cleared).toBe(true);
    const none = new DriveClient(() => null, drive.fetch);
    await expect(none.listFiles()).rejects.toBeInstanceOf(DriveError);
  });

  it('file remoto corrotto: sincronizzazione annullata senza toccare i dati locali', async () => {
    const A = await device('A');
    await recordWorkout('2026-09-14', 70);
    drive.files.set('x', { id: 'x', name: SYNC_FILE, content: '{"format":"diario-allenamenti-backup","formatVersion":1,"data":{"sets":[{"id":1}]}}', modifiedTime: '' });
    await expect(syncWithDrive(client, A)).rejects.toMatchObject({ kind: 'invalid' });
    expect(await A.sessions.count()).toBe(1);
  });

  it('backup versionati: conserva gli ultimi 10 e ripristina una versione', async () => {
    const A = await device('A');
    await recordWorkout('2026-09-14', 70);
    for (let i = 0; i < 12; i++) await backupToDrive(client, A, at('2026-09-14', 8, i));
    const list = await listDriveBackups(client);
    expect(list).toHaveLength(MAX_BACKUPS);
    expect(list[0].name).toBe('backup-20260914-081100.json');

    await recordWorkout('2026-09-16', 72.5);
    expect(await A.sessions.count()).toBe(2);
    const summary = await restoreFromDrive(client, list[0].id, A);
    expect(summary.sessions).toBe(1);
    expect(await A.sessions.count()).toBe(1);
  });
});
