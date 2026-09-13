import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { createProgram, deleteProgram, duplicateProgram, listPrograms, listTemplates, setActiveProgram, setProgramStatus } from '../../data/repo/programs';
import type { Program } from '../../domain/types';
import { useSettings } from '../hooks';
import { useAction } from '../toast';
import { ConfirmDialog, EmptyState, Field, Modal, PageHeader } from '../components/common';
import { NumberStepper } from '../components/NumberStepper';
import { IconArchive, IconCopy, IconDumbbell, IconPlus, IconTrash } from '../icons';

export function ProgramsPage() {
  const programs = useLiveQuery(listPrograms, []);
  const settings = useSettings();
  const run = useAction();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [count, setCount] = useState<number | null>(2);
  const [toDelete, setToDelete] = useState<Program | null>(null);

  const active = programs?.filter((p) => p.status === 'active') ?? [];
  const archived = programs?.filter((p) => p.status === 'archived') ?? [];

  return (
    <main className="page stack">
      <PageHeader
        title="Programmi"
        actions={<Link to="/exercises" className="btn sm"><IconDumbbell size={18} /> Esercizi</Link>}
      />
      <button type="button" className="btn primary block lg" onClick={() => setCreateOpen(true)}>
        <IconPlus /> Nuovo programma
      </button>

      {programs && !programs.length && <EmptyState title="Nessun programma. Creane uno per iniziare." />}

      {active.length > 0 && <h2 className="section-title">Attivi</h2>}
      {active.map((p) => (
        <ProgramCard key={p.id} program={p} current={p.id === settings.activeProgramId}
          onActivate={() => run(() => setActiveProgram(p.id), `«${p.name}» è ora il programma attivo`)}
          onDuplicate={() => run(async () => { const c = await duplicateProgram(p.id); navigate(`/programs/${c.id}`); }, 'Programma duplicato')}
          onArchive={() => run(() => setProgramStatus(p.id, 'archived'), 'Programma archiviato: lo storico resta disponibile')}
          onDelete={() => setToDelete(p)} />
      ))}
      {archived.length > 0 && <h2 className="section-title">Archiviati</h2>}
      {archived.map((p) => (
        <ProgramCard key={p.id} program={p} current={false}
          onActivate={() => run(() => setProgramStatus(p.id, 'active'), 'Programma riattivato')}
          onDuplicate={() => run(() => duplicateProgram(p.id), 'Programma duplicato')}
          onDelete={() => setToDelete(p)} />
      ))}

      <Modal
        open={createOpen}
        title="Nuovo programma"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>Annulla</button>
            <button
              type="button"
              className="btn primary"
              disabled={!name.trim()}
              onClick={async () => {
                const p = await run(() => createProgram({ name, templateCount: count ?? 1 }));
                if (p) {
                  setCreateOpen(false);
                  setName('');
                  navigate(`/programs/${p.id}`);
                }
              }}
            >
              Crea
            </button>
          </>
        }
      >
        <div className="stack">
          <Field label="Nome"><input className="input" autoFocus value={name} placeholder="Es. Ipertrofia" onChange={(e) => setName(e.target.value)} /></Field>
          <NumberStepper label="Schede (A, B, C…)" integer step={1} min={1} max={12} value={count} onChange={setCount} compact />
          <p className="hint">Potrai aggiungere, rinominare e riordinare le schede in seguito.</p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title={`Eliminare «${toDelete?.name}»?`}
        message={
          <>
            <p>Il programma e le sue schede verranno eliminati.</p>
            <p><strong>Gli allenamenti già eseguiti restano nello storico</strong> con i relativi grafici. Se vuoi solo nasconderlo, archivialo.</p>
          </>
        }
        confirmLabel="Elimina programma"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const p = toDelete!;
          setToDelete(null);
          await run(() => deleteProgram(p.id), 'Programma eliminato');
        }}
      />
    </main>
  );
}

function ProgramCard({ program, current, onActivate, onDuplicate, onArchive, onDelete }: {
  program: Program;
  current: boolean;
  onActivate: () => void;
  onDuplicate: () => void;
  onArchive?: () => void;
  onDelete: () => void;
}) {
  const templates = useLiveQuery(() => listTemplates(program.id), [program.id]) ?? [];
  return (
    <article className="card stack-sm">
      <Link to={`/programs/${program.id}`} className="card-link stack-sm">
        <div className="spread">
          <h2 className="grow ellipsis">{program.name}</h2>
          {current && <span className="badge good">Attivo</span>}
          {program.status === 'archived' && <span className="badge">Archiviato</span>}
        </div>
        {program.description && <p className="small muted">{program.description}</p>}
        <div className="row-wrap">
          {templates.map((t) => <span key={t.id} className="code-badge muted" title={t.name}>{t.code}</span>)}
          {!templates.length && <span className="small muted">Nessuna scheda</span>}
        </div>
      </Link>
      <div className="row-wrap">
        {!current && <button type="button" className="btn sm" onClick={onActivate}>{program.status === 'archived' ? 'Riattiva' : 'Imposta attivo'}</button>}
        <button type="button" className="btn sm" onClick={onDuplicate}><IconCopy size={16} /> Duplica</button>
        {onArchive && <button type="button" className="btn sm" onClick={onArchive}><IconArchive size={16} /> Archivia</button>}
        <button type="button" className="btn sm danger" onClick={onDelete} aria-label={`Elimina ${program.name}`}><IconTrash size={16} /></button>
      </div>
    </article>
  );
}
