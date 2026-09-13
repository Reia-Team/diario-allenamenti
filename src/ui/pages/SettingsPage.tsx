import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { updateSettings } from '../../data/repo/settings';
import { getProgram, listPrograms, setActiveProgram } from '../../data/repo/programs';
import { db, DB_VERSION, getDataMode, setDataMode } from '../../data/db';
import { generateDemoData } from '../../data/demo';
import { ONE_RM_FORMULA_LABEL } from '../../domain/oneRm';
import type { OneRmFormula, Settings } from '../../domain/types';
import { formatDateIt, formatTime, todayISO, toISODate } from '../../domain/dates';
import { formatNumber } from '../../domain/format';
import {
  BACKUP_FORMAT_VERSION, createBackup, listLocalSnapshots, mergeBackupIntoLocal, parseBackup, replaceAllData, restoreLocalSnapshot,
  summarizeBackup, type BackupFile,
} from '../../services/backup/backup';
import { exportSetsCsv } from '../../services/backup/csv';
import { beep, deviceCapabilities, requestNotificationPermission, unlockAudio, vibrate } from '../../services/feedback';
import { logger } from '../../services/logger';
import {
  getClientId, hasValidToken, isClientIdFromEnv, setClientId, signIn, signOut,
} from '../../services/drive/googleAuth';
import {
  backupToDrive, countPendingChanges, createDriveClient, getSyncMeta, listDriveBackups, restoreFromDrive, syncWithDrive,
} from '../../services/drive/syncService';
import type { DriveFile } from '../../services/drive/driveApi';
import { useOnline, useSettings } from '../hooks';
import { errorMessage, useAction, useToast } from '../toast';
import { ConfirmDialog, Field, Modal, PageHeader, Segmented, Switch } from '../components/common';
import { NumberStepper } from '../components/NumberStepper';
import { ProgressionRuleEditor } from '../components/ProgressionRuleEditor';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { downloadText, fileStamp } from '../download';
import { IconCloud } from '../icons';

