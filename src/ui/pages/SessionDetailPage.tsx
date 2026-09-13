import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  addSet, completeSet, deleteSession, getSessionDetail, removeSet, setExerciseStatus, uncompleteSet, updateSessionExercise,
  updateSessionInfo, updateSet,
} from '../../data/repo/sessions';
import { loadHistoryData } from '../../data/repo/stats';
import { sessionRecords, sessionVolume } from '../../domain/dashboard';
import { RECORD_LABEL } from '../../domain/records';
import type { CardioField, SessionExercise, SessionExerciseStatus, SetRecord, WeightUnit } from '../../domain/types';
import { formatDateLong, formatTime, isValidISODate } from '../../domain/dates';
import { formatDuration, formatNumber } from '../../domain/format';
import { formatVolume, formatWeight, kgToUnit, unitToKg } from '../../domain/units';
import { EXERCISE_STATUS_LABEL } from '../../domain/session';
import { useSettings } from '../hooks';
import { useAction } from '../toast';
import { ConfirmDialog, EmptyState, Modal, PageHeader, Stat, Switch } from '../components/common';
import { NumberStepper } from '../components/NumberStepper';
import { optionalNumber, restText, STATUS_CLASS, targetText } from '../format';
import { IconCheck, IconEdit, IconPlus, IconTrash, IconTrophy } from '../icons';

