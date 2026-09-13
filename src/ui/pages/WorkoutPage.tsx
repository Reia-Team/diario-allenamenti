import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  addExerciseToSession, addSet, completeSet, deleteSession, finishSession, getRecentPerformances, getSessionDetail,
  pauseSession, removeSet, resumeSession, setCurrentIndex, setExerciseStatus, uncompleteSet, updateSessionInfo, updateSessionExercise,
  updateSet, type SessionExerciseDetail,
} from '../../data/repo/sessions';
import { getExercise } from '../../data/repo/exercises';
import type { CardioField, SetRecord, Settings, WorkoutSession } from '../../domain/types';
import { activeDurationMs, EXERCISE_STATUS_LABEL } from '../../domain/session';
import { suggestProgression } from '../../domain/progression';
import { formatPerformance } from '../../domain/metrics';
import { formatDateLong } from '../../domain/dates';
import { formatClock } from '../../domain/format';
import { kgToUnit, unitToKg } from '../../domain/units';
import { restTimer } from '../../services/timer';
import { unlockAudio } from '../../services/feedback';
import { useWakeLock } from '../../services/wakeLock';
import { useNow, useSettings, useTimerState } from '../hooks';
import { useAction } from '../toast';
import { ConfirmDialog, EmptyState, Modal, PageHeader } from '../components/common';
import { NumberStepper } from '../components/NumberStepper';
import { RestTimerPanel, TimerMini } from '../components/RestTimerPanel';
import { ExercisePicker } from '../components/ExercisePicker';
import { restText, setValueText, STATUS_CLASS, targetText } from '../format';
import {
  IconAlert, IconCheck, IconChevronLeft, IconChevronRight, IconHistory, IconInfo, IconMinus, IconPause, IconPlay, IconPlus,
  IconTrendUp, IconX,
} from '../icons';

