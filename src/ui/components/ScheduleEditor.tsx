import type { Program, CalendarMode } from '../../domain/types';
import { updateProgram } from '../../data/repo/programs';
import { isValidISODate } from '../../domain/dates';
import { useAction } from '../toast';

const DAYS = [
  { value: 1, short: 'L', long: 'lunedì' },
  { value: 2, short: 'M', long: 'martedì' },
  { value: 3, short: 'M', long: 'mercoledì' },
  { value: 4, short: 'G', long: 'giovedì' },
  { value: 5, short: 'V', long: 'venerdì' },
  { value: 6, short: 'S', long: 'sabato' },
  { value: 0, short: 'D', long: 'domenica' },
];

const MODES: { value: CalendarMode; title: string; text: string }[] = [
  {
    value: 'keep_sequence',
    title: 'Mantieni la sequenza',
    text: 'Se salti un giorno, la scheda non si perde: la prossima volta farai quella saltata (Lun A · Mer saltato · Ven B).',
  },
  {
    value: 'follow_calendar',
    title: 'Segui il calendario',
    text: 'Ogni giorno ha la sua scheda: se salti un giorno, quella scheda è persa (Lun A · Mer B saltato · Ven A).',
  },
];

/** Giorni abituali, data di inizio e comportamento con i giorni saltati. Salva subito. */
export function ScheduleEditor({ program }: { program: Program }) {
  const run = useAction();
  const { schedule } = program;
  const save = (patch: Partial<Program['schedule']>) => run(() => updateProgram(program.id, { schedule: { ...schedule, ...patch } }));

  return (
    <div className="stack">
      <div className="stack-sm">
        <span className="label">Giorni di allenamento</span>
        <div className="day-chips">
          {DAYS.map((d) => {
            const on = schedule.trainingDays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                className="chip"
                aria-pressed={on}
                aria-label={d.long}
                onClick={() =>
                  save({
                    trainingDays: on ? schedule.trainingDays.filter((x) => x !== d.value) : [...schedule.trainingDays, d.value].sort(),
                  })
                }
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>
      <label className="field">
        <span>Data di inizio della sequenza</span>
        <input
          className="input"
          type="date"
          value={schedule.startDate}
          onChange={(e) => isValidISODate(e.target.value) && save({ startDate: e.target.value })}
        />
      </label>
      <div className="stack-sm" role="radiogroup" aria-label="Giorni saltati">
        <span className="label">Se salti un allenamento</span>
        {MODES.map((m) => (
          <label key={m.value} className="radio-card">
            <input type="radio" name={`mode-${program.id}`} checked={schedule.mode === m.value} onChange={() => save({ mode: m.value })} />
            <span>
              <span className="strong">{m.title}</span>
              <span className="small muted" style={{ display: 'block' }}>{m.text}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
