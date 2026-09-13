import type { ExerciseKind, ProgressionRule, ProgressionRuleType, WeightUnit } from './types';
import { countsForStats, referenceWeight, type SetLike } from './metrics';
import { estimateOneRm } from './oneRm';
import { roundTo } from './format';
import { formatWeight } from './units';

/**
 * Motore di progressione. È puro: riceve le prestazioni passate e restituisce un SUGGERIMENTO.
 * Non modifica mai dati: l'utente decide se applicarlo.
 */

export const DEFAULT_PROGRESSION: ProgressionRule = {
  type: 'double',
  incrementKg: 2.5,
  percent: 2.5,
  roundToKg: 2.5,
  worseningThresholdPct: 10,
};

export const PROGRESSION_LABEL: Record<ProgressionRuleType, string> = {
  double: 'Progressione doppia',
  fixed: 'Incremento fisso',
  percent: 'Incremento percentuale',
  maintain: 'Mantenimento',
  manual: 'Progressione manuale',
  none: 'Nessun suggerimento',
};

export const PROGRESSION_HELP: Record<ProgressionRuleType, string> = {
  double: 'Aumenta il carico quando tutte le serie raggiungono il massimo delle ripetizioni; altrimenti aumenta prima le ripetizioni.',
  fixed: 'Aumenta di un incremento fisso quando tutte le serie raggiungono le ripetizioni obiettivo.',
  percent: 'Aumenta di una percentuale del carico quando tutte le serie raggiungono le ripetizioni obiettivo.',
  maintain: 'Suggerisce sempre lo stesso carico dell’ultima volta.',
  manual: 'Mostra solo l’ultimo carico: decidi tu ogni volta.',
  none: 'Nessun suggerimento per questo esercizio.',
};

export type SuggestionType = 'increase' | 'maintain' | 'increase_reps' | 'manual' | 'no_data' | 'none';

export interface Worsening {
  pct: number;
  message: string;
}

export interface Suggestion {
  type: SuggestionType;
  /** Carico suggerito in kg (null per corpo libero, cardio o assenza dati). */
  weightKg: number | null;
  /** Titolo breve, es. "Prova 72,5 kg". */
  message: string;
  /** Spiegazione del perché. */
  detail: string;
  worsening: Worsening | null;
}

export interface ProgressionTarget {
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
}

export interface ProgressionInput {
  rule: ProgressionRule;
  kind: ExerciseKind;
  target: ProgressionTarget;
  /** Serie dell'ultima sessione in cui l'esercizio è stato eseguito. */
  lastSets: SetLike[];
  /** Serie della sessione precedente all'ultima (per rilevare peggioramenti). */
  previousSets?: SetLike[];
  unit: WeightUnit;
}

function workingSets(sets: SetLike[]): SetLike[] {
  return sets.filter(countsForStats).sort((a, b) => a.setNumber - b.setNumber);
}

/** Tutte le serie previste raggiungono `repsGoal` al carico di riferimento. */
function targetAchieved(sets: SetLike[], ref: number | null, target: ProgressionTarget, repsGoal: number): boolean {
  const atRef = sets.filter((s) => (ref === null ? s.weightKg === null : s.weightKg !== null && s.weightKg >= ref));
  if (atRef.length < Math.max(1, target.sets)) return false;
  return atRef.slice(0, Math.max(1, target.sets)).every((s) => s.reps !== null && s.reps >= repsGoal);
}

/**
 * Peggioramento: a parità di carico si confrontano le ripetizioni totali,
 * altrimenti il miglior 1RM stimato.
 */
export function detectWorsening(last: SetLike[], previous: SetLike[], thresholdPct: number): Worsening | null {
  const l = workingSets(last);
  const p = workingSets(previous);
  if (!l.length || !p.length) return null;
  const lRef = referenceWeight(l);
  const pRef = referenceWeight(p);
  let drop: number | null = null;
  if (lRef === pRef) {
    const repsAt = (sets: SetLike[], ref: number | null) =>
      sets.filter((s) => s.weightKg === ref).reduce((a, s) => a + (s.reps ?? 0), 0);
    const lr = repsAt(l, lRef);
    const pr = repsAt(p, pRef);
    if (pr > 0) drop = ((pr - lr) / pr) * 100;
  } else {
    const best = (sets: SetLike[]) =>
      Math.max(0, ...sets.map((s) => estimateOneRm(s.weightKg, s.reps, 'epley') ?? 0));
    const lb = best(l);
    const pb = best(p);
    if (lb > 0 && pb > 0) drop = ((pb - lb) / pb) * 100;
  }
  if (drop === null || drop <= thresholdPct) return null;
  return {
    pct: drop,
    message: `Prestazione in calo del ${Math.round(drop)}% rispetto alla sessione precedente. Valuta recupero, sonno o un carico più leggero.`,
  };
}

