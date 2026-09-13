import type { ValueKind } from '../domain/analysis';
import type { WeightUnit } from '../domain/types';
import { formatDuration, formatNumber } from '../domain/format';
import { formatVolume, formatWeight, kgToUnit } from '../domain/units';

export function formatValue(kind: ValueKind, v: number | null, unit: WeightUnit): string {
  if (v === null || !Number.isFinite(v)) return '—';
  switch (kind) {
    case 'weight': return formatWeight(v, unit);
    case 'volume': return formatVolume(v, unit);
    case 'reps': return formatNumber(v, 1);
    case 'score': return formatNumber(v, 1);
    case 'duration': return formatDuration(v);
    case 'distance': return `${formatNumber(v, 2)} km`;
    case 'speed': return `${formatNumber(v, 1)} km/h`;
    case 'calories': return `${formatNumber(v, 0)} kcal`;
    case 'count': return formatNumber(v, 0);
  }
}

/** Valore nell'unità mostrata nel grafico (kg → lb se richiesto, secondi → minuti). */
export function toChartValue(kind: ValueKind, v: number | null, unit: WeightUnit): number | null {
  if (v === null) return null;
  if (kind === 'weight' || kind === 'volume') return kgToUnit(v, unit);
  if (kind === 'duration') return Math.round((v / 60) * 10) / 10;
  return v;
}

export function chartUnitLabel(kind: ValueKind, unit: WeightUnit): string {
  switch (kind) {
    case 'weight':
    case 'volume': return unit;
    case 'duration': return 'min';
    case 'distance': return 'km';
    case 'speed': return 'km/h';
    case 'calories': return 'kcal';
    case 'reps': return 'rip.';
    default: return '';
  }
}
