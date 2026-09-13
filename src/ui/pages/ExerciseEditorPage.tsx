import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { createExercise, deleteExercise, exerciseUsage, getExercise, MUSCLE_GROUPS, updateExercise } from '../../data/repo/exercises';
import type { CardioField, Exercise, ExerciseKind, ProgressionRule } from '../../domain/types';
import { useSettings } from '../hooks';
import { useAction } from '../toast';
import { ConfirmDialog, EmptyState, Field, PageHeader, Switch } from '../components/common';
import { KIND_LABEL } from '../components/ExercisePicker';
import { ProgressionRuleEditor } from '../components/ProgressionRuleEditor';
import { IconChart, IconTrash } from '../icons';

const CARDIO_FIELDS: { key: CardioField; label: string }[] = [
  { key: 'durationSec', label: 'Durata' },
  { key: 'distanceKm', label: 'Distanza' },
  { key: 'speedKmh', label: 'Velocità' },
  { key: 'inclinePct', label: 'Inclinazione' },
  { key: 'level', label: 'Livello / resistenza' },
  { key: 'calories', label: 'Calorie' },
];

interface Draft {
  name: string;
  muscleGroup: string;
  kind: ExerciseKind;
  description: string;
  notes: string;
  cardioFields: CardioField[];
  progression: ProgressionRule | null;
  active: boolean;
}

const EMPTY: Draft = { name: '', muscleGroup: 'Pettorali', kind: 'strength', description: '', notes: '', cardioFields: ['durationSec', 'distanceKm', 'calories'], progression: null, active: true };

export function ExerciseEditorPage() {
  const { exerciseId = 'new' } = useParams();
  const isNew = exerciseId === 'new';
  const navigate = useNavigate();
  const run = useAction();
  const settings = useSettings();
  const existing = useLiveQuery(() => (isNew ? null : getExercise(exerciseId).then((e) => e ?? null)), [exerciseId]);
  const usage = useLiveQuery(() => (isNew ? null : exerciseUsage(exerciseId)), [exerciseId]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (existing && loadedId !== existing.id) {
      setDraft(pick(existing));
      setLoadedId(existing.id);
    }
  }, [existing, loadedId]);

  if (!isNew && existing === undefined) return <main className="page muted">Caricamento…</main>;
  if (!isNew && existing === null) return <main className="page"><PageHeader title="Esercizio" back="/exercises" /><EmptyState title="Esercizio non trovato" /></main>;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const save = async () => {
    if (isNew) {
      const ex = await run(() => createExercise(draft), 'Esercizio creato');
      if (ex) navigate(`/exercises/${ex.id}`, { replace: true });
    } else {
      await run(() => updateExercise(exerciseId, draft), 'Modifiche salvate');
    }
  };
  const groups = [...new Set([...MUSCLE_GROUPS, draft.muscleGroup])];

  return (
    <main className="page stack-lg">
      <PageHeader title={isNew ? 'Nuovo esercizio' : draft.name || 'Esercizio'} back="/exercises" />
      {!isNew && (
        <Link to={`/progress/analysis?exercise=${exerciseId}`} className="btn block"><IconChart size={20} /> Analizza progressione</Link>
      )}
      <section className="card stack">
        <Field label="Nome"><input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <div className="grid-2">
          <Field label="Gruppo muscolare">
            <select className="input" value={draft.muscleGroup} onChange={(e) => set({ muscleGroup: e.target.value })}>
              {groups.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select className="input" value={draft.kind} onChange={(e) => set({ kind: e.target.value as ExerciseKind })}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        </div>
        {!isNew && usage && usage.sets > 0 && existing && draft.kind !== existing.kind && (
          <p className="banner small">Cambiare tipo non modifica le serie già registrate, ma può cambiare le metriche disponibili nei grafici.</p>
        )}
        <Field label="Descrizione / esecuzione"><textarea className="input" value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="Note"><input className="input" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        {draft.kind === 'cardio' && (
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Dati da registrare</legend>
            <div className="row-wrap">
              {CARDIO_FIELDS.map((f) => {
                const on = draft.cardioFields.includes(f.key);
                return (
                  <button key={f.key} type="button" className="chip" aria-pressed={on}
                    onClick={() => set({ cardioFields: on ? draft.cardioFields.filter((x) => x !== f.key) : [...draft.cardioFields, f.key] })}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {!isNew && <Switch label="Attivo" hint="Gli esercizi disattivati non compaiono nella ricerca, ma restano nello storico." checked={draft.active} onChange={(v) => set({ active: v })} />}
      </section>

      {draft.kind !== 'cardio' && (
        <section className="card stack">
          <h2>Progressione</h2>
          <Switch
            label="Usa la regola predefinita"
            hint="Impostabile in Impostazioni → Allenamento."
            checked={draft.progression === null}
            onChange={(v) => set({ progression: v ? null : { ...settings.defaultProgression } })}
          />
          {draft.progression && (
            <ProgressionRuleEditor value={draft.progression} unit={settings.weightUnit} onChange={(progression) => set({ progression })} />
          )}
        </section>
      )}

      <button type="button" className="btn primary lg block" disabled={!draft.name.trim()} onClick={save}>Salva</button>

      {!isNew && (
        <>
          <button type="button" className="btn danger block" onClick={() => setConfirmDelete(true)}><IconTrash size={20} /> Elimina esercizio</button>
          <ConfirmDialog
            open={confirmDelete}
            danger
            title="Eliminare l’esercizio?"
            message={usage && usage.sets > 0
              ? 'Questo esercizio ha uno storico e non può essere eliminato. Puoi disattivarlo.'
              : `Verrà rimosso anche da ${usage?.templates ?? 0} schede.`}
            confirmLabel={usage && usage.sets > 0 ? 'Disattiva' : 'Elimina'}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              setConfirmDelete(false);
              if (usage && usage.sets > 0) {
                await run(() => updateExercise(exerciseId, { active: false }), 'Esercizio disattivato');
                set({ active: false });
              } else {
                await run(() => deleteExercise(exerciseId), 'Esercizio eliminato');
                navigate('/exercises', { replace: true });
              }
            }}
          />
        </>
      )}
    </main>
  );
}

function pick(e: Exercise): Draft {
  return {
    name: e.name, muscleGroup: e.muscleGroup, kind: e.kind, description: e.description, notes: e.notes,
    cardioFields: e.cardioFields, progression: e.progression, active: e.active,
  };
}
