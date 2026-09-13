import { describe, expect, it } from 'vitest';
import { estimateOneRm, oneRmApplies } from './oneRm';

describe('1RM stimato', () => {
  it('Epley', () => {
    expect(estimateOneRm(100, 5, 'epley')).toBeCloseTo(116.667, 2);
    expect(estimateOneRm(70, 10, 'epley')).toBeCloseTo(93.333, 2);
  });
  it('Brzycki', () => {
    expect(estimateOneRm(100, 5, 'brzycki')).toBeCloseTo(112.5, 5);
  });
  it('Lombardi', () => {
    expect(estimateOneRm(100, 5, 'lombardi')).toBeCloseTo(100 * 5 ** 0.1, 5);
  });
  it('1 ripetizione = carico', () => {
    expect(estimateOneRm(120, 1, 'brzycki')).toBe(120);
  });
  it('non calcolato quando non ha senso', () => {
    expect(estimateOneRm(null, 5, 'epley')).toBeNull();
    expect(estimateOneRm(50, null, 'epley')).toBeNull();
    expect(estimateOneRm(50, 0, 'epley')).toBeNull();
    expect(estimateOneRm(50, 13, 'epley')).toBeNull();
    expect(estimateOneRm(0, 5, 'epley')).toBeNull();
  });
  it('si applica solo agli esercizi con sovraccarico', () => {
    expect(oneRmApplies('strength')).toBe(true);
    expect(oneRmApplies('bodyweight')).toBe(false);
    expect(oneRmApplies('cardio')).toBe(false);
  });
});
