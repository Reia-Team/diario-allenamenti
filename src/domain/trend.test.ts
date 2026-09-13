import { describe, expect, it } from 'vitest';
import { computeTrend, linearRegression, pctChange } from './trend';

describe('regressione lineare', () => {
  it('retta esatta', () => {
    const r = linearRegression([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])!;
    expect(r.slope).toBeCloseTo(2);
    expect(r.intercept).toBeCloseTo(1);
    expect(r.r2).toBeCloseTo(1);
  });
  it('punti con stessa x → null', () => {
    expect(linearRegression([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toBeNull();
  });
});

describe('trend', () => {
  it('positivo', () => {
    const t = computeTrend([{ x: 0, y: 50 }, { x: 7, y: 55 }, { x: 14, y: 60 }, { x: 21, y: 70 }]);
    expect(t.status).toBe('positive');
    expect(t.changePct!).toBeGreaterThan(30);
  });
  it('stabile entro la soglia', () => {
    const t = computeTrend([{ x: 0, y: 70 }, { x: 7, y: 71 }, { x: 14, y: 70 }, { x: 21, y: 70.5 }]);
    expect(t.status).toBe('stable');
    expect(t.direction).toBe('flat');
  });
  it('negativo', () => {
    const t = computeTrend([{ x: 0, y: 70 }, { x: 7, y: 65 }, { x: 14, y: 60 }]);
    expect(t.status).toBe('negative');
    expect(t.changePct!).toBeLessThan(0);
  });
  it('dati insufficienti', () => {
    expect(computeTrend([]).status).toBe('insufficient');
    expect(computeTrend([{ x: 0, y: 1 }, { x: 1, y: 2 }]).status).toBe('insufficient');
  });
  it('polarità neutra: direzione senza giudizio', () => {
    const t = computeTrend([{ x: 0, y: 6 }, { x: 7, y: 7 }, { x: 14, y: 8 }], { polarity: 'neutral' });
    expect(t.status).toBe('stable');
    expect(t.direction).toBe('up');
  });
  it('variazione percentuale semplice', () => {
    expect(pctChange(50, 70)).toBeCloseTo(40);
    expect(pctChange(0, 70)).toBeNull();
    expect(pctChange(null, 70)).toBeNull();
  });
});
