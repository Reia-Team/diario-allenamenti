import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { listPrograms } from '../../data/repo/programs';
import { clearOverride, getPlanInput, setOverride } from '../../data/repo/schedule';
import { buildPlan, type PlanEntry } from '../../domain/schedule';
import {
  addDays, addMonths, formatDateLong, MONTH_LONG, startOfMonth, startOfWeek, weekday,
} from '../../domain/dates';
import { useSettings, useToday } from '../hooks';
import { useAction } from '../toast';
import { useStartWorkout } from '../useStartWorkout';
import { EmptyState, Modal, PageHeader } from '../components/common';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { IconChevronLeft, IconChevronRight, IconPlay, IconSettings } from '../icons';

const STATUS_TEXT: Record<PlanEntry['status'], string> = {
  done: 'Eseguito',
  in_progress: 'In corso',
  missed: 'Saltato',
  planned: 'Previsto',
  rest: 'Riposo',
};

export function CalendarPage() {
  const settings = useSettings();
  const today = useToday();
  const navigate = useNavigate();
  const run = useAction();
  const startWorkout = useStartWorkout();
  const programs = useLiveQuery(listPrograms, []) ?? [];
  const activePrograms = programs.filter((p) => p.status === 'active');
  const [programChoice, setProgramChoice] = useState<string | null>(null);
  const programId = programChoice ?? settings.activeProgramId ?? activePrograms[0]?.id ?? null;
  const program = programs.find((p) => p.id === programId);
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selected, setSelected] = useState<string | null>(null);
  const planInput = useLiveQuery(() => (programId ? getPlanInput(programId, today) : null), [programId, today]);

  const gridStart = startOfWeek(month);
  const monthEnd = addDays(addMonths(month, 1), -1);
  const gridEnd = addDays(startOfWeek(monthEnd), 6);

  const { byDate, upcoming } = useMemo(() => {
    if (!planInput) return { byDate: new Map<string, PlanEntry>(), upcoming: [] as PlanEntry[] };
    const entries = buildPlan(planInput, gridStart < today ? gridStart : today, gridEnd > addDays(today, 28) ? gridEnd : addDays(today, 28));
    return {
      byDate: new Map(entries.map((e) => [e.date, e])),
      upcoming: entries.filter((e) => e.date >= today && (e.status === 'planned' || e.status === 'in_progress')).slice(0, 6),
    };
  }, [planInput, gridStart, gridEnd, today]);

  const templates = planInput?.templates ?? [];
  const codeOf = (id: string | null) => templates.find((t) => t.id === id)?.code ?? (id ? '•' : '');
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const selectedEntry = selected ? byDate.get(selected) : undefined;
  const selectedOverride = selected ? planInput?.overrides.find((o) => o.date === selected) : undefined;

  if (!programs.length) {
    return (
      <main className="page">
        <PageHeader title="Calendario" />
        <EmptyState title="Nessun programma">
          <Link className="btn primary" to="/programs">Crea un programma</Link>
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="page stack">
      <PageHeader title="Calendario" actions={<Link to="/settings" className="icon-btn" aria-label="Impostazioni"><IconSettings /></Link>} />
      {activePrograms.length > 1 && (
        <select className="input" aria-label="Programma" value={programId ?? ''} onChange={(e) => setProgramChoice(e.target.value)}>
          {activePrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}

      <div className="card stack">
        <div className="spread">
          <button type="button" className="icon-btn" aria-label="Mese precedente" onClick={() => setMonth(addMonths(month, -1))}><IconChevronLeft /></button>
          <h2 className="center" style={{ textTransform: 'capitalize' }}>{MONTH_LONG[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}</h2>
          <button type="button" className="icon-btn" aria-label="Mese successivo" onClick={() => setMonth(addMonths(month, 1))}><IconChevronRight /></button>
        </div>
        <div className="cal-grid" role="grid" aria-label="Calendario allenamenti">
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => <div key={i} className="cal-head" aria-hidden="true">{d}</div>)}
          {days.map((d) => {
            const e = byDate.get(d);
            const label = `${formatDateLong(d)}${e ? ` — ${STATUS_TEXT[e.status]} ${codeOf(e.templateId)}` : ''}`;
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                aria-label={label}
                className={`cal-day${d.slice(0, 7) !== month.slice(0, 7) ? ' other' : ''}${d === today ? ' today' : ''}`}
                onClick={() => setSelected(d)}
              >
                <span className="d">{Number(d.slice(8))}</span>
                {e && <span className={`mark ${e.status}`}>{e.status === 'rest' ? '–' : codeOf(e.templateId)}</span>}
              </button>
            );
          })}
        </div>
        <div className="legend" aria-label="Legenda">
          <span><span className="mark done">A</span> eseguito</span>
          <span><span className="mark planned">A</span> previsto</span>
          <span><span className="mark missed">A</span> saltato</span>
          <span><span className="mark rest">–</span> riposo</span>
        </div>
        <button type="button" className="btn sm ghost" onClick={() => { setMonth(startOfMonth(today)); setSelected(today); }}>Oggi</button>
      </div>

      {upcoming.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Prossimi allenamenti</h2>
          <div className="list">
            {upcoming.map((e) => (
              <button key={e.date} type="button" className="list-item" onClick={() => setSelected(e.date)}>
                <span className="code-badge">{codeOf(e.templateId)}</span>
                <span className="grow">
                  <span className="strong" style={{ textTransform: 'capitalize' }}>{formatDateLong(e.date)}</span>
                  <span className="small muted" style={{ display: 'block' }}>
                    {templates.find((t) => t.id === e.templateId)?.name}{e.isOverride ? ' · modificato' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {program && (
        <details className="card disclosure">
          <summary>Giorni e sequenza · {program.name}</summary>
          <ScheduleEditor program={program} />
        </details>
      )}

      <Modal open={!!selected} title={selected ? formatDateLong(selected, true) : ''} onClose={() => setSelected(null)}>
        {selected && program && (
          <div className="stack">
            {selectedEntry ? (
              <div className="row">
                <span className={`mark ${selectedEntry.status}`} style={{ minWidth: 40, height: 40, fontSize: '1.1rem' }}>
                  {selectedEntry.status === 'rest' ? '–' : codeOf(selectedEntry.templateId)}
                </span>
                <div>
                  <p className="strong">{STATUS_TEXT[selectedEntry.status]}{selectedEntry.isOverride ? ' (modificato)' : ''}</p>
                  <p className="small muted">{templates.find((t) => t.id === selectedEntry.templateId)?.name ?? ''}</p>
                </div>
              </div>
            ) : (
              <p className="muted">Nessun allenamento previsto.</p>
            )}

            {selectedEntry?.sessionIds.map((id) => (
              <Link key={id} className="btn block" to={selectedEntry.status === 'in_progress' ? `/workout/${id}` : `/history/${id}`}>
                {selectedEntry.status === 'in_progress' ? 'Riprendi allenamento' : 'Apri allenamento eseguito'}
              </Link>
            ))}

            {selected <= today && selectedEntry?.status !== 'in_progress' && templates.length > 0 && (
              <button
                type="button"
                className="btn primary lg block"
                onClick={() => {
                  const tpl = selectedEntry?.templateId ?? templates[0].id;
                  void startWorkout(program.id, tpl, selected);
                }}
              >
                <IconPlay /> {selected === today ? 'Inizia' : 'Registra'} {codeOf(selectedEntry?.templateId ?? templates[0].id)}
                {selected !== today ? ' per questa data' : ''}
              </button>
            )}

            {selectedEntry?.status !== 'done' && selectedEntry?.status !== 'in_progress' && (
              <label className="field">
                <span>Scheda per questo giorno</span>
                <select
                  className="input"
                  value={selectedOverride ? selectedOverride.workoutTemplateId ?? 'rest' : 'auto'}
                  onChange={(e) => {
                    const v = e.target.value;
                    void run(async () => {
                      if (v === 'auto') await clearOverride(program.id, selected);
                      else await setOverride(program.id, selected, v === 'rest' ? null : v);
                    });
                  }}
                >
                  <option value="auto">Come da programma</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
                  <option value="rest">Riposo</option>
                </select>
                <small className="hint">Vale solo per il {formatDateLong(selected)}: il programma non viene modificato.</small>
              </label>
            )}
            {weekday(selected) !== undefined && selected > today && (
              <button type="button" className="btn ghost" onClick={() => navigate(`/programs/${program.id}`)}>Modifica programma</button>
            )}
          </div>
        )}
      </Modal>
    </main>
  );
}
