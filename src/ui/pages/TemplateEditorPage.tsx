import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  addWorkoutExercise, deleteTemplate, getTemplate, listWorkoutExercises, moveWorkoutExercise, removeWorkoutExercise,
  updateTemplate, updateWorkoutExercise,
} from '../../data/repo/programs';
import { listExercises } from '../../data/repo/exercises';
import type { Exercise, WorkoutExercise } from '../../domain/types';
import { useAction } from '../toast';
import { ConfirmDialog, EmptyState, Field, Modal, PageHeader } from '../components/common';
import { NumberStepper } from '../components/NumberStepper';
import { ExercisePicker } from '../components/ExercisePicker';
import { restText, targetText } from '../format';
import { IconDown, IconEdit, IconPlus, IconTrash, IconUp } from '../icons';

export function TemplateEditorPage() {
  const { programId = '', templateId = '' } = useParams();
  const navigate = useNavigate();
  const run = useAction();
  const template = useLiveQuery(() => getTemplate(templateId).then((t) => t ?? null), [templateId]);
  const items = useLiveQuery(() => listWorkoutExercises(templateId), [templateId]) ?? [];
  const exercises = useLiveQuery(() => listExercises({ includeInactive: true }), []) ?? [];
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replacing, setReplacing] = useState<WorkoutExercise | null>(null);
  const [editing, setEditing] = useState<WorkoutExercise | null>(null);
  const [removing, setRemoving] = useState<WorkoutExercise | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (template === undefined) return <main className="page muted">Caricamento…</main>;
  if (template === null) return <main className="page"><PageHeader title="Scheda" back={`/programs/${programId}`} /><EmptyState title="Scheda non trovata" /></main>;

  const editingLive = editing ? items.find((i) => i.id === editing.id) ?? null : null;

  return (
    <main className="page stack-lg">
      <PageHeader title={`${template.code} · ${template.name}`} back={`/programs/${programId}`} />
      <p className="banner info small">Le modifiche valgono per i prossimi allenamenti. Gli allenamenti già eseguiti non cambiano.</p>

      <section className="card stack">
        <div className="grid-2" style={{ gridTemplateColumns: '90px 1fr' }}>
          <Field label="Codice">
            <input className="input" maxLength={4} defaultValue={template.code} key={`c${template.updatedAt}`}
              onBlur={(e) => e.target.value.trim() && e.target.value !== template.code && run(() => updateTemplate(template.id, { code: e.target.value.trim() }))} />
          </Field>
          <Field label="Nome">
            <input className="input" defaultValue={template.name} key={`n${template.updatedAt}`}
              onBlur={(e) => e.target.value.trim() && e.target.value !== template.name && run(() => updateTemplate(template.id, { name: e.target.value }))} />
          </Field>
        </div>
        <Field label="Descrizione">
          <textarea className="input" defaultValue={template.description} key={`d${template.updatedAt}`}
            onBlur={(e) => e.target.value !== template.description && run(() => updateTemplate(template.id, { description: e.target.value }))} />
        </Field>
      </section>

      <section className="stack-sm">
        <h2 className="section-title">Esercizi ({items.length})</h2>
        <div className="list">
          {items.map((we, i) => {
            const ex = byId.get(we.exerciseId);
            return (
              <div key={we.id} className="list-item">
                <span className="faint strong num" style={{ width: 22 }}>{i + 1}</span>
                <button type="button" className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={() => setEditing(we)}>
                  <span className="strong">{ex?.name ?? 'Esercizio eliminato'}</span>
                  <span className="small muted" style={{ display: 'block' }}>
                    {ex ? targetText({ ...we, kind: ex.kind }) : ''}
                    {ex?.kind !== 'cardio' && we.restSec !== null ? ` · rec. ${restText(we.restSec)}` : ''}
                    {we.notes ? ` · ${we.notes}` : ''}
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label="Sposta su" disabled={i === 0} onClick={() => run(() => moveWorkoutExercise(we.id, -1))}><IconUp /></button>
                <button type="button" className="icon-btn" aria-label="Sposta giù" disabled={i === items.length - 1} onClick={() => run(() => moveWorkoutExercise(we.id, 1))}><IconDown /></button>
              </div>
            );
          })}
          {!items.length && <p className="muted center" style={{ padding: 16 }}>Nessun esercizio.</p>}
        </div>
        <button type="button" className="btn primary block" onClick={() => setPickerOpen(true)}><IconPlus size={20} /> Aggiungi esercizio</button>
      </section>

      <button type="button" className="btn danger block" onClick={() => setConfirmDelete(true)}><IconTrash size={20} /> Elimina scheda</button>

      <ExercisePicker
        open={pickerOpen || !!replacing}
        title={replacing ? 'Sostituisci con…' : 'Aggiungi esercizio'}
        onClose={() => { setPickerOpen(false); setReplacing(null); }}
        onPick={async (ex: Exercise) => {
          if (replacing) {
            await run(() => updateWorkoutExercise(replacing.id, { exerciseId: ex.id }), 'Esercizio sostituito');
            setReplacing(null);
            return;
          }
          setPickerOpen(false);
          const we = await run(() => addWorkoutExercise(template.id, ex.id));
          if (we) setEditing(we);
        }}
      />

      {editingLive && (
        <WorkoutExerciseEditor
          we={editingLive}
          exercise={byId.get(editingLive.exerciseId)}
          onClose={() => setEditing(null)}
          onReplace={() => { setReplacing(editingLive); setEditing(null); }}
          onRemove={() => { setRemoving(editingLive); setEditing(null); }}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        danger
        title="Rimuovere l’esercizio dalla scheda?"
        message="Lo storico dell’esercizio resta disponibile."
        confirmLabel="Rimuovi"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => { const r = removing!; setRemoving(null); await run(() => removeWorkoutExercise(r.id)); }}
      />
      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Eliminare la scheda?"
        message="La scheda verrà rimossa dal programma. Gli allenamenti già eseguiti restano nello storico."
        confirmLabel="Elimina"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => { await run(() => deleteTemplate(template.id), 'Scheda eliminata'); navigate(`/programs/${programId}`, { replace: true }); }}
      />
    </main>
  );
}

