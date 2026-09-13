/** Formattazione numerica in italiano (virgola decimale). */
export function formatNumber(value: number, maxDecimals = 1): string {
  return value.toLocaleString('it-IT', { maximumFractionDigits: maxDecimals, minimumFractionDigits: 0 });
}

export function formatPct(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${formatNumber(Math.abs(value), decimals)}%`;
}

/** 95 → "1:35"; 3725 → "1:02:05". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** 3725 → "1 h 2 min"; 900 → "15 min"; 45 → "45 s". */
export function formatDuration(totalSec: number | null): string {
  if (totalSec === null || !Number.isFinite(totalSec)) return '—';
  const s = Math.round(totalSec);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Parsing tollerante di input numerici italiani ("72,5"). Stringa vuota → null. */
export function parseDecimal(input: string): number | null {
  const t = input.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
