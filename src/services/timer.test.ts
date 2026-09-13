import { beforeEach, describe, expect, it } from 'vitest';
import { RestTimer, type RestEnded, type TimerDeps } from './timer';

function setup() {
  let now = 1_000_000;
  const store = new Map<string, string>();
  const deps: TimerDeps = {
    now: () => now,
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
    setInterval: () => 1,
    clearInterval: () => {},
  };
  const ended: RestEnded[] = [];
  let finishes = 0;
  const make = () => {
    const t = new RestTimer(deps, 'k');
    t.onRestEnded((e) => ended.push(e));
    t.onFinish(() => finishes++);
    return t;
  };
  return {
    make,
    advance: (ms: number) => { now += ms; },
    ended,
    finishes: () => finishes,
    store,
  };
}

describe('timer di recupero', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it('conta alla rovescia e termina con allarme e recupero registrato', () => {
    const t = env.make();
    t.start({ durationSec: 90, setId: 'set1' });
    env.advance(30_000);
    t.tick();
    expect(t.remainingMs()).toBe(60_000);
    env.advance(60_000);
    t.tick();
    expect(t.getState().status).toBe('finished');
    expect(env.finishes()).toBe(1);
    expect(env.ended).toEqual([{ setId: 'set1', elapsedSec: 90, reason: 'finished' }]);
  });

  it('pausa e ripresa: il tempo in pausa non scorre', () => {
    const t = env.make();
    t.start({ durationSec: 60 });
    env.advance(10_000);
    t.pause();
    env.advance(120_000);
    t.tick();
    expect(t.getState().status).toBe('paused');
    expect(t.remainingMs()).toBe(50_000);
    t.resume();
    env.advance(50_000);
    t.tick();
    expect(t.getState().status).toBe('finished');
  });

  it('+15 / +30 secondi', () => {
    const t = env.make();
    t.start({ durationSec: 60 });
    t.addSeconds(15);
    t.addSeconds(30);
    expect(t.remainingMs()).toBe(105_000);
    expect(t.getState().durationMs).toBe(105_000);
  });

  it('+15 dopo la scadenza riavvia un breve recupero', () => {
    const t = env.make();
    t.start({ durationSec: 10 });
    env.advance(10_000);
    t.tick();
    t.addSeconds(15);
    expect(t.getState().status).toBe('running');
    expect(t.remainingMs()).toBe(15_000);
  });

  it('salta: registra il recupero effettivo', () => {
    const t = env.make();
    t.start({ durationSec: 120, setId: 's' });
    env.advance(45_000);
    t.skip();
    expect(t.getState().status).toBe('idle');
    expect(env.ended).toEqual([{ setId: 's', elapsedSec: 45, reason: 'skipped' }]);
  });

  it('un nuovo recupero chiude il precedente', () => {
    const t = env.make();
    t.start({ durationSec: 120, setId: 'a' });
    env.advance(20_000);
    t.start({ durationSec: 120, setId: 'b' });
    expect(env.ended[0]).toMatchObject({ setId: 'a', elapsedSec: 20, reason: 'stopped' });
    expect(t.getState().setId).toBe('b');
  });

  it('sopravvive alla ricarica della pagina (stato persistito)', () => {
    const t = env.make();
    t.start({ durationSec: 90, setId: 'x' });
    env.advance(40_000);
    const reloaded = env.make();
    reloaded.hydrate();
    expect(reloaded.getState().status).toBe('running');
    expect(reloaded.remainingMs()).toBe(50_000);
  });

  it('app riaperta molto dopo la scadenza: stato finito ma nessun allarme tardivo', () => {
    const t = env.make();
    t.start({ durationSec: 60, setId: 'x' });
    env.advance(30 * 60_000);
    const reloaded = env.make();
    reloaded.hydrate();
    expect(reloaded.getState().status).toBe('finished');
    expect(env.finishes()).toBe(0);
    expect(env.ended.at(-1)).toMatchObject({ setId: 'x', elapsedSec: 60, reason: 'finished' });
  });

  it('dati corrotti in storage non bloccano il timer', () => {
    env.store.set('k', '{not json');
    const t = env.make();
    t.hydrate();
    expect(t.getState().status).toBe('idle');
  });
});
