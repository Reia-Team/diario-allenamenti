import type { ExerciseKind, SessionExerciseStatus, SetRecord, WeightUnit } from '../domain/types';
import { formatClock, formatDuration, formatNumber } from '../domain/format';
import { formatWeight } from '../domain/units';
import { formatPerformance } from '../domain/metrics';

export function repsText(repsMin: number | null, repsMax: number | null): string | null {
  if (repsMin === null && repsMax === null) return null;
  if (repsMin === null || repsMax === null || repsMin === repsMax) return String(repsMax ?? repsMin);
  return `${repsMin}–${repsMax}`;
}

export function targetText(t: {
  kind: ExerciseKind;
  targetSets: number;
  repsMin: number | null;
  repsMax: number | null;
  targetDurationSec: number | null;
}): string {
  if (t.kind === 'cardio') {
    return t.targetDurationSec ? formatDuration(t.targetDurationSec) : `${t.targetSets} ${t.targetSets === 1 ? 'blocco' : 'blocchi'}`;
  }
  const reps = repsText(t.repsMin, t.repsMax);
  const base = reps ? `${t.targetSets} × ${reps}` : `${t.targetSets} serie`;
  return t.targetDurationSec ? `${base} · ${formatDuration(t.targetDurationSec)}` : base;
}

export function restText(sec: number | null): string {
  if (sec === null) return '—';
  return sec < 120 ? `${sec} s` : formatClock(sec);
}

export function setValueText(set: SetRecord, kind: ExerciseKind, unit: WeightUnit): string {
  if (!set.completed) return 'non registrata';
  if (kind === 'cardio') return formatPerformance([set], 'cardio', unit);
  const reps = set.reps === null ? '?' : set.reps;
  return set.weightKg === null ? `${reps} rip.` : `${formatWeight(set.weightKg, unit)} × ${reps}`;
}

export const STATUS_CLASS: Record<SessionExerciseStatus, string> = {
  completed: 'good',
  partial: 'warn',
  skipped: '',
  pending: 'accent',
};

export function optionalNumber(v: number | null, decimals = 1): string {
  return v === null ? '—' : formatNumber(v, decimals);
}