export function suggestProgression(input: ProgressionInput): Suggestion {
  const { rule, kind, target, unit } = input;
  const none: Suggestion = { type: 'none', weightKg: null, message: '', detail: '', worsening: null };
  if (rule.type === 'none' || kind === 'cardio') return none;

  const sets = workingSets(input.lastSets);
  if (!sets.length) {
    return {
      type: 'no_data',
      weightKg: null,
      message: 'Nessun dato precedente',
      detail: 'Scegli un carico con cui completare le ripetizioni con buona tecnica.',
      worsening: null,
    };
  }

  const worsening =
    input.previousSets && rule.type !== 'manual'
      ? detectWorsening(sets, input.previousSets, rule.worseningThresholdPct)
      : null;
  const ref = referenceWeight(sets);
  const repsGoal = target.repsMax ?? target.repsMin;

  if (rule.type === 'manual') {
    return {
      type: 'manual',
      weightKg: ref,
      message: ref === null ? 'Progressione manuale' : `Ultimo carico: ${formatWeight(ref, unit)}`,
      detail: 'Progressione manuale: decidi tu il carico.',
      worsening: null,
    };
  }

  // Corpo libero (nessun carico registrato): la progressione avviene sulle ripetizioni.
  if (ref === null) {
    if (repsGoal !== null && targetAchieved(sets, null, target, repsGoal) && rule.type !== 'maintain') {
      return {
        type: 'increase_reps',
        weightKg: null,
        message: 'Aggiungi 1–2 ripetizioni',
        detail: `Obiettivo di ${repsGoal} ripetizioni raggiunto in tutte le serie.`,
        worsening,
      };
    }
    return {
      type: 'maintain',
      weightKg: null,
      message: repsGoal !== null ? `Punta a ${repsGoal} ripetizioni` : 'Mantieni',
      detail: repsGoal !== null ? 'Completa tutte le serie previste prima di aumentare.' : 'Nessun obiettivo di ripetizioni impostato.',
      worsening,
    };
  }

  const maintain = (detail: string): Suggestion => ({
    type: 'maintain',
    weightKg: ref,
    message: `Mantieni ${formatWeight(ref, unit)}`,
    detail,
    worsening,
  });

  if (rule.type === 'maintain') return maintain('Regola di mantenimento.');
  if (repsGoal === null) return maintain('Imposta un obiettivo di ripetizioni per ricevere suggerimenti di aumento.');
  if (worsening) return maintain('Consolida il carico attuale prima di aumentare.');

  const achieved = targetAchieved(sets, ref, target, repsGoal);
  const increase = (weightKg: number, detail: string): Suggestion => ({
    type: 'increase',
    weightKg,
    message: `Prova ${formatWeight(weightKg, unit)}`,
    detail,
    worsening: null,
  });

  switch (rule.type) {
    case 'fixed':
      return achieved
        ? increase(ref + rule.incrementKg, `Tutte le ${target.sets} serie a ${repsGoal} ripetizioni: +${formatWeight(rule.incrementKg, unit)}.`)
        : maintain(`Completa ${target.sets} × ${repsGoal} prima di aumentare.`);
    case 'percent': {
      if (!achieved) return maintain(`Completa ${target.sets} × ${repsGoal} prima di aumentare.`);
      let next = roundTo(ref * (1 + rule.percent / 100), rule.roundToKg);
      if (next <= ref) next = ref + (rule.roundToKg > 0 ? rule.roundToKg : 1);
      return increase(next, `Obiettivo raggiunto: +${rule.percent}% arrotondato.`);
    }
    case 'double': {
      if (achieved) {
        return increase(
          ref + rule.incrementKg,
          `Tutte le serie hanno raggiunto ${repsGoal} ripetizioni: aumenta il carico e riparti da ${target.repsMin ?? repsGoal}.`,
        );
      }
      const minOk = target.repsMin !== null && targetAchieved(sets, ref, target, target.repsMin);
      return maintain(
        minOk
          ? `Aumenta le ripetizioni fino a ${repsGoal} in tutte le serie.`
          : `Consolida almeno ${target.repsMin ?? repsGoal} ripetizioni per serie.`,
      );
    }
  }
  return none;
}