export function WorkoutPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const run = useAction();
  const settings = useSettings();
  const detail = useLiveQuery(() => getSessionDetail(sessionId).then((d) => d ?? null), [sessionId]);
  const timer = useTimerState();
  const [timerOpen, setTimerOpen] = useState(true);
  const [finishOpen, setFinishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isActive = !!detail && detail.session.status !== 'completed';
  useWakeLock(isActive && settings.keepScreenOn);
  const now = useNow(1000, isActive);

  useEffect(() => {
    if (timer.status === 'running') setTimerOpen(true);
  }, [timer.startedAt, timer.status]);

  if (detail === undefined) return <div className="page no-nav muted">Caricamento…</div>;
  if (detail === null) {
    return (
      <main className="page no-nav">
        <PageHeader title="Allenamento" back="/" />
        <EmptyState title="Allenamento non trovato" />
      </main>
    );
  }
  if (detail.session.status === 'completed') return <Navigate to={`/history/${sessionId}`} replace />;

  const { session, exercises } = detail;
  const index = Math.min(Math.max(0, session.currentIndex), Math.max(0, exercises.length - 1));
  const current = exercises[index];
  const paused = session.status === 'paused';
  const elapsedSec = activeDurationMs(session.startedAt, session.pauses, now) / 1000;
  const goTo = (i: number) => {
    if (i >= 0 && i < exercises.length) void run(() => setCurrentIndex(session.id, i));
  };

  const togglePause = () =>
    run(async () => {
      if (paused) {
        await resumeSession(session.id);
        restTimer.resume();
      } else {
        await pauseSession(session.id);
        restTimer.pause();
      }
    });

  const finish = async () => {
    restTimer.stop();
    const done = await run(() => finishSession(session.id));
    if (done) navigate(`/history/${session.id}?done=1`, { replace: true });
  };

  return (
    <main className="page no-nav">
      <div className="workout-top">
        <div className="row">
          <button type="button" className="icon-btn" aria-label="Torna alla Home (l’allenamento resta in corso)" onClick={() => navigate('/')}>
            <IconChevronLeft />
          </button>
          <div className="grow">
            <div className="strong ellipsis">{session.templateCode} · {session.templateName}</div>
            <div className="small muted num" aria-label="Durata effettiva">
              {formatClock(elapsedSec)}{paused ? ' · in pausa' : ''}
            </div>
          </div>
          <button type="button" className="btn sm" onClick={togglePause}>
            {paused ? <IconPlay size={18} /> : <IconPause size={18} />} {paused ? 'Riprendi' : 'Pausa'}
          </button>
          <button type="button" className="btn sm primary" onClick={() => setFinishOpen(true)}>Termina</button>
        </div>
        <nav className="exercise-strip" aria-label="Esercizi">
          {exercises.map((e, i) => (
            <button
              key={e.exercise.id}
              type="button"
              className={`st-${e.exercise.status}`}
              aria-current={i === index}
              aria-label={`${i + 1}. ${e.exercise.name} — ${EXERCISE_STATUS_LABEL[e.exercise.status]}`}
              onClick={() => goTo(i)}
            >
              {e.exercise.status === 'completed' ? <IconCheck size={16} /> : null}
              {i + 1}
            </button>
          ))}
          <button type="button" aria-label="Aggiungi esercizio a questo allenamento" onClick={() => setPickerOpen(true)}>
            <IconPlus size={18} />
          </button>
        </nav>
      </div>

      {current ? (
        <ExerciseCard key={current.exercise.id} item={current} session={session} settings={settings} />
      ) : (
        <EmptyState title="Nessun esercizio in questa scheda">
          <button type="button" className="btn primary" onClick={() => setPickerOpen(true)}>Aggiungi esercizio</button>
        </EmptyState>
      )}

      <div className="workout-bottom">
        <div className="workout-bottom-inner">
          <button type="button" className="btn lg" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Esercizio precedente">
            <IconChevronLeft />
          </button>
          <div className="center">
            {timer.status !== 'idle' && !timerOpen ? (
              <TimerMini onClick={() => setTimerOpen(true)} />
            ) : (
              <span className="muted num">{exercises.length ? `${index + 1} / ${exercises.length}` : ''}</span>
            )}
          </div>
          {index < exercises.length - 1 ? (
            <button type="button" className="btn lg primary" onClick={() => goTo(index + 1)} aria-label="Esercizio successivo">
              Avanti <IconChevronRight />
            </button>
          ) : (
            <button type="button" className="btn lg good" onClick={() => setFinishOpen(true)}>Fine</button>
          )}
        </div>
      </div>

      {timerOpen && <RestTimerPanel onMinimize={() => setTimerOpen(false)} />}

      {paused && (
        <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Allenamento in pausa">
          <IconPause size={56} />
          <h1>Allenamento in pausa</h1>
          <p className="muted">Il tempo di pausa non viene conteggiato nella durata.</p>
          <button type="button" className="btn primary xl" style={{ minWidth: 260 }} onClick={togglePause}>
            <IconPlay /> Riprendi
          </button>
        </div>
      )}

      <FinishDialog
        open={finishOpen}
        detail={detail}
        onCancel={() => setFinishOpen(false)}
        onFinish={finish}
        onDelete={() => {
          setFinishOpen(false);
          setDeleteOpen(true);
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        danger
        title="Eliminare l’allenamento?"
        message="L’allenamento in corso e tutte le serie registrate verranno eliminati. Usa questa opzione solo se l’hai avviato per errore."
        confirmLabel="Elimina"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          restTimer.stop();
          await run(() => deleteSession(session.id), 'Allenamento eliminato');
          navigate('/', { replace: true });
        }}
      />
      <ExercisePicker
        open={pickerOpen}
        title="Aggiungi esercizio"
        onClose={() => setPickerOpen(false)}
        onPick={async (ex) => {
          setPickerOpen(false);
          const se = await run(() => addExerciseToSession(session.id, ex.id));
          if (se) goTo(se.order);
        }}
      />
    </main>
  );
}

function FinishDialog({ open, detail, onCancel, onFinish, onDelete }: {
  open: boolean;
  detail: { session: WorkoutSession; exercises: SessionExerciseDetail[] };
  onCancel: () => void;
  onFinish: () => void;
  onDelete: () => void;
}) {
  const run = useAction();
  const [notes, setNotes] = useState(detail.session.notes);
  useEffect(() => {
    if (open) setNotes(detail.session.notes);
  }, [open, detail.session.notes]);
  const counts = useMemo(() => {
    const c = { completed: 0, partial: 0, skipped: 0, pending: 0, unconfirmed: 0 };
    for (const e of detail.exercises) {
      c[e.exercise.status]++;
      c.unconfirmed += e.sets.filter((s) => !s.completed).length;
    }
    return c;
  }, [detail]);

  return (
    <Modal
      open={open}
      title="Terminare l’allenamento?"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>Continua</button>
          <button
            type="button"
            className="btn good"
            onClick={async () => {
              if (notes !== detail.session.notes) await run(() => updateSessionInfo(detail.session.id, { notes }));
              onFinish();
            }}
          >
            <IconCheck /> Termina e salva
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-3">
          <div className="stat"><span className="label">Completati</span><span className="value">{counts.completed}</span></div>
          <div className="stat"><span className="label">Parziali</span><span className="value">{counts.partial}</span></div>
          <div className="stat"><span className="label">Da fare</span><span className="value">{counts.pending + counts.skipped}</span></div>
        </div>
        {counts.unconfirmed > 0 && (
          <p className="banner info small">
            <IconInfo />
            {counts.unconfirmed} {counts.unconfirmed === 1 ? 'serie non confermata verrà salvata' : 'serie non confermate verranno salvate'} come
            «non registrate»: non entrano in grafici e statistiche. Gli esercizi senza serie risultano saltati.
          </p>
        )}
        <label className="field">
          <span>Note sull’allenamento</span>
          <textarea className="input" placeholder="Es. oggi poca energia" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button type="button" className="btn sm danger" onClick={onDelete}>Elimina allenamento avviato per errore</button>
      </div>
    </Modal>
  );
}

