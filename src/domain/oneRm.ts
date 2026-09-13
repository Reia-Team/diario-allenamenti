import type { ExerciseKind, OneRmFormula } from './types';

/**
 * 1RM STIMATO — mai un record realmente eseguito.
 *
 * Formule documentate:
 * - Epley (1985):    1RM = w × (1 + r / 30)
 * - Brzycki (1993):  1RM = w × 36 / (37 − r)
 * - Lombardi (1989): 1RM = w × r^0,10
 *
 * Le stime perdono affidabilità con molte ripetizioni: si calcolano solo per 1–12 reps.
 */
export const ONE_RM_MAX_REPS = 12;

export const ONE_RM_FORMULA_LABEL: Record<OneRmFormula, string> = {
  epley: 'Epley — w × (1 + r/30)',
  brzycki: 'Brzycki — w × 36 / (37 − r)',
  lombardi: 'Lombardi — w × r^0,10',
};

export function estimateOneRm(weightKg: number | null, reps: number | null, formula: OneRmFormula): number | null {
  if (weightKg === null || reps === null) return null;
  if (!(weightKg > 0) || !Number.isInteger(reps) || reps < 1 || reps > ONE_RM_MAX_REPS) return null;
  if (reps === 1) return weightKg;
  switch (formula) {
    case 'epley':
      return weightKg * (1 + reps / 30);
    case 'brzycki':
      return (weightKg * 36) / (37 - reps);
    case 'lombardi':
      return weightKg * reps ** 0.1;
  }
}

/** Il 1RM ha senso solo per esercizi con sovraccarico. */
export function oneRmApplies(kind: ExerciseKind): boolean {
  return kind === 'strength';
}
