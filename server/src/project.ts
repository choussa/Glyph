/**
 * Projects: durable bundles with the reference app's editable fields.
 *
 * The reference stores a project as a bundle plus a small set of editable
 * properties, and its GraphQL contract names them exactly
 * (`typst-app-auth/export/bundle/graphql-documents.txt`, `EditProject`):
 * `name`, `previewed` (the file the preview shows), and `settings` (a JSON
 * string). This store keeps those three, so a project can be opened, renamed,
 * re-pointed, and re-styled without a second serialisation.
 *
 * Storage is one JSON file per project under a leaf directory, like the share
 * store — a project is "a bundle and a few fields", which does not justify a
 * database for this build. Writes are atomic; reads validate shape so a
 * hand-written or partial file cannot crash a consumer.
 *
 * Ids are readable slugs with a random suffix (`on-attention-3f9a01`), not
 * secrets: a project id is a name in a URL, while a *share* token is the thing
 * that must be unguessable.
 */
import { randomBytes } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic } from './store.ts';
import type { SourceBundle } from './types.ts';

/** `slug-random`, lowercase, no traversal. */
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_NAME = 120;
const DEFAULT_NAME = 'Untitled project';
const MAX_SETTINGS_BYTES = 16 * 1024;
const DEFAULT_ENTRY = '/main.typ';

export class ProjectNotFound extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`project ${id} not found`);
    this.name = 'ProjectNotFound';
    this.id = id;
  }
}

/** A field the caller supplied that cannot be stored as-is. Maps to 400. */
export class ProjectInvalid extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'ProjectInvalid';
    this.field = field;
  }
}

export interface ProjectRecord {
  id: string;
  name: string;
  /** The file the preview shows; `null` means "use the entry". */
  previewed: string | null;
  /** A JSON object, exactly as the reference stores user/project settings. */
  settings: string | null;
  createdAt: string;
  updatedAt: string;
  bundle: SourceBundle;
}

/** What a project looks like in a list, without shipping its sources. */
export interface ProjectSummary {
  id: string;
  name: string;
  entry: string;
  previewed: string | null;
  createdAt: string;
  updatedAt: string;
  files: number;
  assets: number;
}

export interface CreateProjectInput {
  name?: string;
  previewed?: string | null;
  settings?: string | null;
  bundle: SourceBundle;
}

/** Every field is optional; absent fields keep their current value. */
export interface UpdateProjectInput {
  name?: string;
  previewed?: string | null;
  settings?: string | null;
  bundle?: SourceBundle;
}

export class ProjectStore {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const name = normaliseName(input.name);
    const id = await this.uniqueId(name);
    const now = new Date().toISOString();
    const record: ProjectRecord = {
      id,
      name,
      previewed: normalisePreviewed(input.previewed, input.bundle),
      settings: normaliseSettings(input.settings),
      createdAt: now,
      updatedAt: now,
      bundle: input.bundle,
    };
    await writeJsonAtomic(this.dir, `${id}.json`, record);
    return record;
  }

  async get(id: string): Promise<ProjectRecord> {
    if (!ID.test(id)) throw new ProjectNotFound(id);
    const parsed = await readJsonFile(this.dir, `${id}.json`);
    if (!isProjectRecord(parsed, id)) throw new ProjectNotFound(id);
    return parsed;
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectRecord> {
    const current = await this.get(id);
    const bundle = input.bundle ?? current.bundle;
    // An explicit `previewed` is validated against the new bundle. An implicit
    // one is kept only while its file still exists: replacing the sources must
    // not leave a pointer at a file that is gone.
    const previewed =
      input.previewed === undefined
        ? current.previewed !== null && Object.prototype.hasOwnProperty.call(bundle.files, current.previewed)
          ? current.previewed
          : null
        : normalisePreviewed(input.previewed, bundle);
    const next: ProjectRecord = {
      ...current,
      name: input.name === undefined ? current.name : normaliseName(input.name),
      previewed,
      settings: input.settings === undefined ? current.settings : normaliseSettings(input.settings),
      updatedAt: new Date().toISOString(),
      bundle,
    };
    await writeJsonAtomic(this.dir, `${id}.json`, next);
    return next;
  }

  async remove(id: string): Promise<boolean> {
    if (!ID.test(id)) return false;
    try {
      await rm(join(this.dir, `${id}.json`));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  /** Every project, most recently updated first. */
  async list(): Promise<ProjectSummary[]> {
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
          const parsed = await readJsonFile(this.dir, name);
          return isProjectRecord(parsed) ? parsed : null;
        }),
    );

    return records
      .filter((record): record is ProjectRecord => record !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((record) => this.summary(record));
  }

  summary(record: ProjectRecord): ProjectSummary {
    return {
      id: record.id,
      name: record.name,
      entry: record.bundle.entry ?? DEFAULT_ENTRY,
      previewed: record.previewed,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      files: Object.keys(record.bundle.files).length,
      assets: Object.keys(record.bundle.assets ?? {}).length,
    };
  }

  /** A readable, collision-free id: `slug-3f9a01`. */
  private async uniqueId(name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = `${base}-${randomBytes(3).toString('hex')}`;
      if ((await readJsonFile(this.dir, `${candidate}.json`)) === null) return candidate;
    }
    return `${base}-${randomBytes(6).toString('hex')}`;
  }
}

/** A URL- and filename-safe stem, at most 40 characters. */
function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'project';
}

function normaliseName(name: string | undefined): string {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed.slice(0, MAX_NAME) : DEFAULT_NAME;
}

/**
 * `previewed` must name a file that is actually in the bundle; a dangling
 * pointer would make the preview silently fall back to the entry.
 */
function normalisePreviewed(
  previewed: string | null | undefined,
  bundle: SourceBundle,
): string | null {
  if (previewed === null || previewed === undefined || previewed === '') return null;
  if (typeof previewed !== 'string') {
    throw new ProjectInvalid('previewed', '"previewed" must be a file path or null');
  }
  if (!Object.prototype.hasOwnProperty.call(bundle.files, previewed)) {
    throw new ProjectInvalid('previewed', `"previewed" names a file not in the project: ${previewed}`);
  }
  return previewed;
}

/** Settings are an opaque JSON object string, as in the reference contract. */
function normaliseSettings(settings: string | null | undefined): string | null {
  if (settings === null || settings === undefined || settings === '') return null;
  if (typeof settings !== 'string') {
    throw new ProjectInvalid('settings', '"settings" must be a JSON object string');
  }
  if (Buffer.byteLength(settings) > MAX_SETTINGS_BYTES) {
    throw new ProjectInvalid('settings', `"settings" exceeds ${MAX_SETTINGS_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(settings);
  } catch {
    throw new ProjectInvalid('settings', '"settings" is not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProjectInvalid('settings', '"settings" must be a JSON object');
  }
  return JSON.stringify(parsed);
}

/** The shape every read path requires; `id` also pins the filename. */
function isProjectRecord(value: unknown, id?: string): value is ProjectRecord {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Partial<ProjectRecord>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return false;
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return false;
  if (record.previewed !== null && typeof record.previewed !== 'string') return false;
  if (record.settings !== null && typeof record.settings !== 'string') return false;
  if (id !== undefined && record.id !== id) return false;
  const bundle = record.bundle as SourceBundle | undefined;
  return bundle !== null && typeof bundle === 'object' && typeof bundle.files === 'object';
}
