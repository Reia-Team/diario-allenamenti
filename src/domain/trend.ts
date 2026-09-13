export interface TrendPoint {
  /** Coordinata temporale in giorni (o qualunque unità lineare). */
  x: number;
  y: number;
}

export interface Regression {
  slope: number;
  intercept: number;
  r2: number;
}

export function linearRegression(points: TrendPoint[]): Regression | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const { x, y } of points) {
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
  }
  const den = n * sxx - sx * sx;
  if (den === 0) return null; // tutti i punti nello stesso istante
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const ssTot = syy - (sy * sy) / n;
  const ssRes = points.reduce((acc, p) => acc + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

export type TrendStatus = 'positive' | 'stable' | 'negative' | 'insufficient';

/** higher: valori maggiori = miglioramento; neutral: nessun giudizio (es. RPE). */
export type Polarity = 'higher' | 'neutral';

export interface TrendResult {
  status: TrendStatus;
  direction: 'up' | 'flat' | 'down' | null;
  /** Variazione percentuale della retta di tendenza tra inizio e fine periodo. */
  changePct: number | null;
  regression: Regression | null;
  points: number;
}

export interface TrendOptions {
  minPoints?: number;
  stableThresholdPct?: number;
  polarity?: Polarity;
}

export const TREND_MIN_POINTS = 3;
export const TREND_STABLE_THRESHOLD_PCT = 2.5;

/**
 * Trend calcolato con regressione lineare (meno sensibile a una singola sessione anomala
 * rispetto al semplice confronto primo/ultimo valore).
 */
export function computeTrend(points: TrendPoint[], opts: TrendOptions = {}): TrendResult {
  const minPoints = opts.minPoints ?? TREND_MIN_POINTS;
  const threshold = opts.stableThresholdPct ?? TREND_STABLE_THRESHOLD_PCT;
  const polarity = opts.polarity ?? 'higher';
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const base: TrendResult = { status: 'insufficient', direction: null, changePct: null, regression: null, points: clean.length };
  if (clean.length < minPoints) return base;
  const reg = linearRegression(clean);
  if (!reg) return base;

  const xs = clean.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const start = reg.slope * x0 + reg.intercept;
  const end = reg.slope * x1 + reg.intercept;
  const mean = clean.reduce((a, p) => a + p.y, 0) / clean.length;
  const denom = Math.abs(start) > 1e-9 ? Math.abs(start) : Math.abs(mean);
  const changePct = denom > 1e-9 ? ((end - start) / denom) * 100 : 0;

  const direction = Math.abs(changePct) < threshold ? 'flat' : changePct > 0 ? 'up' : 'down';
  let status: TrendStatus = 'stable';
  if (polarity === 'higher') status = direction === 'up' ? 'positive' : direction === 'down' ? 'negative' : 'stable';
  return { status, direction, changePct, regression: reg, points: clean.length };
}

export const TREND_LABEL: Record<TrendStatus, string> = {
  positive: 'Trend positivo',
  stable: 'Trend stabile',
  negative: 'Trend negativo',
  insufficient: 'Dati insufficienti',
};

/** Variazione percentuale semplice; null se il valore iniziale non è utilizzabile. */
export function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}
