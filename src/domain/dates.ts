import type { ISODate } from './types';

const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Data locale (non UTC) in formato yyyy-mm-dd. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function utcMs(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): ISODate {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Mezzanotte locale della data indicata. */
export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Aritmetica sulle date di calendario, immune al cambio ora legale. */
export function addDays(iso: ISODate, days: number): ISODate {
  return fromUtcMs(utcMs(iso) + days * DAY_MS);
}

/** Giorni di calendario da `a` a `b` (positivo se b è successivo). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}

/** 0 = domenica … 6 = sabato. */
export function weekday(iso: ISODate): number {
  return new Date(utcMs(iso)).getUTCDay();
}

/** Lunedì della settimana che contiene la data. */
export function startOfWeek(iso: ISODate): ISODate {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDay))}`;
}

export function* eachDay(from: ISODate, to: ISODate): Generator<ISODate> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

export function isoToEpochDay(iso: ISODate): number {
  return utcMs(iso) / DAY_MS;
}

/** Timestamp (ms) di mezzogiorno UTC: usato come coordinata X stabile nei grafici. */
export function isoToChartTime(iso: ISODate): number {
  return utcMs(iso) + DAY_MS / 2;
}

export function chartTimeToISO(ms: number): ISODate {
  return fromUtcMs(Math.floor(ms / DAY_MS) * DAY_MS);
}

export const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
export const WEEKDAY_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
export const MONTH_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MONTH_LONG = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/** 13/09/2026 */
export function formatDateIt(iso: ISODate): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** 13/09 */
export function formatDateShort(iso: ISODate): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** lun 13 set 2026 */
export function formatDateLong(iso: ISODate, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAY_SHORT[weekday(iso)]} ${d} ${MONTH_SHORT[m - 1]}${withYear ? ` ${y}` : ''}`;
}

export function relativeDayLabel(iso: ISODate, today: ISODate): string {
  const diff = diffDays(today, iso);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Domani';
  if (diff === -1) return 'Ieri';
  return formatDateLong(iso);
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
