import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { getActiveSession } from '../../data/repo/sessions';
import { getProgram, listWorkoutExercises } from '../../data/repo/programs';
import { getPlanInput } from '../../data/repo/schedule';
import { loadHistoryData } from '../../data/repo/stats';
import { nextPlanned, nextTemplateInSequence } from '../../domain/schedule';
import { addDays, formatDateLong, relativeDayLabel } from '../../domain/dates';
import { formatDuration } from '../../domain/format';
import { formatVolume, formatWeight } from '../../domain/units';
import { activeDurationMs } from '../../domain/session';
import { recentProgress, recentRecords, sessionVolume } from '../../domain/dashboard';
import { RECORD_LABEL } from '../../domain/records';
import { useNow, useSettings, useToday } from '../hooks';
import { useStartWorkout } from '../useStartWorkout';
import { EmptyState, PageHeader, TrendBadge } from '../components/common';
import { TimerMini } from '../components/RestTimerPanel';
import {
  IconCalendar, IconChart, IconDumbbell, IconHistory, IconList, IconPlay, IconSettings, IconTrophy,
} from '../icons';
import { useNavigate } from 'react-router';

export function HomePage() {
  const settings = useSettings();
  const today = useToday();
  const navigate = useNavigate();
  const startWorkout = useStartWorkout();
  const active = useLiveQuery(() => getActiveSession().then((s) => s ?? null), []);
  const program = useLiveQuery(
    () => (settings.activeProgramId ? getProgram(settings.activeProgramId).then((p) => p ?? null) : null),
    [settings.activeProgramId],
  );
  const planInput = useLiveQuery(() => (program ? getPlanInput(program.id, today) : null), [program?.id, today]);
  const history = useLiveQuery(loadHistoryData, []);
  const [chosenTemplate, setChosenTemplate] = useState<string>('');
  const now = useNow(15_000, !!active);

  const next = planInput ? nextPlanned(planInput) : null;
  const sequenceTemplate = planInput ? nextTemplateInSequence(planInput.templates, planInput.sessions) : null;
  const plannedTemplateId = next?.status === 'planned' || next?.status === 'in_progress' ? next.templateId : sequenceTemplate?.id ?? null;
  const templateId = chosenTemplate || plannedTemplateId;
  const template = planInput?.templates.find((t) => t.id === templateId);
  const exerciseCount = useLiveQuery(() => (templateId ? listWorkoutExercises(templateId).then((l) => l.length) : 0), [templateId]);

  const last = history ? [...history.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)[0] : undefined;
  const insights = useMemo(() => {
    if (!history) return null;
    const since28 = addDays(today, -28);
    return {
      sessions28: history.sessions.filter((s) => s.date >= since28).length,
      records: recentRecords(history, settings.oneRmFormula, addDays(today, -30)).slice(0, 3),
      progress: recentProgress(history, settings.oneRmFormula, today),
    };
  }, [history, settings.oneRmFormula, today]);

  return (
    <main className="page stack-lg">
      <PageHeader
        title="Diario Allenamenti"
        actions={
          <Link to="/settings" className="icon-btn" aria-label="Impostazioni">
            <IconSettings />
          </Link>
        }
      />

      {active && (
        <section className="card accent stack" aria-label="Allenamento in corso">
          <div className="spread">
            <span className="badge warn">{active.status === 'paused' ? 'In pausa' : 'In corso'}</span>
            <TimerMini onClick={() => navigate(`/workout/${active.id}`)} />
          </div>
          <div className="row">
            <span className="code-badge lg">{active.templateCode}</span>
            <div className="grow">
              <h2>{active.templateName}</h2>
              <p className="muted small">{active.programName} · {formatDuration(activeDurationMs(active.startedAt, active.pauses, now) / 1000)}</p>
            </div>
          </div>
          <Link to={`/workout/${active.id}`} className="btn primary xl block">
            <IconPlay /> Riprendi allenamento
          </Link>
        </section>
      )}

      {!active && (
        <section className="card accent stack" aria-labelledby="next-title">
          <h2 id="next-title" className="section-title" style={{ margin: 0 }}>Prossimo allenamento</h2>
          {program === null || (program && planInput && !planInput.templates.length) ? (
            <EmptyState title={program ? 'Il programma non ha schede' : 'Nessun programma attivo'}>
              <Link className="btn primary" to={program ? `/programs/${program.id}` : '/programs'}>
                {program ? 'Aggiungi una scheda' : 'Scegli un programma'}
              </Link>
            </EmptyState>
          ) : program && planInput ? (
            <>
              <div className="row">
                <span className="code-badge lg">{template?.code ?? '?'}</span>
                <div className="grow">
                  <p className="strong big">{template?.name}</p>
                  <p className="muted small">
                    {next ? `${relativeDayLabel(next.date, today)} · ` : ''}{program.name}
                    {exerciseCount ? ` · ${exerciseCount} esercizi` : ''}
                  </p>
                </div>
              </div>
              {next && next.date !== today && !chosenTemplate && (
                <p className="small muted">Previsto per {formatDateLong(next.date)}. Puoi iniziarlo anche oggi.</p>
              )}
              <button
                type="button"
                className="btn primary xl block"
                disabled={!templateId}
                onClick={() => program && templateId && startWorkout(program.id, templateId)}
              >
                <IconPlay /> Inizia allenamento
              </button>
              {planInput.templates.length > 1 && (
                <label className="field">
                  <span>Oggi preferisci un’altra scheda?</span>
                  <select className="input" value={templateId ?? ''} onChange={(e) => setChosenTemplate(e.target.value === plannedTemplateId ? '' : e.target.value)}>
                    {planInput.templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} · {t.name}{t.id === plannedTemplateId ? ' (prevista)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <p className="muted">Caricamento…</p>
          )}
        </section>
      )}

      <section className="stack" aria-labelledby="last-title">
        <h2 id="last-title" className="section-title">Ultimo allenamento</h2>
        {last && history ? (
          <Link to={`/history/${last.id}`} className="card card-link row">
            <span className="code-badge muted">{last.templateCode}</span>
            <div className="grow">
              <p className="strong">{last.templateName}</p>
              <p className="small muted">
                {relativeDayLabel(last.date, today)} · {formatDuration(last.activeDurationSec)}
                {sessionVolume(history, last.id) !== null && ` · volume ${formatVolume(sessionVolume(history, last.id), settings.weightUnit)}`}
              </p>
            </div>
          </Link>
        ) : (
          <p className="card muted">Nessun allenamento registrato finora.</p>
        )}
      </section>

      {insights && history && history.sessions.length > 0 && (
        <section className="stack" aria-labelledby="progress-title">
          <div className="spread">
            <h2 id="progress-title" className="section-title">Progresso</h2>
            <Link to="/progress" className="small">Dettagli</Link>
          </div>
          <div className="grid-3">
            <div className="stat"><span className="label">Ultime 4 sett.</span><span className="value">{insights.sessions28}</span><span className="tiny muted">allenamenti</span></div>
            <div className="stat"><span className="label">Migliorati</span><span className="value" style={{ color: 'var(--good)' }}>▲ {insights.progress.improved.length}</span></div>
            <div className="stat"><span className="label">Peggiorati</span><span className="value" style={{ color: 'var(--bad)' }}>▼ {insights.progress.worsened.length}</span></div>
          </div>
          {insights.records.length > 0 && (
            <div className="list">
              {insights.records.map((r) => (
                <Link key={`${r.sessionId}-${r.exerciseId}-${r.type}-${r.weightKg}`} className="list-item" to={`/progress/analysis?exercise=${r.exerciseId}`}>
                  <IconTrophy style={{ color: 'var(--record)' }} />
                  <span className="grow">
                    <span className="strong">{r.exerciseName}</span>
                    <span className="small muted" style={{ display: 'block' }}>
                      {RECORD_LABEL[r.type]}: {r.type === 'max_reps_at_weight' ? `${r.value} rip.${r.weightKg !== null ? ` a ${formatWeight(r.weightKg, settings.weightUnit)}` : ''}` : r.type === 'max_volume' ? formatVolume(r.value, settings.weightUnit) : formatWeight(r.value, settings.weightUnit)} · {formatDateLong(r.date)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
          {insights.progress.improved.slice(0, 3).map((p) => (
            <Link key={p.exercise.id} className="card tight card-link spread" to={`/progress/analysis?exercise=${p.exercise.id}`}>
              <span className="strong ellipsis">{p.exercise.name}</span>
              <TrendBadge trend={p.trend} compact />
            </Link>
          ))}
        </section>
      )}

      <section aria-labelledby="quick-title" className="stack">
        <h2 id="quick-title" className="section-title">Accesso rapido</h2>
        <nav className="quick-grid">
          <Link to="/calendar"><IconCalendar />Calendario</Link>
          <Link to={active ? `/workout/${active.id}` : '/calendar'}><IconDumbbell />Allenamento</Link>
          <Link to="/progress"><IconChart />Progressioni</Link>
          <Link to="/programs"><IconList />Programmi</Link>
          <Link to="/history"><IconHistory />Storico</Link>
          <Link to="/settings"><IconSettings />Impostazioni</Link>
        </nav>
      </section>
    </main>
  );
}
