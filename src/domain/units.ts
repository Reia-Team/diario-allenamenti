import type { WeightUnit } from './types';
import { formatNumber, round } from './format';

export const LB_PER_KG = 2.2046226218;

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? round(kg, 2) : round(kg * LB_PER_KG, 1);
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : round(value / LB_PER_KG, 3);
}

export function formatWeight(kg: number | null, unit: WeightUnit, withUnit = true): string {
  if (kg === null) return '—';
  const v = formatNumber(kgToUnit(kg, unit), 2);
  return withUnit ? `${v} ${unit}` : v;
}

/** Volume: nessun decimale, separatore migliaia. */
export function formatVolume(kg: number | null, unit: WeightUnit): string {
  if (kg === null) return '—';
  return `${formatNumber(kgToUnit(kg, unit), 0)} ${unit}`;
}
