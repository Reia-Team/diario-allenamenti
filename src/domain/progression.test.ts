import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRESSION, detectWorsening, suggestProgression, type ProgressionInput } from './progression';
import type { ProgressionRule } from './types';
import { set, sets } from './testFactories';

const rule = (type: ProgressionRule['type'], extra: Partial<ProgressionRule> = {}): ProgressionRule => ({
  ...DEFAULT_PROGRESSION,
  type,
  ...extra,
});

const base = (partial: Partial<ProgressionInput>): ProgressionInput => ({
  rule: rule('double'),
  kind: 'strength',
  target: { sets: 3, repsMin: 8, repsMax: 12 },
  lastSets: [],
  unit: 'kg',
  ...partial,
});

describe('progressione doppia (3 × 8–12)', () => {
  it('12/12/12 @ 50 kg → prova 52,5 kg', () => {
    const s = suggestProgression(base({ lastSets: sets(50, [12, 12, 12]) }));
    expect(s.type).toBe('increase');
    expect(s.weightKg).toBe(52.5);
    expect(s.message).toBe('Prova 52,5 kg');
  });

  it('10/8/7 @ 50 kg → mantieni 50 kg', () => {
    const s = suggestProgression(base({ lastSets: sets(50, [10, 8, 7]) }));
    expect(s.type).toBe('maintain');
    expect(s.weightKg).toBe(50);
    expect(s.message).toBe('Mantieni 50 kg');
  });

  it('serie mancanti: non si aumenta', () => {
    const s = suggestProgression(base({ lastSets: sets(50, [12, 12]) }));
    expect(s.type).toBe('maintain');
  });

  it('peggioramento significativo viene segnalato', () => {
    const s = suggestProgression(
      base({ lastSets: sets(50, [9, 7, 6]), previousSets: sets(50, [12, 11, 10]) }),
    );
    expect(s.type).toBe('maintain');
    expect(s.worsening).not.toBeNull();
    expect(Math.round(s.worsening!.pct)).toBe(33);
  });

  it('incremento configurabile', () => {
    const s = suggestProgression(base({ rule: rule('double', { incrementKg: 5 }), lastSets: sets(50, [12, 12, 12]) }));
    expect(s.weightKg).toBe(55);
  });
});

describe('altre regole', () => {
  it('incremento fisso: obiettivo 4 × 10', () => {
    const target = { sets: 4, repsMin: 10, repsMax: 10 };
    expect(suggestProgression(base({ rule: rule('fixed'), target, lastSets: sets(70, [10, 10, 10, 10]) })).weightKg).toBe(72.5);
    const keep = suggestProgression(base({ rule: rule('fixed'), target, lastSets: sets(70, [10, 10, 9, 8]) }));
    expect(keep.type).toBe('maintain');
    expect(keep.weightKg).toBe(70);
  });

  it('incremento percentuale con arrotondamento', () => {
    const s = suggestProgression(base({ rule: rule('percent', { percent: 5, roundToKg: 2.5 }), lastSets: sets(70, [12, 12, 12]) }));
    expect(s.weightKg).toBe(72.5); // 73,5 → 72,5
    const small = suggestProgression(base({ rule: rule('percent', { percent: 1, roundToKg: 2.5 }), lastSets: sets(20, [12, 12, 12]) }));
    expect(small.weightKg).toBe(22.5); // l'arrotondamento non può annullare l'aumento
  });

  it('mantenimento, manuale, nessuno', () => {
    expect(suggestProgression(base({ rule: rule('maintain'), lastSets: sets(50, [12, 12, 12]) })).type).toBe('maintain');
    const manual = suggestProgression(base({ rule: rule('manual'), lastSets: sets(50, [12, 12, 12]) }));
    expect(manual.type).toBe('manual');
    expect(manual.weightKg).toBe(50);
    expect(suggestProgression(base({ rule: rule('none'), lastSets: sets(50, [12, 12, 12]) })).type).toBe('none');
  });

  it('nessun dato precedente', () => {
    expect(suggestProgression(base({ lastSets: [] })).type).toBe('no_data');
  });

  it('serie non completate ignorate', () => {
    const s = suggestProgression(base({ lastSets: sets(50, [12, 12, 12]).map((x) => ({ ...x, completed: false })) }));
    expect(s.type).toBe('no_data');
  });

  it('corpo libero: progressione sulle ripetizioni', () => {
    const target = { sets: 3, repsMin: 12, repsMax: 12 };
    expect(suggestProgression(base({ kind: 'bodyweight', target, lastSets: sets(null, [12, 12, 12]) })).type).toBe('increase_reps');
    expect(suggestProgression(base({ kind: 'bodyweight', target, lastSets: sets(null, [12, 10, 9]) })).type).toBe('maintain');
  });

  it('cardio: nessun suggerimento di carico', () => {
    expect(suggestProgression(base({ kind: 'cardio', lastSets: [set({ durationSec: 900 })] })).type).toBe('none');
  });
});

describe('detectWorsening', () => {
  it('confronta 1RM stimato se i carichi differiscono', () => {
    const w = detectWorsening(sets(60, [5, 5, 5]), sets(70, [10, 10, 10]), 10);
    expect(w).not.toBeNull();
  });
  it('calo sotto soglia non segnalato', () => {
    expect(detectWorsening(sets(50, [12, 11, 11]), sets(50, [12, 12, 11]), 10)).toBeNull();
  });
});
