import type { SyncMeta } from '../../domain/types';

export function isAlive<T extends SyncMeta>(r: T | undefined | null): r is T {
  return !!r && r.deletedAt === null;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} non trovato`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function requireAlive<T extends SyncMeta>(r: T | undefined, what: string): T {
  if (!isAlive(r)) throw new NotFoundError(what);
  return r;
}
