import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadHistoryData } from '../../data/repo/stats';
import { getActiveSession } from '../../data/repo/sessions';
import { listPrograms, listTemplates } from '../../data/repo/programs';
import { exercisesWithHistory, filterHistory, type HistoryFilter } from '../../domain/dashboard';
import { formatDateLong, MONTH_LONG } from '../../domain/dates';
import { formatDuration } from '../../domain/format';
import { EmptyState, PageHeader } from '../components/common';
import { IconHistory } from '../icons';

export function HistoryPage() {
  const data = useLiveQuery(loadHistoryData, []);
  const active = useLiveQuery(() => getActiveSession().then((s) => s ?? null), []);
  const programs = useLiveQuery(listPrograms, []) ?? [];
  const [filter, setFilter] = useState<HistoryFilter>({});
  const templates = useLiveQuery(() => (filter.programId ? listTemplates(filter.programId) : []), [filter.programId]) ?? [];

  const filtered = useMemo(() => (data ? filterHistory(data, filter) : null), [data, filter]);
  const groups = useMemo(() => {
    if (!filtered || !data) return [];
    const sorted = [...filtered.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
    const map = new Map<string, typeof sorted>();
    for (const s of sorted) {
      const key = s.date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map].map(([key, sessions]) => ({
      key,
      label: `${MONTH_LONG[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`,
      sessions: sessions.map((s) => {
        const ses = data.sessionExercises.filter((se) => se.sessionId === s.id);
        return { session: s, total: ses.length, done: ses.filter((se) => se.status === 'completed').length };
      }),
    }));
  }, [filtered, data]);

  const muscleGroups = useMemo(() => [...new Set(data?.sessionExercises.map((se) => se.muscleGroup) ?? [])].sort(), [data]);
  const exercises = useMemo(() => (data ? exercisesWithHistory(data) : []), [data]);
  const activeFilters = Object.values(filter).filter(Boolean).length;
  const set = (patch: HistoryFilter) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <main className="page stack">
      <PageHeader title="Storico allenamenti" />

      <details className="card disclosure" open={activeFilters > 0}>
        <summary>Filtri{activeFilters ? ` (${activeFilters})` : ''}</summary>
        <div className="stack">
          <div className="grid-2">
            <label className="field">
              <span>Programma</span>
              <select className="input" value={filter.programId ?? ''} onChange={(e) => set({ programId: e.target.value || null, templateId: null })}>
                <option value="">Tutti</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Scheda</span>
              <select className="input" value={filter.templateId ?? ''} disabled={!filter.programId} onChange={(e) => set({ templateId: e.target.value || null })}>
                <option value="">Tutte</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Esercizio</span>
              <select className="input" value={filter.exerciseId ?? ''} onChange={(e) => set({ exerciseId: e.target.value || null })}>
                <option value="">Tutti</option>
                {exercises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Gruppo muscolare</span>
              <select className="input" value={filter.muscleGroup ?? ''} onChange={(e) => set({ muscleGroup: e.target.value || null })}>
                <option value="">Tutti</option>
                {muscleGroups.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
          </div>
          <div className="grid-2">
            <label className="field"><span>Dal</span><input className="input" type="date" value={filter.from ?? ''} onChange={(e) => set({ from: e.target.value || null })} /></label>
            <label className="field"><span>Al</span><input className="input" type="date" value={filter.to ?? ''} onChange={(e) => set({ to: e.target.value || null })} /></label>
          </div>
          {activeFilters > 0 && <button type="button" className="btn sm" onClick={() => setFilter({})}>Azzera filtri</button>}
        </div>
      </details>

      {active && (
        <Link to={`/workout/${active.id}`} className="card accent card-link row">
          <span className="code-badge">{active.templateCode}</span>
          <span className="grow">
            <span className="strong">{active.templateName}</span>
            <span className="small muted" style={{ display: 'block' }}>In corso · {formatDateLong(active.date)}</span>
          </span>
          <span className="badge warn">Riprendi</span>
        </Link>
      )}

      {!data ? (
        <p className="muted">Caricamento…</p>
      ) : groups.length === 0 ? (
        <EmptyState icon={<IconHistory size={40} />} title={activeFilters ? 'Nessun allenamento per i filtri selezionati.' : 'Nessun allenamento registrato.'} />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="stack-sm">
            <h2 className="section-title" style={{ textTransform: 'capitalize' }}>{g.label}</h2>
            <div className="list">
              {g.sessions.map(({ session: s, total, done }) => (
                <Link key={s.id} to={`/history/${s.id}`} className="list-item">
                  <span className="code-badge muted">{s.templateCode}</span>
                  <span className="grow">
                    <span className="strong" style={{ textTransform: 'capitalize' }}>{formatDateLong(s.date)}</span>
                    <span className="small muted" style={{ display: 'block' }}>
                      {s.templateName} · {s.programName} · {formatDuration(s.activeDurationSec)}
                    </span>
                  </span>
                  <span className={`badge ${done === total && total > 0 ? 'good' : 'warn'}`}>
                    {done === total && total > 0 ? 'Completo' : `${done}/${total}`}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
