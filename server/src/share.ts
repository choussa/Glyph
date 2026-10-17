/**
 * Share links: the durable, read-only half of a project.
 *
 * A Typst share link is a token, not a copy of the document: the server keeps
 * the source bundle and renders from it, so the reader always sees current
 * pages without receiving an editable file. glyph stores one JSON file per
 * token under a leaf directory — a share's whole job is "serve these bytes",
 * which does not justify a database for this build.
 *
 * Security model:
 *
 * - A token is 128 bits from `crypto.randomBytes`, base64url-encoded (22 chars).
 *   Guessing one is not a threat model; leaking the list is.
 * - The token is validated against the exact alphabet *before* it reaches the
 *   filesystem, so `../` and absolute paths cannot escape the store directory.
 * - The HTTP surface exposes metadata only. Sources never leave the server;
 *   the reader gets rendered pages, which is what the reference app shows.
 * - `list()` exists for tests and administration; it is deliberately not routed.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceBundle } from './types.ts';

/** 16 random bytes, base64url: the exact shape every route accepts. */
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const MAX_TITLE = 200;
const DEFAULT_TITLE = 'Shared document';
const DEFAULT_ENTRY = '/main.typ';

export class ShareNotFound extends Error {
  readonly token: string;

  constructor(token: string) {
    super(`share ${token} not found`);
    this.name = 'ShareNotFound';
    this.token = token;
  }
}

export interface ShareRecord {
  token: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  bundle: SourceBundle;
}

/** What a client may know about a share without being able to edit it. */
export interface ShareSummary {
  token: string;
  title: string;
  /** The canonical read-only URL (`/project/:token`, as in the reference app). */
  url: string;
  entry: string;
  createdAt: string;
  updatedAt: string;
  files: number;
  assets: number;
}

export interface CreateShareInput {
  title?: string;
  bundle: SourceBundle;
}

/**
 * A directory-backed share store.
 *
 * Writes go to a temp file and are renamed into place: a crash mid-write leaves
 * the previous share intact rather than a truncated JSON file.
 */
export class ShareStore {
  readonly dir: string;
  readonly appUrl: string;

  constructor(dir: string, appUrl: string) {
    this.dir = dir;
    this.appUrl = appUrl;
  }

  async create(input: CreateShareInput): Promise<ShareRecord> {
    const now = new Date().toISOString();
    const record: ShareRecord = {
      token: randomBytes(16).toString('base64url'),
      title: normaliseTitle(input.title),
      createdAt: now,
      updatedAt: now,
      bundle: input.bundle,
    };

    await mkdir(this.dir, { recursive: true });
    const target = this.path(record.token);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(record), 'utf8');
    await rename(temp, target);
    return record;
  }

  /** Read a share, or throw {@link ShareNotFound} for a bad token or missing file. */
  async get(token: string): Promise<ShareRecord> {
    if (!TOKEN.test(token)) throw new ShareNotFound(token);
    try {
      const raw = await readFile(this.path(token), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      // The filename is the authority: a record that disagrees was tampered with
      // or copied, and serving it would let a token alias another document.
      if (!isShareRecord(parsed, token)) throw new ShareNotFound(token);
      return parsed;
    } catch (error) {
      if (error instanceof ShareNotFound) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || error instanceof SyntaxError) throw new ShareNotFound(token);
      throw error;
    }
  }

  /** Revoke a share. Returns false when it was already gone. */
  async remove(token: string): Promise<boolean> {
    if (!TOKEN.test(token)) return false;
    try {
      await rm(this.path(token));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  /** Every share, newest first. Not routed; for tests and administration. */
  async list(): Promise<ShareRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const records = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          try {
            const parsed: unknown = JSON.parse(await readFile(join(this.dir, name), 'utf8'));
            return isShareRecord(parsed) ? parsed : null;
          } catch {
            return null;
          }
        }),
    );

    return records
      .filter((record): record is ShareRecord => record !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** The public projection of a record. */
  summary(record: ShareRecord): ShareSummary {
    return {
      token: record.token,
      title: record.title,
      url: `${this.appUrl.replace(/\/+$/, '')}/project/${record.token}`,
      entry: record.bundle.entry ?? DEFAULT_ENTRY,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      files: Object.keys(record.bundle.files).length,
      assets: Object.keys(record.bundle.assets ?? {}).length,
    };
  }

  /**
   * A safe download name derived from the title.
   *
   * ASCII only: the value goes into a `Content-Disposition` header, which is
   * byte-oriented. A title in another script falls back to `document.pdf` rather
   * than emitting a header clients disagree about.
   */
  pdfFilename(record: ShareRecord): string {
    const stem = record.title
      .replace(/[^A-Za-z0-9._ -]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80);
    return `${stem || 'document'}.pdf`;
  }

  private path(token: string): string {
    return join(this.dir, `${token}.json`);
  }
}

/**
 * The shape every read path requires.
 *
 * `token` pins the filename to the record, and the string fields keep a
 * hand-written or legacy file from crashing `title`/`createdAt` consumers.
 */
function isShareRecord(value: unknown, token?: string): value is ShareRecord {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Partial<ShareRecord>;
  if (typeof record.token !== 'string' || typeof record.title !== 'string') return false;
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return false;
  if (token !== undefined && record.token !== token) return false;
  const bundle = record.bundle as SourceBundle | undefined;
  return bundle !== null && typeof bundle === 'object' && typeof bundle.files === 'object';
}

/** Collapse whitespace and fall back to a readable default. */
function normaliseTitle(title: string | undefined): string {
  const trimmed = (title ?? '').trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed.slice(0, MAX_TITLE) : DEFAULT_TITLE;
}