export default function SettingsPage() {
  const settings = useSettings();
  const run = useAction();
  const update = (patch: Partial<Settings>) => run(() => updateSettings(patch));

  return (
    <main className="page stack-lg">
      <PageHeader title="Impostazioni" back />

      <section className="card stack" aria-labelledby="s-general">
        <h2 id="s-general">Generale</h2>
        <div className="field">
          <span className="label">Unità di peso</span>
          <Segmented label="Unità di peso" value={settings.weightUnit} onChange={(v) => update({ weightUnit: v })}
            options={[{ value: 'kg', label: 'Chilogrammi (kg)' }, { value: 'lb', label: 'Libbre (lb)' }]} />
          <small className="hint">I dati restano salvati in kg: cambiare unità non altera lo storico.</small>
        </div>
        <div className="field">
          <span className="label">Tema</span>
          <Segmented label="Tema" value={settings.theme} onChange={(v) => update({ theme: v })}
            options={[{ value: 'dark', label: 'Scuro' }, { value: 'light', label: 'Chiaro' }, { value: 'system', label: 'Sistema' }]} />
        </div>
      </section>

      <TimerSection settings={settings} update={update} />

      <section className="card stack" aria-labelledby="s-training">
        <h2 id="s-training">Allenamento e progressione</h2>
        <Field label="Incremento dei pulsanti +/− del carico">
          <select className="input" value={settings.weightStepKg} onChange={(e) => update({ weightStepKg: Number(e.target.value) })}>
            {[0.5, 1, 1.25, 2.5, 5].map((v) => <option key={v} value={v}>{formatNumber(v, 2)} kg</option>)}
          </select>
        </Field>
        <Switch label="Mantieni lo schermo acceso" hint="Durante l’allenamento, se il browser lo consente." checked={settings.keepScreenOn} onChange={(v) => update({ keepScreenOn: v })} />
        <h3>Regola di progressione predefinita</h3>
        <p className="hint">Usata dagli esercizi senza una regola propria. L’app suggerisce, non modifica mai i carichi da sola.</p>
        <ProgressionRuleEditor value={settings.defaultProgression} unit={settings.weightUnit} onChange={(r) => update({ defaultProgression: r })} />
        <Field label="Formula 1RM stimato" hint="Il 1RM stimato è calcolato per serie da 1 a 12 ripetizioni e non è un record eseguito.">
          <select className="input" value={settings.oneRmFormula} onChange={(e) => update({ oneRmFormula: e.target.value as OneRmFormula })}>
            {Object.entries(ONE_RM_FORMULA_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      </section>

      <CalendarSection settings={settings} />
      <BackupSection settings={settings} update={update} />
      <DemoSection />
      <InfoSection />
    </main>
  );
}

function TimerSection({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const { show } = useToast();
  const caps = deviceCapabilities();
  return (
    <section className="card stack" aria-labelledby="s-timer">
      <h2 id="s-timer">Timer di recupero</h2>
      <NumberStepper label="Recupero predefinito" unit="s" integer compact step={15} min={0} max={900}
        value={settings.defaultRestSec} onChange={(v) => v !== null && update({ defaultRestSec: v })} />
      <p className="hint">Usato per gli esercizi senza un recupero impostato nella scheda.</p>
      <Switch label="Suono a fine recupero" checked={settings.timerSound} onChange={(v) => update({ timerSound: v })} />
      {settings.timerSound && (
        <div className="row">
          <label className="grow field">
            <span>Volume {Math.round(settings.timerVolume * 100)}%</span>
            <input type="range" min={0} max={1} step={0.1} value={settings.timerVolume} onChange={(e) => update({ timerVolume: Number(e.target.value) })} />
          </label>
          <button type="button" className="btn sm" onClick={() => { unlockAudio(); beep(settings.timerVolume); }}>Prova</button>
        </div>
      )}
      <Switch
        label="Vibrazione"
        hint={caps.vibration ? undefined : 'Non supportata da questo dispositivo/browser.'}
        checked={settings.timerVibration}
        onChange={(v) => { update({ timerVibration: v }); if (v) vibrate(200); }}
      />
      <Switch
        label="Notifica se l’app è in background"
        hint="Funziona solo se il browser mantiene attiva la pagina: con lo schermo spento Android può ritardarla."
        checked={settings.timerNotification}
        disabled={!caps.notifications}
        onChange={async (v) => {
          if (!v) return update({ timerNotification: false });
          const perm = await requestNotificationPermission();
          if (perm === 'granted') update({ timerNotification: true });
          else show('Permesso per le notifiche non concesso.', 'error');
        }}
      />
    </section>
  );
}

function CalendarSection({ settings }: { settings: Settings }) {
  const run = useAction();
  const programs = useLiveQuery(listPrograms, []) ?? [];
  const program = useLiveQuery(() => (settings.activeProgramId ? getProgram(settings.activeProgramId).then((p) => p ?? null) : null), [settings.activeProgramId]);
  return (
    <section className="card stack" aria-labelledby="s-cal">
      <h2 id="s-cal">Calendario</h2>
      <Field label="Programma attivo">
        <select className="input" value={settings.activeProgramId ?? ''} onChange={(e) => e.target.value && run(() => setActiveProgram(e.target.value))}>
          {!settings.activeProgramId && <option value="">Nessuno</option>}
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === 'archived' ? ' (archiviato)' : ''}</option>)}
        </select>
      </Field>
      {program && <ScheduleEditor program={program} />}
    </section>
  );
}

