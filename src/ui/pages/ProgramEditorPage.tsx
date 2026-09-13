import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { createTemplate, getProgram, listTemplates, listWorkoutExercises, moveTemplate, setActiveProgram, updateProgram } from '../../data/repo/programs';
import { useSettings } from '../hooks';
import { useAction } from '../toast';
import { EmptyState, Field, PageHeader } from '../components/common';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { IconChevronRight, IconDown, IconPlus, IconUp } from '../icons';

export function ProgramEditorPage() {
  const { programId = '' } = useParams();
  const program = useLiveQuery(() => getProgram(programId).then((p) => p ?? null), [programId]);
  const templates = useLiveQuery(() => listTemplates(programId), [programId]) ?? [];
  const counts = useLiveQuery(
    async () => Object.fromEntries(await Promise.all(templates.map(async (t) => [t.id, (await listWorkoutExercises(t.id)).length] as const))),
    [templates.map((t) => t.id).join()],
  ) ?? {};
  const settings = useSettings();
  const run = useAction();

  if (program === undefined) return <main className="page muted">Caricamento…</main>;
  if (program === null) {
    return <main className="page"><PageHeader title="Programma" back="/programs" /><EmptyState title="Programma non trovato" /></main>;
  }

  return (
    <main className="page stack-lg">
      <PageHeader title={program.name} back="/programs" />
      {program.id !== settings.activeProgramId && (
        <button type="button" className="btn block" onClick={() => run(() => setActiveProgram(program.id), 'Programma attivo aggiornato')}>
          Usa come programma attivo
        </button>
      )}
      <section className="card stack">
        <Field label="Nome">
          <input className="input" defaultValue={program.name} key={`n${program.updatedAt}`}
            onBlur={(e) => e.target.value.trim() && e.target.value !== program.name && run(() => updateProgram(program.id, { name: e.target.value }))} />
        </Field>
        <Field label="Descrizione">
          <textarea className="input" defaultValue={program.description} key={`d${program.updatedAt}`}
            onBlur={(e) => e.target.value !== program.description && run(() => updateProgram(program.id, { description: e.target.value }))} />
        </Field>
      </section>

      <section className="stack-sm">
        <h2 className="section-title">Schede · sequenza {templates.map((t) => t.code).join(' → ')}</h2>
        <div className="list">
          {templates.map((t, i) => (
            <div key={t.id} className="list-item">
              <span className="code-badge">{t.code}</span>
              <Link to={`/programs/${program.id}/templates/${t.id}`} className="grow" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className="strong">{t.name}</span>
                <span className="small muted" style={{ display: 'block' }}>{counts[t.id] ?? 0} esercizi</span>
              </Link>
              <button type="button" className="icon-btn" aria-label={`Sposta ${t.name} prima`} disabled={i === 0} onClick={() => run(() => moveTemplate(t.id, -1))}><IconUp /></button>
              <button type="button" className="icon-btn" aria-label={`Sposta ${t.name} dopo`} disabled={i === templates.length - 1} onClick={() => run(() => moveTemplate(t.id, 1))}><IconDown /></button>
              <Link to={`/programs/${program.id}/templates/${t.id}`} className="icon-btn" aria-label={`Modifica ${t.name}`}><IconChevronRight /></Link>
            </div>
          ))}
          {!templates.length && <p className="muted center" style={{ padding: 16 }}>Nessuna scheda.</p>}
        </div>
        <button type="button" className="btn block" onClick={() => run(() => createTemplate(program.id), 'Scheda aggiunta')}>
          <IconPlus size={20} /> Aggiungi scheda
        </button>
      </section>

      <section className="card stack">
        <h2>Calendario</h2>
        <ScheduleEditor program={program} />
      </section>
    </main>
  );
}