export function SessionDetailPage() {
  const { sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const run = useAction();
  const settings = useSettings();
  const unit = settings.weightUnit;
  const detail = useLiveQuery(() => getSessionDetail(sessionId).then((d) => d ?? null), [sessionId]);
  const data = useLiveQuery(loadHistoryData, []);
  const [editing, setEditing] = useState<{ set: SetRecord; se: SessionExercise } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const records = useMemo(() => (data ? sessionRecords(data, sessionId, settings.oneRmFormula) : []), [data, sessionId, settings.oneRmFormula]);

  if (detail === undefined) return <main className="page muted">Caricamento…</main>;
  if (detail === null) {
    return (
      <main className="page">
        <PageHeader title="Allenamento" back="/history" />
        <EmptyState title="Allenamento non trovato" />
      </main>
    );
  }
  const { session, exercises } = detail;
  const inProgress = session.status !== 'completed';
  const volume = data ? sessionVolume(data, session.id) : null;
  const setsDone = exercises.reduce((a, e) => a + e.sets.filter((s) => s.completed).length, 0);

  return (
    <main className="page stack">
      <PageHeader title={<span style={{ textTransform: 'capitalize' }}>{formatDateLong(session.date, true)}</span>} back="/history" />

      {params.get('done') && !inProgress && <p className="banner good"><IconCheck /> Allenamento salvato.</p>}
      {inProgress && (
        <Link to={`/workout/${session.id}`} className="banner info">Allenamento in corso · tocca per riprendere</Link>
      )}

      <section className="card stack">
        <div className="row">
          <span className="code-badge lg">{session.templateCode}</span>
          <div className="grow">
            <h2>{session.templateName}</h2>
            <p className="small muted">{session.programName}</p>
          </div>
        </div>
        <div className="grid-3">
          <Stat label="Durata" value={formatDuration(session.activeDurationSec)} hint={session.endedAt ? `${formatTime(session.startedAt)}–${formatTime(session.endedAt)}` : formatTime(session.startedAt)} />
          <Stat label="Serie" value={setsDone} />
          <Stat label="Volume" value={volume === null ? '—' : formatVolume(volume, unit)} />
        </div>
        {session.pauses.length > 0 && (
          <p className="tiny muted">Pause escluse dalla durata: {session.pauses.length}</p>
        )}
        <label className="field">
          <span>Note</span>
          <textarea
            className="input"
            defaultValue={session.notes}
            key={session.updatedAt}
            placeholder="Es. oggi poca energia"
            onBlur={(e) => e.target.value !== session.notes && run(() => updateSessionInfo(session.id, { notes: e.target.value }))}
          />
        </label>
        <details className="disclosure">
          <summary>Correggi data</summary>
          <input
            className="input"
            type="date"
            defaultValue={session.date}
            onChange={(e) => isValidISODate(e.target.value) && run(() => updateSessionInfo(session.id, { date: e.target.value }), 'Data aggiornata')}
          />
        </details>
      </section>

      {records.length > 0 && (
        <section className="card stack-sm" aria-label="Record">
          {records.map((r) => (
            <div key={`${r.exerciseId}-${r.type}-${r.weightKg}`} className="row">
              <IconTrophy style={{ color: 'var(--record)' }} />
              <span className="grow small">
                <span className="strong">🏆 Nuovo record · {r.exerciseName}</span>
                <span className="muted" style={{ display: 'block' }}>
                  {RECORD_LABEL[r.type]}: {recordValue(r.type, r.value, r.weightKg, unit)} (prima {recordValue(r.type, r.previous, r.weightKg, unit)})
                </span>
              </span>
            </div>
          ))}
          <p className="tiny muted">Un dato anomalo? Modifica la serie o escludila dalle statistiche.</p>
        </section>
      )}

      {exercises.map(({ exercise: se, sets }) => (
        <section key={se.id} className="card stack-sm" aria-labelledby={`h-${se.id}`}>
          <div className="spread">
            <h3 id={`h-${se.id}`} className="grow">{se.name}</h3>
            <select
              className={`badge ${STATUS_CLASS[se.status]}`}
              style={{ border: 0, minHeight: 32 }}
              aria-label={`Stato ${se.name}`}
              value={se.statusManual ? se.status : 'auto'}
              onChange={(e) => run(() => setExerciseStatus(se.id, e.target.value as SessionExerciseStatus | 'auto'))}
            >
              <option value="auto">{EXERCISE_STATUS_LABEL[se.status]} (auto)</option>
              <option value="completed">Completato</option>
              <option value="partial">Parziale</option>
              <option value="skipped">Saltato</option>
            </select>
          </div>
          <p className="small muted">
            Obiettivo {targetText(se)}{se.kind !== 'cardio' && se.restSec !== null ? ` · recupero ${restText(se.restSec)}` : ''}{se.templateNotes ? ` · ${se.templateNotes}` : ''}
          </p>
          <SetsTable se={se} sets={sets} unit={unit} onEdit={(set) => setEditing({ set, se })} />
          {se.notes && <p className="small"><span className="muted">Nota:</span> {se.notes}</p>}
          <div className="row-wrap">
            <button type="button" className="btn sm" onClick={() => run(() => addSet(se.id))}><IconPlus size={16} /> Serie</button>
            <input
              className="input grow"
              style={{ minHeight: 38 }}
              placeholder="Nota esercizio"
              defaultValue={se.notes}
              aria-label={`Nota ${se.name}`}
              onBlur={(e) => e.target.value !== se.notes && run(() => updateSessionExercise(se.id, { notes: e.target.value }))}
            />
          </div>
        </section>
      ))}

      <button type="button" className="btn danger block" onClick={() => setConfirmDelete(true)}>
        <IconTrash size={20} /> Elimina allenamento
      </button>

      {editing && (
        <SetEditor
          key={editing.set.id}
          set={exercises.flatMap((e) => e.sets).find((s) => s.id === editing.set.id) ?? editing.set}
          se={editing.se}
          unit={unit}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Eliminare questo allenamento?"
        message="L’allenamento e tutte le sue serie verranno rimossi dallo storico, dai grafici e dalle statistiche."
        confirmLabel="Elimina"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await run(() => deleteSession(session.id), 'Allenamento eliminato');
          navigate('/history', { replace: true });
        }}
      />
    </main>
  );
}

function recordValue(type: string, value: number, weightKg: number | null, unit: WeightUnit) {
  if (type === 'max_reps_at_weight') return `${value} rip.${weightKg !== null ? ` a ${formatWeight(weightKg, unit)}` : ''}`;
  if (type === 'max_volume') return formatVolume(value, unit);
  return formatWeight(value, unit);
}

const CARDIO_COLS: { key: CardioField; label: string; fmt: (v: number) => string }[] = [
  { key: 'durationSec', label: 'Durata', fmt: (v) => formatDuration(v) },
  { key: 'distanceKm', label: 'Km', fmt: (v) => formatNumber(v, 2) },
  { key: 'speedKmh', label: 'Km/h', fmt: (v) => formatNumber(v, 1) },
  { key: 'inclinePct', label: 'Incl. %', fmt: (v) => formatNumber(v, 1) },
  { key: 'level', label: 'Livello', fmt: (v) => formatNumber(v, 0) },
  { key: 'calories', label: 'Kcal', fmt: (v) => formatNumber(v, 0) },
];

function SetsTable({ se, sets, unit, onEdit }: { se: SessionExercise; sets: SetRecord[]; unit: WeightUnit; onEdit: (s: SetRecord) => void }) {
  if (!sets.length) return <p className="small muted">Nessuna serie.</p>;
  const cardio = se.kind === 'cardio';
  const cols = cardio ? CARDIO_COLS.filter((c) => se.cardioFields.includes(c.key) || sets.some((s) => s[c.key] !== null)) : [];
  const showRpe = sets.some((s) => s.rpe !== null || s.rir !== null);
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>#</th>
            {cardio ? cols.map((c) => <th key={c.key}>{c.label}</th>) : (
              <>
                {se.kind === 'strength' && <th>Carico</th>}
                <th>Rip.</th>
                <th>Recupero</th>
                {showRpe && <th>RPE / RIR</th>}
              </>
            )}
            <th><span className="sr-only">Modifica</span></th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s) => (
            <tr key={s.id} className={!s.completed ? 'unrecorded' : s.excludedFromStats ? 'excluded' : undefined}>
              <td>{s.setNumber}</td>
              {!s.completed ? (
                <td colSpan={cardio ? cols.length : (se.kind === 'strength' ? 3 : 2) + (showRpe ? 1 : 0)}>non registrata</td>
              ) : cardio ? (
                cols.map((c) => <td key={c.key}>{s[c.key] === null ? '—' : c.fmt(s[c.key] as number)}</td>)
              ) : (
                <>
                  {se.kind === 'strength' && <td>{formatWeight(s.weightKg, unit)}</td>}
                  <td>{s.reps ?? '—'}</td>
                  <td>{restText(s.restSec)}</td>
                  {showRpe && <td>{optionalNumber(s.rpe)} / {optionalNumber(s.rir, 0)}</td>}
                </>
              )}
              <td>
                <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} aria-label={`Modifica serie ${s.setNumber}`} onClick={() => onEdit(s)}>
                  <IconEdit size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sets.some((s) => s.notes) && (
        <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {sets.filter((s) => s.notes).map((s) => <li key={s.id}>Serie {s.setNumber}: {s.notes}</li>)}
        </ul>
      )}
    </div>
  );
}

