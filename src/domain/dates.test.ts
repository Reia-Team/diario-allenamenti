import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, diffDays, eachDay, formatDateIt, formatDateLong, isValidISODate, startOfWeek, toISODate, weekday,
} from './dates';

describe('dates', () => {
  it('formatta date locali senza spostamenti di fuso', () => {
    expect(toISODate(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
    expect(toISODate(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('addDays è corretto attraverso il cambio ora legale e fine anno', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('diffDays e weekday', () => {
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
    expect(diffDays('2026-09-16', '2026-09-14')).toBe(-2);
    expect(weekday('2026-09-13')).toBe(0); // domenica
    expect(weekday('2026-09-14')).toBe(1); // lunedì
  });

  it('startOfWeek restituisce il lunedì', () => {
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07');
    expect(startOfWeek('2026-09-14')).toBe('2026-09-14');
    expect(startOfWeek('2026-09-18')).toBe('2026-09-14');
  });

  it('addMonths gestisce la fine del mese', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('eachDay è inclusivo', () => {
    expect([...eachDay('2026-09-14', '2026-09-16')]).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
  });

  it('valida e formatta', () => {
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('13/09/2026')).toBe(false);
    expect(formatDateIt('2026-09-13')).toBe('13/09/2026');
    expect(formatDateLong('2026-09-14')).toBe('lun 14 set');
  });
});