function BackupSection({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const run = useAction();
  const { show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const snapshots = useLiveQuery(() => listLocalSnapshots(), []) ?? [];
  const [snapshotToRestore, setSnapshotToRestore] = useState<number | null>(null);

  const exportJson = () =>
    run(async () => {
      const backup = await createBackup();
      downloadText(`diario-allenamenti-${fileStamp()}.json`, JSON.stringify(backup, null, 1), 'application/json');
    }, 'Backup esportato');

  const exportCsv = () =>
    run(async () => downloadText(`diario-allenamenti-serie-${fileStamp()}.csv`, await exportSetsCsv(), 'text/csv;charset=utf-8'), 'CSV esportato');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('File troppo grande per essere un backup.');
      setPending(parseBackup(await file.text()));
    } catch (err) {
      show(err instanceof Error && err.name === 'Error' ? err.message : errorMessage(err), 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const summary = pending ? summarizeBackup(pending) : null;

  return (
    <section className="card stack" aria-labelledby="s-backup">
      <h2 id="s-backup">Backup e sincronizzazione</h2>
      {getDataMode() === 'demo' ? (
        <p className="banner small">In modalità demo Google Drive è disattivato: i dati demo non vengono mai sincronizzati.</p>
      ) : (
        <DriveSection settings={settings} update={update} />
      )}

      <div className="divider" />
      <h3>File locali</h3>
      <div className="grid-2">
        <button type="button" className="btn" onClick={exportJson}>Esporta JSON</button>
        <button type="button" className="btn" onClick={exportCsv}>Esporta CSV</button>
      </div>
      <p className="hint">JSON = backup completo ripristinabile. CSV = tutte le serie, per Excel o altri strumenti (separatore «;»).</p>
      <button type="button" className="btn block" onClick={() => fileRef.current?.click()}>Importa backup…</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {snapshots.length > 0 && (
        <details className="disclosure">
          <summary>Copie di sicurezza locali ({snapshots.length})</summary>
          <p className="hint">Create automaticamente prima di ogni importazione o ripristino.</p>
          <div className="list">
            {snapshots.map((s) => (
              <div key={s.id} className="list-item">
                <span className="grow small">
                  <span className="strong">{formatDateIt(toISODate(new Date(s.createdAt)))} {formatTime(s.createdAt)}</span>
                  <span className="muted" style={{ display: 'block' }}>{s.reason}</span>
                </span>
                <button type="button" className="btn sm" onClick={() => setSnapshotToRestore(s.id)}>Ripristina</button>
              </div>
            ))}
          </div>
        </details>
      )}

      <Modal open={!!pending} title="Importa backup" onClose={() => setPending(null)}>
        {summary && (
          <div className="stack">
            <p className="banner good small">File valido.</p>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Creato il {formatDateIt(toISODate(new Date(summary.exportedAt)))} alle {formatTime(summary.exportedAt)} (app {summary.appVersion})</li>
              <li>{summary.programs} programmi · {summary.exercises} esercizi</li>
              <li>{summary.sessions} allenamenti · {summary.sets} serie registrate</li>
            </ul>
            <button type="button" className="btn primary block" onClick={async () => {
              const b = pending!;
              setPending(null);
              const stats = await run(() => mergeBackupIntoLocal(b));
              if (stats) show(`Unione completata: ${stats.added} nuovi, ${stats.updated} aggiornati.`, 'success');
            }}>
              Unisci ai dati attuali
            </button>
            <p className="hint">Aggiunge ciò che manca e aggiorna i record più recenti. Nessun duplicato.</p>
            <button type="button" className="btn danger block" onClick={() => setConfirmReplace(true)}>Sostituisci tutti i dati</button>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmReplace}
        danger
        title="Sostituire tutti i dati?"
        message="I dati attuali verranno sostituiti con quelli del backup. Prima viene creata automaticamente una copia di sicurezza locale."
        confirmLabel="Sostituisci"
        onCancel={() => setConfirmReplace(false)}
        onConfirm={async () => {
          const b = pending!;
          setConfirmReplace(false);
          setPending(null);
          await run(() => replaceAllData(b, 'Prima dell’importazione di un backup'), 'Dati ripristinati dal backup');
        }}
      />
      <ConfirmDialog
        open={snapshotToRestore !== null}
        danger
        title="Ripristinare la copia di sicurezza?"
        message="I dati attuali verranno sostituiti (anche di questi viene creata una copia)."
        confirmLabel="Ripristina"
        onCancel={() => setSnapshotToRestore(null)}
        onConfirm={async () => {
          const id = snapshotToRestore!;
          setSnapshotToRestore(null);
          await run(() => restoreLocalSnapshot(id), 'Copia di sicurezza ripristinata');
        }}
      />
    </section>
  );
}

function DriveSection({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const { show } = useToast();
  const online = useOnline();
  const [clientId, setClientIdState] = useState(getClientId() ?? '');
  const [connected, setConnected] = useState(hasValidToken());
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [backups, setBackups] = useState<DriveFile[] | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<DriveFile | null>(null);
  const meta = useLiveQuery(() => getSyncMeta(), []);
  const pendingChanges = useLiveQuery(() => countPendingChanges(), []);

  useEffect(() => {
    const id = setInterval(() => setConnected(hasValidToken()), 5000);
    return () => clearInterval(id);
  }, []);

  const task = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      show(errorMessage(err), 'error');
      setConnected(hasValidToken());
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    task('connect', async () => {
      await signIn();
      setConnected(true);
      const client = createDriveClient();
      setEmail(await client.accountEmail().catch(() => null));
      show('Google Drive collegato', 'success');
    });

  if (!getClientId()) {
    return (
      <div className="stack">
        <p className="small">
          <IconCloud size={18} style={{ verticalAlign: 'middle' }} /> Per usare Google Drive serve un <strong>Client ID OAuth</strong> di Google
          (gratuito, da creare una volta sola: istruzioni nel README, sezione «Google Drive»).
        </p>
        <Field label="Client ID OAuth">
          <input className="input" value={clientId} placeholder="xxxx.apps.googleusercontent.com" onChange={(e) => setClientIdState(e.target.value)} />
        </Field>
        <button type="button" className="btn block" disabled={!/\.apps\.googleusercontent\.com$/.test(clientId.trim())}
          onClick={() => { setClientId(clientId); setClientIdState(clientId.trim()); show('Client ID salvato', 'success'); }}>
          Salva Client ID
        </button>
      </div>
    );
  }

  const lastSync = meta?.lastSyncAt ? `${formatDateIt(toISODate(new Date(meta.lastSyncAt)))} ${formatTime(meta.lastSyncAt)}` : 'mai';
  const lastBackup = meta?.lastBackupAt ? `${formatDateIt(toISODate(new Date(meta.lastBackupAt)))} ${formatTime(meta.lastBackupAt)}` : 'mai';

  return (
    <div className="stack">
      <div className="spread">
        <span className="row strong"><IconCloud /> Google Drive</span>
        <span className={`badge ${connected ? 'good' : ''}`}>{connected ? 'Collegato' : 'Non collegato'}</span>
      </div>
      {email && <p className="small muted">{email}</p>}
      {!online && <p className="banner small">Offline: le modifiche restano sul telefono e verranno sincronizzate al ritorno della rete.</p>}
      <p className="small muted">
        Ultima sincronizzazione: {lastSync} · Ultimo backup: {lastBackup}
        {pendingChanges ? ` · ${pendingChanges} modifiche da sincronizzare` : ''}
      </p>
      {meta?.lastError && <p className="banner bad small">Ultimo errore: {meta.lastError}</p>}

      {!connected ? (
        <button type="button" className="btn primary block" disabled={!online || !!busy} onClick={connect}>
          {busy === 'connect' ? 'Connessione…' : 'Connetti Google Drive'}
        </button>
      ) : (
        <>
          <div className="grid-2">
            <button type="button" className="btn" disabled={!online || !!busy} onClick={() => task('sync', async () => {
              const r = await syncWithDrive(createDriveClient());
              show(`Sincronizzato: ${r.stats.added} nuovi, ${r.stats.updated} aggiornati${r.stats.conflicts ? `, ${r.stats.conflicts} conflitti risolti` : ''}.`, 'success');
            })}>
              {busy === 'sync' ? 'Sincronizzo…' : 'Sincronizza ora'}
            </button>
            <button type="button" className="btn" disabled={!online || !!busy} onClick={() => task('backup', async () => {
              await backupToDrive(createDriveClient());
              show('Backup salvato su Google Drive', 'success');
              setBackups(null);
            })}>
              {busy === 'backup' ? 'Salvataggio…' : 'Backup ora'}
            </button>
          </div>
          <button type="button" className="btn block" disabled={!online || !!busy} onClick={() => task('list', async () => setBackups(await listDriveBackups(createDriveClient())))}>
            {busy === 'list' ? 'Caricamento…' : 'Ripristina un backup…'}
          </button>
          <button type="button" className="btn ghost block" disabled={!!busy} onClick={() => task('out', async () => { await signOut(); setConnected(false); setEmail(null); show('Google Drive disconnesso e accesso revocato', 'success'); })}>
            Disconnetti e revoca accesso
          </button>
        </>
      )}
      <Switch
        label="Backup automatico"
        hint="Sincronizza periodicamente e crea un backup al giorno quando l’app è aperta, online e collegata a Drive. Dopo un riavvio dell’app serve toccare «Connetti»."
        checked={settings.autoBackup}
        onChange={(v) => update({ autoBackup: v })}
      />
      {!isClientIdFromEnv() && (
        <button type="button" className="btn sm ghost" onClick={() => { setClientId(''); setClientIdState(''); void signOut(); setConnected(false); }}>
          Cambia Client ID
        </button>
      )}

      <Modal open={backups !== null} title="Backup su Google Drive" onClose={() => setBackups(null)}>
        {backups && (backups.length === 0 ? (
          <p className="muted">Nessun backup presente su Drive.</p>
        ) : (
          <div className="list">
            {backups.map((f) => (
              <div key={f.id} className="list-item">
                <span className="grow small">
                  <span className="strong">{new Date(f.modifiedTime).toLocaleString('it-IT')}</span>
                  <span className="muted" style={{ display: 'block' }}>{f.size ? `${formatNumber(Number(f.size) / 1024, 0)} KB` : f.name}</span>
                </span>
                <button type="button" className="btn sm" onClick={() => setRestoreTarget(f)}>Ripristina</button>
              </div>
            ))}
          </div>
        ))}
      </Modal>
      <ConfirmDialog
        open={!!restoreTarget}
        danger
        title="Ripristinare questo backup?"
        message="Tutti i dati del telefono verranno sostituiti con quelli del backup. Prima viene creata una copia di sicurezza locale."
        confirmLabel="Ripristina"
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => {
          const f = restoreTarget!;
          setRestoreTarget(null);
          setBackups(null);
          void task('restore', async () => {
            const s = await restoreFromDrive(createDriveClient(), f.id);
            show(`Ripristinati ${s.sessions} allenamenti`, 'success');
          });
        }}
      />
    </div>
  );
}

function DemoSection() {
  const run = useAction();
  const mode = getDataMode();
  const [confirm, setConfirm] = useState(false);
  const switchTo = (m: 'real' | 'demo') => {
    setDataMode(m);
    window.location.reload();
  };
  return (
    <section className="card stack" aria-labelledby="s-demo">
      <h2 id="s-demo">Dati demo</h2>
      <p className="small muted">
        La modalità demo usa un database separato con allenamenti di prova, per esplorare grafici e progressioni.
        I tuoi dati reali non vengono mai toccati né mescolati.
      </p>
      {mode === 'demo' ? (
        <>
          <p className="banner small">Stai usando la modalità demo.</p>
          <button type="button" className="btn block" onClick={() => setConfirm(true)}>Genera dati demo (6 mesi)</button>
          <button type="button" className="btn primary block" onClick={() => switchTo('real')}>Torna ai dati reali</button>
        </>
      ) : (
        <button type="button" className="btn block" onClick={() => switchTo('demo')}>Apri la modalità demo</button>
      )}
      <ConfirmDialog
        open={confirm}
        title="Generare i dati demo?"
        message="Il contenuto del database demo verrà sostituito con 6 mesi di allenamenti simulati."
        confirmLabel="Genera"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await run(() => generateDemoData(db, todayISO()), 'Dati demo generati');
        }}
      />
    </section>
  );
}

function InfoSection() {
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null);
  const caps = deviceCapabilities();
  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      const persisted = await navigator.storage?.persisted?.().catch(() => undefined);
      setStorage({ usage: est?.usage, quota: est?.quota, persisted });
    })();
  }, []);
  const logs = logger.recent();
  const yesNo = (v: boolean) => (v ? 'sì' : 'no');
  return (
    <section className="card stack-sm" aria-labelledby="s-info">
      <h2 id="s-info">Informazioni</h2>
      <table className="data">
        <tbody>
          <tr><td>Versione app</td><td>{__APP_VERSION__}</td></tr>
          <tr><td>Versione database</td><td>{DB_VERSION}</td></tr>
          <tr><td>Formato backup</td><td>{BACKUP_FORMAT_VERSION}</td></tr>
          <tr><td>Database</td><td>{db.name}</td></tr>
          <tr><td>Archiviazione persistente</td><td>{storage?.persisted === undefined ? '—' : yesNo(storage.persisted)}</td></tr>
          <tr><td>Spazio usato</td><td>{storage?.usage !== undefined ? `${formatNumber(storage.usage / 1024 / 1024, 1)} MB` : '—'}</td></tr>
          <tr><td>Vibrazione / Wake lock / Notifiche</td><td>{yesNo(caps.vibration)} / {yesNo(caps.wakeLock)} / {yesNo(caps.notifications)}</td></tr>
        </tbody>
      </table>
      <details className="disclosure">
        <summary>Diagnostica ({logs.length} avvisi)</summary>
        {logs.length === 0 ? <p className="small muted">Nessun errore registrato in questa sessione.</p> : (
          <ul className="tiny" style={{ margin: 0, paddingLeft: 16 }}>
            {logs.map((l, i) => <li key={i}><strong>{formatTime(l.at)} {l.level}</strong> [{l.scope}] {l.message}{l.detail ? ` — ${l.detail}` : ''}</li>)}
          </ul>
        )}
      </details>
    </section>
  );
}
