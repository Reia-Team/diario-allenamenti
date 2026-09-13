/**
 * Logger minimale: debug/info solo in sviluppo, warning ed errori sempre.
 * Gli ultimi errori restano in memoria e sono visibili in Impostazioni → Diagnostica.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  at: number;
  level: Level;
  scope: string;
  message: string;
  detail?: string;
}

const MAX_ENTRIES = 50;
const entries: LogEntry[] = [];
const isDev = import.meta.env?.DEV === true && import.meta.env?.MODE !== 'test';

function describe(detail: unknown): string | undefined {
  if (detail === undefined) return undefined;
  if (detail instanceof Error) return `${detail.name}: ${detail.message}`;
  try {
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function write(level: Level, scope: string, message: string, detail?: unknown) {
  if (level === 'warn' || level === 'error') {
    entries.push({ at: Date.now(), level, scope, message, detail: describe(detail) });
    if (entries.length > MAX_ENTRIES) entries.shift();
  }
  if (!isDev && (level === 'debug' || level === 'info')) return;
  if (import.meta.env?.MODE === 'test' && level !== 'error') return;
  const fn = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
  fn(`[${scope}] ${message}`, ...(detail === undefined ? [] : [detail]));
}

export const logger = {
  debug: (scope: string, message: string, detail?: unknown) => write('debug', scope, message, detail),
  info: (scope: string, message: string, detail?: unknown) => write('info', scope, message, detail),
  warn: (scope: string, message: string, detail?: unknown) => write('warn', scope, message, detail),
  error: (scope: string, message: string, detail?: unknown) => write('error', scope, message, detail),
  recent: (): LogEntry[] => [...entries].reverse(),
};
