import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { listExercises } from '../../data/repo/exercises';
import { searchExercises } from '../../domain/search';
import { EmptyState, PageHeader, Switch } from '../components/common';
import { KIND_LABEL } from '../components/ExercisePicker';
import { IconPlus, IconSearch } from '../icons';

export function ExercisesPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const exercises = useLiveQuery(() => listExercises({ includeInactive }), [includeInactive]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const groups = useMemo(() => [...new Set(exercises?.map((e) => e.muscleGroup) ?? [])].sort(), [exercises]);
  const results = useMemo(
    () => searchExercises((exercises ?? []).filter((e) => !group || e.muscleGroup === group), query),
    [exercises, query, group],
  );

  return (
    <main className="page stack">
      <PageHeader title="Esercizi" back="/programs" actions={<Link to="/exercises/new" className="btn sm primary"><IconPlus size={18} /> Nuovo</Link>} />
      <label className="row input" style={{ padding: '0 10px' }}>
        <IconSearch size={20} />
        <input className="grow" style={{ border: 0, background: 'transparent', outline: 'none', minHeight: 46 }}
          placeholder="Cerca (es. panca)" aria-label="Cerca esercizio" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="chips" role="group" aria-label="Gruppo muscolare">
        <button type="button" className="chip" aria-pressed={!group} onClick={() => setGroup('')}>Tutti</button>
        {groups.map((g) => <button key={g} type="button" className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}
      </div>
      <Switch label="Mostra esercizi disattivati" checked={includeInactive} onChange={setIncludeInactive} />
      {exercises && !results.length ? (
        <EmptyState title="Nessun esercizio trovato." />
      ) : (
        <div className="list">
          {results.map((e) => (
            <Link key={e.id} to={`/exercises/${e.id}`} className="list-item">
              <span className="grow">
                <span className="strong">{e.name}</span>
                <span className="small muted" style={{ display: 'block' }}>{e.muscleGroup} · {KIND_LABEL[e.kind]}</span>
              </span>
              {!e.active && <span className="badge">Disattivato</span>}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
