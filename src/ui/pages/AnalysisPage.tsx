import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadHistoryData } from '../../data/repo/stats';
import { listExercises } from '../../data/repo/exercises';
import {
  buildChartSeries, comparePeriods, filterByPeriod, METRIC_INFO, metricsForKind, summarizePeriod, type Metric,
} from '../../domain/analysis';
import { allRecordEvents, exerciseMetricsList, exercisesWithHistory } from '../../domain/dashboard';
import { RECORD_LABEL } from '../../domain/records';
import { searchExercises } from '../../domain/search';
import { addMonths, formatDateIt, formatDateLong, isValidISODate } from '../../domain/dates';
import { formatPct } from '../../domain/format';
import { formatVolume, formatWeight } from '../../domain/units';
import { ONE_RM_FORMULA_LABEL } from '../../domain/oneRm';
import type { Exercise } from '../../domain/types';
import { useSettings, useToday } from '../hooks';
import { EmptyState, PageHeader, TrendBadge } from '../components/common';
import { ProgressChart } from '../components/charts';
import { chartUnitLabel, formatValue, toChartValue } from '../metricFormat';
import { IconSearch, IconTrophy } from '../icons';

interface Criteria {
  exerciseId: string;
  from: string;
  to: string;
}

export default function AnalysisPage() {
  const settings = useSettings();
  const unit = settings.weightUnit;
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const data = useLiveQuery(loadHistoryData, []);
  const allExercises = useLiveQuery(() => listExercises({ includeInactive: true }), []) ?? [];

  const [exerciseId, setExerciseId] = useState(params.get('exercise') ?? '');
  const [from, setFrom] = useState(params.get('from') ?? addMonths(today, -6));
  const [to, setTo] = useState(params.get('to') ?? today);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState<Criteria | null>(() =>
    params.get('exercise') ? { exerciseId: params.get('exercise')!, from: params.get('from') ?? addMonths(today, -6), to: params.get('to') ?? today } : null,
  );
  const [metric, setMetric] = useState<Metric | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withHistory = useMemo(() => (data ? new Set(exercisesWithHistory(data).map((e) => e.id)) : new Set<string>()), [data]);
  const options = useMemo(() => {
    const matches = searchExercises(allExercises, query);
    return [...matches.filter((e) => withHistory.has(e.id)), ...matches.filter((e) => !withHistory.has(e.id))];
  }, [allExercises, query, withHistory]);
  const exercise: Exercise | undefined = allExercises.find((e) => e.id === applied?.exerciseId);

  const analyze = () => {
    if (!exerciseId) return setError('Seleziona un esercizio.');
    if (!isValidISODate(from) || !isValidISODate(to)) return setError('Inserisci date valide.');
    if (from > to) return setError('La data iniziale deve precedere la data finale.');
    setError(null);
    setApplied({ exerciseId, from, to });
    setParams({ exercise: exerciseId, from, to }, { replace: true });
  };

  useEffect(() => {
    setMetric(null);
  }, [applied?.exerciseId]);

  const kind = exercise?.kind ?? 'strength';
  const metrics = metricsForKind(kind);
  const activeMetric: Metric = metric && metrics.includes(metric) ? metric : metrics[0];
  const info = METRIC_INFO[activeMetric];

  const result = useMemo(() => {
    if (!data || !applied) return null;
    const all = exerciseMetricsList(data, applied.exerciseId, settings.oneRmFormula);
    const list = filterByPeriod(all, applied.from, applied.to);
    const series = buildChartSeries(list, activeMetric);
    const points = series.points.map((p) => ({
      ...p,
      value: toChartValue(info.valueKind, p.value, unit),
      trend: toChartValue(info.valueKind, p.trend, unit),
    }));
    return {
      all,
      list,
      series: { ...series, points },
      summary: summarizePeriod(list, kind, activeMetric),
      records: allRecordEvents(data, settings.oneRmFormula).filter(
        (r) => r.exerciseId === applied.exerciseId && r.date >= applied.from && r.date <= applied.to,
      ),
    };
  }, [data, applied, activeMetric, info.valueKind, kind, settings.oneRmFormula, unit]);

  const chartUnit = chartUnitLabel(info.valueKind, unit);
  const fmtChart = (v: number) => `${v.toLocaleString('it-IT', { maximumFractionDigits: 1 })}${chartUnit ? ` ${chartUnit}` : ''}`;

  return (
    <main className="page stack-lg">
      <PageHeader title="Analisi progressione" back="/progress" />

      <section className="card stack" aria-label="Criteri">
        <div className="field">
          <span className="label">Esercizio</span>
          <label className="row input" style={{ padding: '0 10px' }}>
            <IconSearch size={20} />
            <input className="grow" style={{ border: 0, background: 'transparent', outline: 'none', minHeight: 44 }}
              placeholder="Cerca esercizio" aria-label="Cerca esercizio" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select className="input" aria-label="Esercizio" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} size={Math.min(6, Math.max(2, options.length))}>
            {options.map((e) => (
              <option key={e.id} value={e.id}>{e.name}{withHistory.has(e.id) ? '' : ' (nessun dato)'}</option>
            ))}
          </select>
        </div>
        <div className="grid-2">
          <label className="field"><span>Data iniziale</span><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>Data finale</span><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="chips">
          {[
            { label: '3 mesi', f: addMonths(today, -3) },
            { label: '6 mesi', f: addMonths(today, -6) },
            { label: '1 anno', f: addMonths(today, -12) },
            { label: `Anno ${today.slice(0, 4)}`, f: `${today.slice(0, 4)}-01-01`, t: `${today.slice(0, 4)}-12-31` },
          ].map((p) => (
            <button key={p.label} type="button" className="chip" onClick={() => { setFrom(p.f); setTo(p.t ?? today); }}>{p.label}</button>
          ))}
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button type="button" className="btn primary lg block" onClick={analyze}>ANALIZZA</button>
      </section>

      {applied && result && exercise && (
        result.list.length === 0 ? (
          <EmptyState title="Nessun dato disponibile per i criteri selezionati.">
            <p className="small">
              {exercise.name} · {formatDateIt(applied.from)} → {formatDateIt(applied.to)}
              {result.all.length > 0 ? ` · ${result.all.length} sessioni registrate in altri periodi.` : ''}
            </p>
          </EmptyState>
        ) : (
          <>
            <section className="stack-sm" aria-label="Grafico">
              <div className="chips" role="group" aria-label="Metrica">
                {metrics.map((m) => (
                  <button key={m} type="button" className="chip" aria-pressed={m === activeMetric} onClick={() => setMetric(m)}>{METRIC_INFO[m].short}</button>
                ))}
              </div>
              <div className="card stack-sm">
                <div className="spread">
                  <h2 className="grow">{info.label}</h2>
                  <TrendBadge trend={result.series.trend} />
                </div>
                {result.series.valueCount === 0 ? (
                  <p className="muted">Nessun valore di {info.short} registrato nel periodo.</p>
                ) : (
                  <ProgressChart
                    points={result.series.points}
                    trend={result.series.trend}
                    format={fmtChart}
                    ariaLabel={`${info.label} di ${exercise.name} dal ${formatDateIt(applied.from)} al ${formatDateIt(applied.to)}`}
                  />
                )}
                <p className="tiny muted">
                  Punti = sessioni reali. Linea tratteggiata = tendenza (regressione lineare, da 3 sessioni).
                  La linea si interrompe se tra due sessioni passano più di 3 settimane o se il dato non è registrato.
                  {activeMetric === 'e1rm' && ` 1RM STIMATO con formula ${ONE_RM_FORMULA_LABEL[settings.oneRmFormula]}: non è un massimale eseguito.`}
                </p>
              </div>
            </section>

            <PeriodSummaryCard exercise={exercise} criteria={applied} summary={result.summary} unit={unit} />

            {result.records.length > 0 && (
              <section className="card stack-sm" aria-label="Record nel periodo">
                <h2>Record nel periodo ({result.records.length})</h2>
                {result.records.slice(0, 5).map((r) => (
                  <Link key={`${r.sessionId}-${r.type}-${r.weightKg}`} to={`/history/${r.sessionId}`} className="row card-link">
                    <IconTrophy style={{ color: 'var(--record)' }} />
                    <span className="grow small">
                      <span className="strong">🏆 {RECORD_LABEL[r.type]}</span>{' '}
                      {r.type === 'max_reps_at_weight' ? `${r.value} rip.${r.weightKg !== null ? ` a ${formatWeight(r.weightKg, unit)}` : ''}` : r.type === 'max_volume' ? formatVolume(r.value, unit) : formatWeight(r.value, unit)}
                      <span className="muted"> · {formatDateLong(r.date, true)}</span>
                    </span>
                  </Link>
                ))}
                {result.records.length > 5 && (
                  <details className="disclosure">
                    <summary>Mostra tutti i record ({result.records.length - 5} precedenti)</summary>
                    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                      {result.records.slice(5).map((r) => (
                        <li key={`${r.sessionId}-${r.type}-${r.weightKg}`}>
                          <Link to={`/history/${r.sessionId}`}>{RECORD_LABEL[r.type]}</Link>{' '}
                          {r.type === 'max_reps_at_weight' ? `${r.value} rip.` : r.type === 'max_volume' ? formatVolume(r.value, unit) : formatWeight(r.value, unit)}
                          <span className="muted"> · {formatDateLong(r.date, true)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="tiny muted">Un record anomalo? Aprilo e correggi o escludi la serie.</p>
              </section>
            )}

            <section className="card stack-sm" aria-label="Sessioni">
              <h2>Sessioni ({result.list.length})</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Data</th>
                      {metrics.filter((m) => m !== 'rpe' && m !== 'rir').map((m) => <th key={m}>{METRIC_INFO[m].short}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.list].reverse().map((m) => (
                      <tr key={m.sessionId}>
                        <td><Link to={`/history/${m.sessionId}`}>{formatDateIt(m.date)}</Link></td>
                        {metrics.filter((x) => x !== 'rpe' && x !== 'rir').map((x) => (
                          <td key={x}>{formatValue(METRIC_INFO[x].valueKind, pick(m, x), unit)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      )}

      {applied && exercise && result && <ComparePeriods all={result.all} kind={kind} unit={unit} today={today} />}
    </main>
  );
}

function pick(m: Parameters<typeof import('../../domain/analysis').metricValue>[0], metric: Metric) {
  switch (metric) {
    case 'weight': return m.topWeightKg;
    case 'reps': return m.totalReps;
    case 'volume': return m.volumeKg;
    case 'e1rm': return m.e1rmKg;
    case 'rpe': return m.avgRpe;
    case 'rir': return m.avgRir;
    case 'duration': return m.durationSec;
    case 'distance': return m.distanceKm;
    case 'speed': return m.avgSpeedKmh;
    case 'calories': return m.calories;
  }
}

function PeriodSummaryCard({ exercise, criteria, summary, unit }: {
  exercise: Exercise;
  criteria: Criteria;
  summary: ReturnType<typeof summarizePeriod>;
  unit: 'kg' | 'lb';
}) {
  const rows = metricsForKind(exercise.kind).filter((m) => m !== 'rpe' && m !== 'rir');
  return (
    <section className="card stack" aria-label="Sintesi del periodo">
      <div>
        <h2 className="upper">{exercise.name}</h2>
        <p className="small muted">Periodo {formatDateIt(criteria.from)} → {formatDateIt(criteria.to)}</p>
      </div>
      <div className="grid-2">
        <div className="stat"><span className="label">Allenamenti</span><span className="value">{summary.sessions}</span></div>
        <div className="stat">
          <span className="label">Trend ({METRIC_INFO[summary.metric].short})</span>
          <span className="value" style={{ fontSize: '1rem' }}><TrendBadge trend={summary.trend} /></span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Metrica</th><th>Iniziale</th><th>Finale</th><th>Variazione</th></tr></thead>
          <tbody>
            {rows.map((m) => {
              const c = summary.changes[m];
              const kind = METRIC_INFO[m].valueKind;
              const pct = c?.changePct ?? null;
              return (
                <tr key={m}>
                  <td className="wrap">{m === 'e1rm' ? '1RM STIMATO' : METRIC_INFO[m].short}</td>
                  <td>{formatValue(kind, c?.start ?? null, unit)}</td>
                  <td>{formatValue(kind, c?.end ?? null, unit)}</td>
                  <td>
                    {pct === null ? <span className="muted">—</span> : (
                      <span className={`trend ${pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'stable'}`}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {formatPct(pct)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {summary.sessions < 2 && <p className="small muted">Serve almeno una seconda sessione per calcolare una variazione.</p>}
      {summary.totalVolumeKg !== null && <p className="small">Volume totale del periodo: <strong>{formatVolume(summary.totalVolumeKg, unit)}</strong></p>}
    </section>
  );
}

function ComparePeriods({ all, kind, unit, today }: {
  all: ReturnType<typeof exerciseMetricsList>;
  kind: Exercise['kind'];
  unit: 'kg' | 'lb';
  today: string;
}) {
  const [a, setA] = useState({ from: addMonths(today, -6), to: addMonths(today, -3) });
  const [b, setB] = useState({ from: addMonths(today, -3), to: today });
  const [rows, setRows] = useState<ReturnType<typeof comparePeriods> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = () => {
    if (a.from > a.to || b.from > b.to) return setErr('In ogni periodo la data iniziale deve precedere la finale.');
    setErr(null);
    setRows(comparePeriods(filterByPeriod(all, a.from, a.to), filterByPeriod(all, b.from, b.to), kind));
  };

  return (
    <details className="card disclosure">
      <summary>Confronta periodi</summary>
      <div className="stack">
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Periodo A</legend>
          <div className="grid-2">
            <input className="input" type="date" aria-label="Periodo A dal" value={a.from} onChange={(e) => setA({ ...a, from: e.target.value })} />
            <input className="input" type="date" aria-label="Periodo A al" value={a.to} onChange={(e) => setA({ ...a, to: e.target.value })} />
          </div>
        </fieldset>
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Periodo B</legend>
          <div className="grid-2">
            <input className="input" type="date" aria-label="Periodo B dal" value={b.from} onChange={(e) => setB({ ...b, from: e.target.value })} />
            <input className="input" type="date" aria-label="Periodo B al" value={b.to} onChange={(e) => setB({ ...b, to: e.target.value })} />
          </div>
        </fieldset>
        {err && <p className="error-text" role="alert">{err}</p>}
        <button type="button" className="btn primary block" onClick={run}>Confronta</button>
        {rows && (rows[0].a === 0 && rows[0].b === 0 ? (
          <p className="muted">Nessun dato disponibile per i criteri selezionati.</p>
        ) : (
          <div className="stack">
            <p className="tiny muted">A: {formatDateIt(a.from)} → {formatDateIt(a.to)} · B: {formatDateIt(b.from)} → {formatDateIt(b.to)}</p>
            {rows.map((r) => {
              const max = Math.max(r.a ?? 0, r.b ?? 0) || 1;
              return (
                <div key={r.key} className="stack-sm">
                  <div className="spread small">
                    <span className="strong">{r.label}</span>
                    {r.deltaPct === null ? <span className="muted">—</span> : (
                      <span className={`trend ${r.deltaPct > 0 ? 'positive' : r.deltaPct < 0 ? 'negative' : 'stable'}`}>
                        {r.deltaPct > 0 ? '▲' : r.deltaPct < 0 ? '▼' : '='} {formatPct(r.deltaPct)}
                      </span>
                    )}
                  </div>
                  {(['a', 'b'] as const).map((k) => (
                    <div key={k} className="cmp-bar">
                      <span className="strong">{k.toUpperCase()}</span>
                      <div className="track"><div className={`fill ${k}`} style={{ width: `${((r[k] ?? 0) / max) * 100}%` }} /></div>
                      <span className="num">{formatValue(r.valueKind, r[k], unit)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </details>
  );
}
