import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Field, Modal } from './common';
import { createExercise, listExercises, MUSCLE_GROUPS } from '../../data/repo/exercises';
import { searchExercises } from '../../domain/search';
import type { Exercise, ExerciseKind } from '../../domain/types';
import { IconPlus, IconSearch } from '../icons';
import { useAction } from '../toast';

export const KIND_LABEL: Record<ExerciseKind, string> = {
  strength: 'Sovraccarico',
  bodyweight: 'Corpo libero',
  cardio: 'Cardio',
};

export function ExercisePicker({ open, onClose, onPick, title = 'Scegli esercizio' }: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  title?: string;
}) {
  const exercises = useLiveQuery(() => listExercises(), []) ?? [];
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', muscleGroup: MUSCLE_GROUPS[0], kind: 'strength' as ExerciseKind });
  const run = useAction();
  const results = useMemo(() => searchExercises(exercises, query), [exercises, query]);

  const create = async () => {
    const ex = await run(() => createExercise({ ...draft, name: draft.name || query }), 'Esercizio creato');
    if (ex) {
      setCreating(false);
      onPick(ex);
    }
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {creating ? (
        <div className="stack">
          <Field label="Nome">
            <input className="input" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Gruppo muscolare">
            <select className="input" value={draft.muscleGroup} onChange={(e) => setDraft({ ...draft, muscleGroup: e.target.value })}>
              {MUSCLE_GROUPS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ExerciseKind })}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setCreating(false)}>Annulla</button>
            <button type="button" className="btn primary" onClick={create} disabled={!draft.name.trim()}>Crea e aggiungi</button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <label className="row input" style={{ padding: '0 10px' }}>
            <IconSearch size={20} />
            <input
              className="grow"
              style={{ border: 0, background: 'transparent', outline: 'none', minHeight: 46 }}
              placeholder="Cerca (es. panca)"
              aria-label="Cerca esercizio"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </label>
          <div className="list" style={{ maxHeight: '50dvh', overflowY: 'auto' }}>
            {results.map((e) => (
              <button key={e.id} type="button" className="list-item" onClick={() => onPick(e)}>
                <span className="grow">
                  <span className="strong">{e.name}</span>
                  <span className="small muted" style={{ display: 'block' }}>{e.muscleGroup} · {KIND_LABEL[e.kind]}</span>
                </span>
              </button>
            ))}
            {!results.length && <p className="muted center" style={{ padding: 16 }}>Nessun esercizio trovato.</p>}
          </div>
          <button
            type="button"
            className="btn block"
            onClick={() => {
              setDraft((d) => ({ ...d, name: query.trim() }));
              setCreating(true);
            }}
          >
            <IconPlus size={20} /> Crea nuovo esercizio
          </button>
        </div>
      )}
    </Modal>
  );
}
