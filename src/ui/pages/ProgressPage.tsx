import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadHistoryData } from '../../data/repo/stats';
import { listPrograms } from '../../data/repo/programs';
import {
  filterHistory, muscleGroupStats, programStats, recentProgress, recentRecords, weeklySummary, type ProgressItem,
} from '../../domain/dashboard';
import { METRIC_INFO } from '../../domain/analysis';
import { RECORD_LABEL } from '../../domain/records';
import { addDays, formatDateLong, formatDateShort } from '../../domain/dates';
import { formatDuration, formatNumber, formatPct } from '../../domain/format';
import { formatVolume, formatWeight, kgToUnit } from '../../domain/units';
import { useSettings, useToday } from '../hooks';
import { EmptyState, PageHeader, Segmented, TrendBadge } from '../components/common';
import { WeeklyBars, useChartColors } from '../components/charts';
import { IconChart, IconTrendDown, IconTrendFlat, IconTrendUp, IconTrophy } from '../icons';

const PERIODS = [
  { value: '28', label: '4 sett.' },
  { value: '90', label: '3 mesi' },
  { value: '180', label: '6 mesi' },
  { value: '365', label: '1 anno' },
] as const;

export default function ProgressPage() {
  const settings = useSettings();
  const today = useToday();
  const unit = settings.weightUnit;
  const data = useLiveQuery(loadHistoryData, []);
  const programs = useLiveQuery(listPrograms, []) ?? [];
  const colors = useChartColors();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['value']>('90');
  const [programId, setProgramId] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const days = Number(period);
  const from = addDays(today, -days);

  const view = useMemo(() => {
    if (!data) return null;
    const scoped = filterHistory(data, { programId: programId || null, muscleGroup: muscleGroup || null });
    const inPeriod = filterHistory(scoped, { from, to: today });
    const weeks = weeklySummary(inPeriod, today, Math.min(26, Math.ceil(days / 7)));
    return {
      progress: recentProgress(scoped, settings.oneRmFormula, today, days),
      records: recentRecords(scoped, settings.oneRmFormula, from).slice(0, 8),
      weeks: weeks.map((w) => ({
        label: formatDateShort(w.weekStart),
        volume: w.volumeKg === null ? 0 : kgToUnit(w.volumeKg, unit),
        sessions: w.sessions,
      })),
      programs: programStats(filterHistory(data, { muscleGroup: muscleGroup || null }), from, today),
      groups: muscleGroupStats(filterHistory(data, { programId: programId || null }), settings.oneRmFormula, from, today),
      sessions: [...inPeriod.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt).slice(0, 5),
      count: inPeriod.sessions.length,
    };
  }, [data, programId, muscleGroup, from, today, days, settings.oneRmFormula, unit]);

  const muscleGroups = useMemo(() => [...new Set(data?.sessionExercises.map((se) => se.muscleGroup) ?? [])].sort(), [data]);

  return (
    <main className="page stack-lg">
      <PageHeader title="Progressi" />
      <Link to="/progress/analysis" className="btn primary lg block"><IconChart /> Analisi progressione</Link>

      <section className="stack-sm">
        <Segmented label="Periodo" options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} value={period} onChange={setPeriod} />
        <div className="grid-2">
          <select className="input" aria-label="Filtra per programma" value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">Tutti i programmi</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input" aria-label="Filtra per gruppo muscolare" value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
            <option value="">Tutti i gruppi</option>
            {muscleGroups.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
      </section>

      {!view ? (
        <p className="muted">Caricamento…</p>
      ) : !data?.sessions.length ? (
        <EmptyState icon={<IconChart size={40} />} title="Ancora nessun allenamento concluso.">
          <p className="small">Dopo le prime sessioni qui troverai progressioni, record e volume.</p>
        </EmptyState>
      ) : (
        <>
          <section className="stack-sm" aria-labelledby="p-recent">
            <h2 id="p-recent" className="section-title">Progressione recente</h2>
            <div className="grid-3">
              <div className="stat"><span className="label">Migliorati</span><span className="value row" style={{ color: 'var(--good)' }}><IconTrendUp size={20} /> {view.progress.improved.length}</span></div>
              <div className="stat"><span className="label">Stabili</span><span className="value row" style={{ color: 'var(--neutral)' }}><IconTrendFlat size={20} /> {view.progress.stable.length}</span></div>
              <div className="stat"><span className="label">Peggiorati</span><span className="value row" style={{ color: 'var(--bad)' }}><IconTrendDown size={20} /> {view.progress.worsened.length}</span></div>
            </div>
            <ProgressList title="Migliorati" items={view.progress.improved} />
            <ProgressList title="Peggiorati" items={view.progress.worsened} />
            <ProgressList title="Stabili" items={view.progress.stable} />
            {view.progress.insufficient.length > 0 && (
              <p className="tiny muted">{view.progress.insufficient.length} esercizi con meno di 3 sessioni nel periodo: dati insufficienti per un trend.</p>
            )}
          </section>

          <section className="stack-sm" aria-labelledby="p-records">
            <h2 id="p-records" className="section-title">Record recenti</h2>
            {view.records.length ? (
              <div className="list">
                {view.records.map((r) => (
                  <Link key={`${r.sessionId}-${r.exerciseId}-${r.type}-${r.weightKg}`} to={`/progress/analysis?exercise=${r.exerciseId}`} className="list-item">
                    <IconTrophy style={{ color: 'var(--record)' }} />
                    <span className="grow">
                      <span className="strong">{r.exerciseName}</span>
                      <span className="small muted" style={{ display: 'block' }}>
                        {RECORD_LABEL[r.type]} ·{' '}
                        {r.type === 'max_reps_at_weight'
                          ? `${r.value} rip.${r.weightKg !== null ? ` a ${formatWeight(r.weightKg, unit)}` : ''}`
                          : r.type === 'max_volume' ? formatVolume(r.value, unit) : formatWeight(r.value, unit)}
                        {' · '}{formatDateLong(r.date)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="card muted small">Nessun nuovo record nel periodo.</p>
            )}
          </section>

          <section className="card stack-sm" aria-labelledby="p-volume">
            <h2 id="p-volume">Volume settimanale</h2>
            <WeeklyBars data={view.weeks} dataKey="volume" format={(v) => `${formatNumber(v, 0)} ${unit}`} ariaLabel="Volume per settimana" />
            <h2>Frequenza</h2>
            <WeeklyBars data={view.weeks} dataKey="sessions" color={colors.good} format={(v) => `${v} allenamenti`} ariaLabel="Allenamenti per settimana" />
            <p className="tiny muted">{view.count} allenamenti nel periodo · {formatNumber(view.count / Math.max(1, days / 7), 1)} a settimana</p>
          </section>

          <section className="card stack-sm" aria-labelledby="p-programs">
            <h2 id="p-programs">Per programma</h2>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Programma</th><th>Sessioni</th><th>/sett.</th><th>Volume</th><th>Durata media</th></tr></thead>
                <tbody>
                  {view.programs.map((p) => (
                    <tr key={p.programId ?? p.name}>
                      <td className="wrap">{p.name}</td>
                      <td>{p.sessions}</td>
                      <td>{formatNumber(p.perWeek, 1)}</td>
                      <td>{formatVolume(p.totalVolumeKg, unit)}</td>
                      <td>{formatDuration(p.avgDurationSec)}</td>
                    </tr>
                  ))}
                  {!view.programs.length && <tr><td colSpan={5} className="muted">Nessun dato nel periodo.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card stack-sm" aria-labelledby="p-groups">
            <h2 id="p-groups">Per gruppo muscolare</h2>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Gruppo</th><th>Serie</th><th>Volume</th><th>Sessioni /sett.</th><th>Progressione</th></tr></thead>
                <tbody>
                  {view.groups.map((g) => (
                    <tr key={g.group}>
                      <td className="wrap">{g.group}</td>
                      <td>{g.sets}</td>
                      <td>{formatVolume(g.volumeKg, unit)}</td>
                      <td>{formatNumber(g.perWeek, 1)}</td>
                      <td>
                        {g.avgChangePct === null ? <span className="muted">—</span> : (
                          <span className={`trend ${g.avgChangePct > 2.5 ? 'positive' : g.avgChangePct < -2.5 ? 'negative' : 'stable'}`}>
                            {g.avgChangePct > 2.5 ? '▲' : g.avgChangePct < -2.5 ? '▼' : '='} {formatPct(g.avgChangePct)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!view.groups.length && <tr><td colSpan={5} className="muted">Nessun dato nel periodo.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="tiny muted">Progressione: variazione media tra prima e ultima sessione degli esercizi del gruppo (metrica principale).</p>
          </section>

          <section className="stack-sm" aria-labelledby="p-last">
            <h2 id="p-last" className="section-title">Ultimi allenamenti</h2>
            <div className="list">
              {view.sessions.map((s) => (
                <Link key={s.id} to={`/history/${s.id}`} className="list-item">
                  <span className="code-badge muted">{s.templateCode}</span>
                  <span className="grow">
                    <span className="strong" style={{ textTransform: 'capitalize' }}>{formatDateLong(s.date)}</span>
                    <span className="small muted" style={{ display: 'block' }}>{s.templateName} · {formatDuration(s.activeDurationSec)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function ProgressList({ title, items }: { title: string; items: ProgressItem[] }) {
  if (!items.length) return null;
  return (
    <details className="card disclosure">
      <summary>{title} ({items.length})</summary>
      <div className="list">
        {items.map((p) => (
          <Link key={p.exercise.id} to={`/progress/analysis?exercise=${p.exercise.id}`} className="list-item">
            <span className="grow">
              <span className="strong">{p.exercise.name}</span>
              <span className="tiny muted" style={{ display: 'block' }}>{METRIC_INFO[p.metric].short} · {p.sessions} sessioni</span>
            </span>
            <TrendBadge trend={p.trend} compact />
          </Link>
        ))}
      </div>
    </details>
  );
}