const CARDIO_FIELD_DEF: Record<CardioField, { label: string; unit: string; step: number; decimals: number; integer?: boolean; max: number }> = {
  durationSec: { label: 'Durata', unit: 'min', step: 1, decimals: 1, max: 600 },
  distanceKm: { label: 'Distanza', unit: 'km', step: 0.1, decimals: 2, max: 500 },
  speedKmh: { label: 'Velocità', unit: 'km/h', step: 0.1, decimals: 1, max: 60 },
  inclinePct: { label: 'Inclinazione', unit: '%', step: 0.5, decimals: 1, max: 40 },
  level: { label: 'Livello', unit: '', step: 1, decimals: 0, integer: true, max: 100 },
  calories: { label: 'Calorie', unit: 'kcal', step: 5, decimals: 0, integer: true, max: 5000 },
};

function ExerciseCard({ item, session, settings }: { item: SessionExerciseDetail; session: WorkoutSession; settings: Settings }) {
  const run = useAction();
  const { exercise: se, sets } = item;
  const unit = settings.weightUnit;
  const exercise = useLiveQuery(() => getExercise(se.exerciseId), [se.exerciseId]);
  const recent = useLiveQuery(
    () => getRecentPerformances(se.exerciseId, { excludeSessionId: session.id, limit: 5 }),
    [se.exerciseId, session.id],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restEdit, setRestEdit] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notes, setNotes] = useState(se.notes);

  const currentSet = sets.find((s) => !s.completed);
  const openId = expandedId ?? currentSet?.id ?? null;
  const cardio = se.kind === 'cardio';

  const suggestion = recent
    ? suggestProgression({
        rule: exercise?.progression ?? settings.defaultProgression,
        kind: se.kind,
        target: { sets: se.targetSets, repsMin: se.repsMin, repsMax: se.repsMax },
        lastSets: recent[0]?.sets ?? [],
        previousSets: recent[1]?.sets,
        unit,
      })
    : null;

  const changeWeight = (set: SetRecord, kg: number | null) =>
    run(async () => {
      await updateSet(set.id, { weightKg: kg });
      // Le serie successive ancora da fare seguono il nuovo carico: meno tocchi.
      if (!set.completed) {
        for (const s of sets) if (!s.completed && s.setNumber > set.setNumber) await updateSet(s.id, { weightKg: kg });
      }
    });

  const complete = (set: SetRecord) => {
    unlockAudio();
    void run(async () => {
      await completeSet(set.id);
      setExpandedId(null);
      if (se.restSec && se.restSec > 0) restTimer.start({ durationSec: se.restSec, setId: set.id, label: se.name });
    });
  };

  const applySuggestion = () => {
    if (suggestion?.weightKg == null) return;
    const kg = suggestion.weightKg;
    void run(async () => {
      for (const s of sets) if (!s.completed) await updateSet(s.id, { weightKg: kg });
    }, 'Suggerimento applicato alle serie da fare');
  };

  const lastSetToRemove = [...sets].reverse().find((s) => !s.completed);

  return (
    <article className="stack" style={{ marginTop: 14 }} aria-labelledby={`ex-${se.id}`}>
      <header className="stack-sm">
        <div className="spread">
          <span className="small muted">{se.muscleGroup}</span>
          <span className={`badge ${STATUS_CLASS[se.status]}`}>{EXERCISE_STATUS_LABEL[se.status]}</span>
        </div>
        <h2 id={`ex-${se.id}`} className="exercise-name">{se.name}</h2>
        {se.templateNotes && <p className="badge accent" style={{ alignSelf: 'flex-start' }}>{se.templateNotes}</p>}
      </header>

      <section className="card stack">
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="label">Obiettivo</div>
            <div className="target-big">{targetText(se)}</div>
          </div>
          {!cardio && (
            <button type="button" className="btn sm" onClick={() => setRestEdit((v) => !v)} aria-expanded={restEdit}>
              Recupero {restText(se.restSec)}
            </button>
          )}
        </div>
        {restEdit && (
          <NumberStepper
            label="Recupero"
            unit="s"
            compact
            integer
            step={15}
            min={0}
            max={900}
            value={se.restSec}
            onChange={(v) => run(() => updateSessionExercise(se.id, { restSec: v }))}
          />
        )}
        <div className="divider" />
        <div className="spread">
          <div className="grow">
            <div className="label">Ultima volta</div>
            {recent === undefined ? (
              <div className="muted">…</div>
            ) : recent[0] ? (
              <>
                <div className="strong big num">{formatPerformance(recent[0].sets, se.kind, unit)}</div>
                <div className="tiny muted">{formatDateLong(recent[0].session.date, true)}</div>
              </>
            ) : (
              <div className="muted">Nessuna prestazione precedente</div>
            )}
          </div>
          {!!recent?.length && (
            <button type="button" className="icon-btn" aria-label="Storico esercizio" onClick={() => setHistoryOpen(true)}>
              <IconHistory />
            </button>
          )}
        </div>
        {suggestion?.type === 'no_data' && (
          <p className="small muted">Prima volta: scegli un carico con cui completare le ripetizioni con buona tecnica.</p>
        )}
        {suggestion && suggestion.type !== 'none' && suggestion.type !== 'no_data' && (
          <div className={`suggestion ${suggestion.worsening ? 'worse' : suggestion.type === 'increase' ? 'increase' : ''}`}>
            {suggestion.worsening ? <IconAlert /> : suggestion.type === 'increase' ? <IconTrendUp /> : <IconInfo />}
            <div className="grow stack-sm">
              <span className="label">Suggerimento</span>
              <span className="title">{suggestion.message}</span>
              <span className="small">{suggestion.worsening?.message ?? suggestion.detail}</span>
              {suggestion.type === 'increase' && sets.some((s) => !s.completed) && (
                <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={applySuggestion}>
                  Usa questo carico
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="stack-sm" aria-label="Serie">
        {sets.map((set) =>
          set.id === openId ? (
            <div key={set.id} className="set-current">
              <div className="spread">
                <span className="strong big">Serie {set.setNumber}{set.completed ? ' · registrata' : ''}</span>
                {expandedId && (
                  <button type="button" className="icon-btn" aria-label="Chiudi" onClick={() => setExpandedId(null)}><IconX /></button>
                )}
              </div>
              {cardio ? (
                <div className="stack-sm">
                  {(se.cardioFields.length ? se.cardioFields : (['durationSec'] as CardioField[])).map((f) => {
                    const def = CARDIO_FIELD_DEF[f];
                    const raw = set[f];
                    const shown = f === 'durationSec' && raw !== null ? Math.round((raw / 60) * 10) / 10 : raw;
                    return (
                      <NumberStepper
                        key={f}
                        label={def.label}
                        unit={def.unit}
                        compact
                        step={def.step}
                        decimals={def.decimals}
                        integer={def.integer}
                        max={def.max}
                        value={shown}
                        onChange={(v) => run(() => updateSet(set.id, { [f]: v === null ? null : f === 'durationSec' ? Math.round(v * 60) : v }))}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="stack-sm">
                  {se.kind === 'strength' && (
                    <NumberStepper
                      label="Carico"
                      unit={unit}
                      step={unit === 'kg' ? settings.weightStepKg : 5}
                      max={unit === 'kg' ? 2000 : 4400}
                      value={set.weightKg === null ? null : kgToUnit(set.weightKg, unit)}
                      onChange={(v) => changeWeight(set, v === null ? null : unitToKg(v, unit))}
                    />
                  )}
                  <NumberStepper
                    label="Ripetizioni"
                    integer
                    step={1}
                    max={500}
                    value={set.reps}
                    startFrom={se.repsMax ?? se.repsMin ?? 10}
                    onChange={(v) => run(() => updateSet(set.id, { reps: v }))}
                  />
                </div>
              )}
              <details className="disclosure">
                <summary>RPE, RIR e note della serie</summary>
                <div className="stack-sm">
                  <div className="grid-2">
                    <NumberStepper label="RPE" compact step={0.5} min={1} max={10} decimals={1} value={set.rpe} startFrom={8}
                      onChange={(v) => run(() => updateSet(set.id, { rpe: v }))} />
                    <NumberStepper label="RIR" compact integer step={1} min={0} max={10} value={set.rir} startFrom={2}
                      onChange={(v) => run(() => updateSet(set.id, { rir: v }))} />
                  </div>
                  <input
                    className="input"
                    placeholder="Nota sulla serie"
                    defaultValue={set.notes}
                    onBlur={(e) => e.target.value !== set.notes && run(() => updateSet(set.id, { notes: e.target.value }))}
                  />
                </div>
              </details>
              {set.completed ? (
                <div className="grid-2">
                  <button type="button" className="btn" onClick={() => run(() => uncompleteSet(set.id))}>Segna non eseguita</button>
                  <button type="button" className="btn primary" onClick={() => setExpandedId(null)}>Fatto</button>
                </div>
              ) : (
                <button type="button" className="btn good xl block" onClick={() => complete(set)}>
                  <IconCheck size={28} /> {cardio ? 'COMPLETATO' : 'FINE SERIE'}
                </button>
              )}
            </div>
          ) : (
            <button key={set.id} type="button" className={`set-row${set.completed ? ' done' : ''}`} onClick={() => setExpandedId(set.id)}>
              <span className="set-n">{set.setNumber}</span>
              <span className="set-v">
                {set.completed
                  ? setValueText(set, se.kind, unit)
                  : <span className="muted">{cardio ? 'Da registrare' : `${se.kind === 'strength' && set.weightKg !== null ? `${kgToUnit(set.weightKg, unit)} ${unit} × ` : ''}${set.reps ?? '—'}`}</span>}
                {set.completed && set.restSec !== null && <span className="tiny muted" style={{ display: 'block' }}>recupero {restText(set.restSec)}</span>}
              </span>
              {set.completed ? <IconCheck style={{ color: 'var(--good)' }} /> : <span className="tiny muted">tocca</span>}
            </button>
          ),
        )}
        <div className="grid-2">
          <button type="button" className="btn" onClick={() => run(() => addSet(se.id))}><IconPlus size={20} /> Serie</button>
          <button type="button" className="btn" disabled={!lastSetToRemove} onClick={() => lastSetToRemove && run(() => removeSet(lastSetToRemove.id))}>
            <IconMinus size={20} /> Serie
          </button>
        </div>
      </section>

      <section className="card stack-sm">
        <div className="grid-2">
          {se.status === 'skipped' ? (
            <button type="button" className="btn" onClick={() => run(() => setExerciseStatus(se.id, 'auto'))}>Annulla «saltato»</button>
          ) : (
            <button type="button" className="btn" onClick={() => run(() => setExerciseStatus(se.id, 'skipped'))}>Salta esercizio</button>
          )}
          {se.statusManual && se.status !== 'skipped' ? (
            <button type="button" className="btn" onClick={() => run(() => setExerciseStatus(se.id, 'auto'))}>Stato automatico</button>
          ) : (
            <button type="button" className="btn" onClick={() => run(() => setExerciseStatus(se.id, 'partial'))} disabled={se.status === 'partial'}>
              Segna parziale
            </button>
          )}
        </div>
        <details className="disclosure">
          <summary><IconInfo size={18} /> Descrizione e note</summary>
          <div className="stack-sm">
            {exercise?.description && <p className="small">{exercise.description}</p>}
            {exercise?.notes && <p className="small muted">{exercise.notes}</p>}
            <label className="field">
              <span>Nota per questo allenamento</span>
              <textarea
                className="input"
                placeholder="Es. macchinario occupato, usata alternativa"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== se.notes && run(() => updateSessionExercise(se.id, { notes }))}
              />
            </label>
          </div>
        </details>
      </section>

      <Modal open={historyOpen} title={`Storico · ${se.name}`} onClose={() => setHistoryOpen(false)}>
        <div className="list">
          {recent?.map((r) => (
            <div key={r.session.id} className="list-item">
              <span className="grow">
                <span className="strong num">{formatPerformance(r.sets, se.kind, unit)}</span>
                <span className="small muted" style={{ display: 'block' }}>{formatDateLong(r.session.date, true)} · {r.session.templateCode}</span>
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </article>
  );
}
