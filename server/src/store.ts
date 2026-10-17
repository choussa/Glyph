/**
 * Small filesystem helpers for the directory-backed stores.
 *
 * Both the share and project stores keep one JSON file per entity, so the two
 * things that must never drift — "write it atomically" and "read it without
 * letting a corrupt file crash a request" — live here once.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Write `value` as JSON to `dir/name`, atomically.
 *
 * The bytes land in a temp file that is renamed into place, so a crash or a
 * concurrent read never observes a half-written record.
 */
export async function writeJsonAtomic(dir: string, name: string, value: unknown): Promise<void> {
  await mkdir(dir, { recursive: true });
  const target = join(dir, name);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(value), 'utf8');
  await rename(temp, target);
}

/**
 * Read and parse `dir/name`.
 *
 * Returns `null` when the file is missing (including its directory) or does not
 * parse — both mean "there is no usable record here". Any other error (a
 * permission problem, a full disk) is rethrown: a broken store should not look
 * like an empty one.
 */
export async function readJsonFile(dir: string, name: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(join(dir, name), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
