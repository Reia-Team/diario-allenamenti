import type { ExerciseKind, ISODate, OneRmFormula, SetRecord, WeightUnit } from './types';
import { estimateOneRm } from './oneRm';
import { formatNumber, formatDuration } from './format';
import { formatWeight } from './units';

export type SetLike = Pick<
  SetRecord,
  | 'setNumber'
  | 'weightKg'
  | 'reps'
  | 'durationSec'
  | 'distanceKm'
  | 'speedKmh'
  | 'inclinePct'
  | 'level'
  | 'calories'
  | 'rpe'
  | 'rir'
  | 'restSec'
  | 'completed'
  | 'excludedFromStats'
>;

/** Solo le serie realmente registrate e non escluse entrano nelle statistiche. */
export function countsForStats(s: Pick<SetLike, 'completed' | 'excludedFromStats'>): boolean {
  return s.completed && !s.excludedFromStats;
}

/** Volume della singola serie: carico × ripetizioni; null se uno dei due manca. */
export function setVolume(s: Pick<SetLike, 'weightKg' | 'reps'>): number | null {
  if (s.weightKg === null || s.reps === null) return null;
  return s.weightKg * s.reps;
}

/** Somma dei volumi delle serie valide; null se nessuna serie ha carico e ripetizioni. */
export function totalVolume(sets: SetLike[]): number | null {
  let sum = 0;
  let any = false;
  for (const s of sets) {
    if (!countsForStats(s)) continue;
    const v = setVolume(s);
    if (v === null) continue;
    sum += v;
    any = true;
  }
  return any ? sum : null;
}

/** Carico più usato tra le serie valide (a parità, il maggiore). */
export function referenceWeight(sets: SetLike[]): number | null {
  const counts = new Map<number, number>();
  for (const s of sets) {
    if (!countsForStats(s) || s.weightKg === null) continue;
    counts.set(s.weightKg, (counts.get(s.weightKg) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [w, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== null && w > best)) {
      best = w;
      bestCount = c;
    }
  }
  return best;
}

export interface ExerciseSessionMetrics {
  sessionId: string;
  date: ISODate;
  startedAt: number;
  setsCompleted: number;
  topWeightKg: number | null;
  refWeightKg: number | null;
  totalReps: number | null;
  maxReps: number | null;
  volumeKg: number | null;
  e1rmKg: number | null;
  avgRpe: number | null;
  avgRir: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  avgSpeedKmh: number | null;
  calories: number | null;
}

function sumOrNull(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}

function avgOrNull(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function maxOrNull(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
}

export function computeSessionMetrics(
  meta: { sessionId: string; date: ISODate; startedAt: number },
  sets: SetLike[],
  formula: OneRmFormula,
): ExerciseSessionMetrics {
  const valid = sets.filter(countsForStats);
  const durationSec = sumOrNull(valid.map((s) => s.durationSec));
  const distanceKm = sumOrNull(valid.map((s) => s.distanceKm));
  let avgSpeedKmh = avgOrNull(valid.map((s) => s.speedKmh));
  if (avgSpeedKmh === null && durationSec && distanceKm !== null) avgSpeedKmh = distanceKm / (durationSec / 3600);
  return {
    ...meta,
    setsCompleted: valid.length,
    topWeightKg: maxOrNull(valid.map((s) => (s.reps !== null && s.reps > 0 ? s.weightKg : null))),
    refWeightKg: referenceWeight(valid),
    totalReps: sumOrNull(valid.map((s) => s.reps)),
    maxReps: maxOrNull(valid.map((s) => s.reps)),
    volumeKg: totalVolume(valid),
    e1rmKg: maxOrNull(valid.map((s) => estimateOneRm(s.weightKg, s.reps, formula))),
    avgRpe: avgOrNull(valid.map((s) => s.rpe)),
    avgRir: avgOrNull(valid.map((s) => s.rir)),
    durationSec,
    distanceKm,
    avgSpeedKmh,
    calories: sumOrNull(valid.map((s) => s.calories)),
  };
}

/**
 * Riepilogo leggibile di una prestazione:
 * - "70 kg × 10 / 10 / 9 / 8"
 * - "70 kg × 10 · 72,5 kg × 8" se i carichi differiscono
 * - "12 / 12 / 10 rip." per il corpo libero
 * - "15 min · 2,1 km · 8,4 km/h" per il cardio
 */
export function formatPerformance(sets: SetLike[], kind: ExerciseKind, unit: WeightUnit): string {
  const valid = sets.filter(countsForStats).sort((a, b) => a.setNumber - b.setNumber);
  if (!valid.length) return 'Nessuna serie registrata';

  if (kind === 'cardio') {
    const parts: string[] = [];
    const dur = sumOrNull(valid.map((s) => s.durationSec));
    const dist = sumOrNull(valid.map((s) => s.distanceKm));
    const speed = avgOrNull(valid.map((s) => s.speedKmh));
    const incline = avgOrNull(valid.map((s) => s.inclinePct));
    const level = avgOrNull(valid.map((s) => s.level));
    const cal = sumOrNull(valid.map((s) => s.calories));
    if (dur !== null) parts.push(formatDuration(dur));
    if (dist !== null) parts.push(`${formatNumber(dist, 2)} km`);
    if (speed !== null) parts.push(`${formatNumber(speed, 1)} km/h`);
    if (incline !== null) parts.push(`incl. ${formatNumber(incline, 1)}%`);
    if (level !== null) parts.push(`livello ${formatNumber(level, 0)}`);
    if (cal !== null) parts.push(`${formatNumber(cal, 0)} kcal`);
    return parts.length ? parts.join(' · ') : 'Completato';
  }

  const weights = new Set(valid.map((s) => s.weightKg));
  const repsText = (s: SetLike) => (s.reps === null ? '?' : String(s.reps));
  if (weights.size === 1) {
    const [w] = weights;
    const reps = valid.map(repsText).join(' / ');
    return w === null ? `${reps} rip.` : `${formatWeight(w, unit)} × ${reps}`;
  }
  return valid
    .map((s) => (s.weightKg === null ? `${repsText(s)} rip.` : `${formatWeight(s.weightKg, unit)} × ${repsText(s)}`))
    .join(' · ');
}
