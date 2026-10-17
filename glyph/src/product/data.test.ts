import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED_PROJECTS,
  createProject,
  findProject,
  findProjectOrNull,
  isShareToken,
} from './data';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('isShareToken', () => {
  it('accepts the 22-char base64url shape the server mints', () => {
    expect(isShareToken('8oQ2rP0kLm3nXyZa1BcD-_')).toBe(true);
    expect(isShareToken('A'.repeat(22))).toBe(true);
  });

  it('never mistakes a local project id for a token', () => {
    for (const project of SEED_PROJECTS) expect(isShareToken(project.id)).toBe(false);
    expect(isShareToken(createProject('Draft', 'paper').id)).toBe(false);
  });

  it('rejects wrong lengths and path characters', () => {
    expect(isShareToken('A'.repeat(21))).toBe(false);
    expect(isShareToken('A'.repeat(23))).toBe(false);
    expect(isShareToken('../../etc/passwd')).toBe(false);
    expect(isShareToken('')).toBe(false);
  });
});

describe('project lookup', () => {
  it('finds a seed project by id', () => {
    expect(findProjectOrNull('attention')?.title).toBe('On the shape of attention');
  });

  it('returns null for an unknown id but keeps the lenient filename fallback', () => {
    expect(findProjectOrNull('not-a-project')).toBeNull();
    expect(findProject('not-a-project').title).toBe('Untitled document');
  });

  it('finds a project created in this browser', () => {
    const created = createProject('Fresh draft', 'report');
    expect(findProjectOrNull(created.id)?.title).toBe('Fresh draft');
  });
});
