/**
 * Client minimale per Google Drive REST v3, limitato alla cartella nascosta appDataFolder.
 * `fetch` è iniettabile per i test.
 */

export type DriveErrorKind = 'auth' | 'network' | 'quota' | 'rate_limit' | 'not_found' | 'server' | 'invalid';

export class DriveError extends Error {
  constructor(public kind: DriveErrorKind, message: string) {
    super(message);
    this.name = 'DriveError';
  }
}

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'text' | 'json'>>;

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FIELDS = 'id,name,modifiedTime,size';

export class DriveClient {
  constructor(
    private getToken: () => string | null,
    private fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private onAuthError: () => void = () => {},
  ) {}

  private async request(url: string, init: RequestInit = {}): Promise<Pick<Response, 'ok' | 'status' | 'text' | 'json'>> {
    const token = this.getToken();
    if (!token) throw new DriveError('auth', 'Accesso a Google Drive scaduto: tocca «Connetti» per autorizzare di nuovo.');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new DriveError('network', 'Sei offline: i dati restano salvati sul telefono e verranno sincronizzati più tardi.');
    }
    let res: Pick<Response, 'ok' | 'status' | 'text' | 'json'>;
    try {
      res = await this.fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
    } catch {
      throw new DriveError('network', 'Connessione a Google Drive non riuscita. Riprova quando la rete è stabile.');
    }
    if (res.ok) return res;
    const body = await res.text().catch(() => '');
    if (res.status === 401) {
      this.onAuthError();
      throw new DriveError('auth', 'Accesso a Google Drive scaduto: tocca «Connetti» per autorizzare di nuovo.');
    }
    if (res.status === 403 && /storageQuotaExceeded|quotaExceeded/.test(body)) {
      throw new DriveError('quota', 'Spazio su Google Drive esaurito.');
    }
    if (res.status === 403 || res.status === 429) {
      if (/rateLimit|userRateLimit|429/.test(body) || res.status === 429) throw new DriveError('rate_limit', 'Troppe richieste a Google Drive: riprova tra qualche minuto.');
      throw new DriveError('auth', 'Permesso negato da Google Drive. Disconnetti e autorizza di nuovo l’app.');
    }
    if (res.status === 404) throw new DriveError('not_found', 'File non trovato su Google Drive.');
    throw new DriveError('server', `Google Drive non disponibile (errore ${res.status}). Riprova più tardi.`);
  }

  async listFiles(): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: `files(${FIELDS})`,
      orderBy: 'modifiedTime desc',
      pageSize: '200',
    });
    const res = await this.request(`${API}/files?${params}`);
    const json = (await res.json()) as { files?: DriveFile[] };
    return json.files ?? [];
  }

  async findByName(name: string): Promise<DriveFile | null> {
    return (await this.listFiles()).find((f) => f.name === name) ?? null;
  }

  async download(id: string): Promise<string> {
    const res = await this.request(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    return res.text();
  }

  async create(name: string, content: string): Promise<DriveFile> {
    const boundary = `diario-${Math.random().toString(36).slice(2)}`;
    const metadata = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const res = await this.request(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return (await res.json()) as DriveFile;
  }

  async update(id: string, content: string): Promise<DriveFile> {
    const res = await this.request(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
    return (await res.json()) as DriveFile;
  }

  async remove(id: string): Promise<void> {
    await this.request(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async accountEmail(): Promise<string | null> {
    const res = await this.request(`${API}/about?fields=user(emailAddress)`);
    const json = (await res.json()) as { user?: { emailAddress?: string } };
    return json.user?.emailAddress ?? null;
  }
}
