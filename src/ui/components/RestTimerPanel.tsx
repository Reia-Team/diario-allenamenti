import { restTimer } from '../../services/timer';
import { useNow, useTimerState } from '../hooks';
import { formatClock } from '../../domain/format';
import { IconChevronRight, IconPause, IconPlay, IconSkip, IconStop, IconTimer } from '../icons';

export function useTimerRemaining() {
  const state = useTimerState();
  useNow(250, state.status === 'running');
  return { state, remainingMs: restTimer.remainingMs() };
}

/** Pannello del timer di recupero: tempo grande, pausa, +15/+30, salta, stop. */
export function RestTimerPanel({ onMinimize }: { onMinimize: () => void }) {
  const { state, remainingMs } = useTimerRemaining();
  if (state.status === 'idle') return null;
  const finished = state.status === 'finished';
  const pct = state.durationMs > 0 ? Math.min(100, (remainingMs / state.durationMs) * 100) : 0;

  return (
    <section className={`timer-panel${finished ? ' finished' : ''}`} aria-label="Timer di recupero">
      <div className="timer-panel-inner">
        <div className="spread">
          <span className="row strong">
            <IconTimer size={20} />
            {finished ? 'RECUPERO TERMINATO' : state.status === 'paused' ? 'Recupero in pausa' : 'Recupero'}
          </span>
          <button type="button" className="btn sm ghost" onClick={onMinimize}>
            Riduci <IconChevronRight size={18} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>
        <div className="timer-display" role="timer" aria-live={finished ? 'assertive' : 'off'}>
          {finished ? 'VIA!' : formatClock(Math.ceil(remainingMs / 1000))}
        </div>
        {!finished && (
          <div className="timer-bar" aria-hidden="true">
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
        {finished ? (
          <div className="grid-2">
            <button type="button" className="btn lg" onClick={() => restTimer.addSeconds(15)}>+15 s</button>
            <button type="button" className="btn lg good" onClick={() => restTimer.dismiss()}>OK</button>
          </div>
        ) : (
          <>
            <div className="grid-3">
              <button type="button" className="btn lg" onClick={() => restTimer.addSeconds(15)}>+15 s</button>
              <button type="button" className="btn lg" onClick={() => restTimer.addSeconds(30)}>+30 s</button>
              {state.status === 'paused' ? (
                <button type="button" className="btn lg" onClick={() => restTimer.resume()} aria-label="Riprendi timer"><IconPlay /></button>
              ) : (
                <button type="button" className="btn lg" onClick={() => restTimer.pause()} aria-label="Metti in pausa il timer"><IconPause /></button>
              )}
            </div>
            <div className="grid-2">
              <button type="button" className="btn lg" onClick={() => restTimer.stop()}><IconStop size={20} /> Stop</button>
              <button type="button" className="btn lg primary" onClick={() => restTimer.skip()}><IconSkip size={20} /> Salta recupero</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function TimerMini({ onClick }: { onClick: () => void }) {
  const { state, remainingMs } = useTimerRemaining();
  if (state.status === 'idle') return null;
  return (
    <button type="button" className="timer-mini" onClick={onClick} aria-label="Apri timer di recupero">
      <IconTimer size={20} />
      {state.status === 'finished' ? 'Via!' : formatClock(Math.ceil(remainingMs / 1000))}
    </button>
  );
}