function WorkoutExerciseEditor({ we, exercise, onClose, onReplace, onRemove }: {
  we: WorkoutExercise;
  exercise: Exercise | undefined;
  onClose: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const run = useAction();
  const cardio = exercise?.kind === 'cardio';
  const upd = (patch: Parameters<typeof updateWorkoutExercise>[1]) => run(() => updateWorkoutExercise(we.id, patch));
  return (
    <Modal open title={exercise?.name ?? 'Esercizio'} onClose={onClose}>
      <div className="stack">
        <NumberStepper label={cardio ? 'Blocchi' : 'Serie'} integer step={1} min={1} max={20} compact value={we.targetSets} onChange={(v) => v !== null && upd({ targetSets: v })} />
        {!cardio && (
          <>
            <div className="grid-2">
              <NumberStepper label="Rip. min" integer step={1} min={1} max={200} compact value={we.repsMin}
                onChange={(v) => upd({ repsMin: v, repsMax: v !== null && we.repsMax !== null && we.repsMax < v ? v : we.repsMax })} />
              <NumberStepper label="Rip. max" integer step={1} min={1} max={200} compact value={we.repsMax}
                onChange={(v) => upd({ repsMax: v, repsMin: v !== null && we.repsMin !== null && we.repsMin > v ? v : we.repsMin })} />
            </div>
            <p className="hint">Per un obiettivo fisso (es. 4 × 10) usa lo stesso valore; per un intervallo (es. 3 × 8–12) valori diversi.</p>
            <NumberStepper label="Recupero" unit="s" integer step={15} min={0} max={900} compact value={we.restSec} onChange={(v) => upd({ restSec: v })} />
          </>
        )}
        <NumberStepper
          label="Durata prevista"
          unit="min"
          step={1}
          min={0}
          max={600}
          decimals={1}
          compact
          value={we.targetDurationSec === null ? null : we.targetDurationSec / 60}
          onChange={(v) => upd({ targetDurationSec: v === null || v === 0 ? null : Math.round(v * 60) })}
        />
        <Field label="Note">
          <input className="input" defaultValue={we.notes} placeholder="Es. riscaldamento" onBlur={(e) => e.target.value !== we.notes && upd({ notes: e.target.value })} />
        </Field>
        <div className="grid-2">
          <button type="button" className="btn" onClick={onReplace}><IconEdit size={18} /> Sostituisci</button>
          <button type="button" className="btn danger" onClick={onRemove}><IconTrash size={18} /> Rimuovi</button>
        </div>
        <button type="button" className="btn primary block" onClick={onClose}>Fatto</button>
      </div>
    </Modal>
  );
}