function SetEditor({ set, se, unit, onClose }: { set: SetRecord; se: SessionExercise; unit: WeightUnit; onClose: () => void }) {
  const run = useAction();
  const cardio = se.kind === 'cardio';
  const upd = (patch: Parameters<typeof updateSet>[1]) => run(() => updateSet(set.id, patch));
  return (
    <Modal open title={`${se.name} · serie ${set.setNumber}`} onClose={onClose}>
      <div className="stack">
        {cardio ? (
          <>
            <NumberStepper label="Durata" unit="min" compact step={1} decimals={1} value={set.durationSec === null ? null : Math.round((set.durationSec / 60) * 10) / 10}
              onChange={(v) => upd({ durationSec: v === null ? null : Math.round(v * 60) })} />
            <NumberStepper label="Distanza" unit="km" compact step={0.1} value={set.distanceKm} onChange={(v) => upd({ distanceKm: v })} />
            <NumberStepper label="Velocità" unit="km/h" compact step={0.1} decimals={1} value={set.speedKmh} onChange={(v) => upd({ speedKmh: v })} />
            <NumberStepper label="Inclinazione" unit="%" compact step={0.5} decimals={1} value={set.inclinePct} onChange={(v) => upd({ inclinePct: v })} />
            <NumberStepper label="Livello" compact integer step={1} value={set.level} onChange={(v) => upd({ level: v })} />
            <NumberStepper label="Calorie" unit="kcal" compact integer step={5} max={5000} value={set.calories} onChange={(v) => upd({ calories: v })} />
          </>
        ) : (
          <>
            {se.kind === 'strength' && (
              <NumberStepper label="Carico" unit={unit} step={unit === 'kg' ? 2.5 : 5} max={unit === 'kg' ? 2000 : 4400}
                value={set.weightKg === null ? null : kgToUnit(set.weightKg, unit)} onChange={(v) => upd({ weightKg: v === null ? null : unitToKg(v, unit) })} />
            )}
            <NumberStepper label="Ripetizioni" integer step={1} max={500} value={set.reps} onChange={(v) => upd({ reps: v })} />
            <NumberStepper label="Recupero" unit="s" compact integer step={15} max={3600} value={set.restSec} onChange={(v) => upd({ restSec: v })} />
            <div className="grid-2">
              <NumberStepper label="RPE" compact step={0.5} min={1} max={10} decimals={1} startFrom={8} value={set.rpe} onChange={(v) => upd({ rpe: v })} />
              <NumberStepper label="RIR" compact integer step={1} max={10} startFrom={2} value={set.rir} onChange={(v) => upd({ rir: v })} />
            </div>
          </>
        )}
        <input className="input" placeholder="Nota" defaultValue={set.notes} onBlur={(e) => e.target.value !== set.notes && upd({ notes: e.target.value })} />
        {set.completed && (
          <Switch
            label="Escludi da statistiche e record"
            hint="Per dati anomali o inseriti per errore. La serie resta visibile nello storico."
            checked={set.excludedFromStats}
            onChange={(v) => upd({ excludedFromStats: v })}
          />
        )}
        <div className="grid-2">
          {set.completed ? (
            <button type="button" className="btn" onClick={() => run(() => uncompleteSet(set.id))}>Segna non registrata</button>
          ) : (
            <button type="button" className="btn good" onClick={() => run(() => completeSet(set.id, {}, set.createdAt))}>Segna eseguita</button>
          )}
          <button type="button" className="btn danger" onClick={async () => { await run(() => removeSet(set.id)); onClose(); }}>
            <IconTrash size={18} /> Elimina serie
          </button>
        </div>
        <button type="button" className="btn primary block" onClick={onClose}>Fatto</button>
      </div>
    </Modal>
  );
}
