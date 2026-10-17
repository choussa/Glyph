import { describe, expect, it } from 'vitest';
import {
  basename,
  buildMatcher,
  buildTree,
  countWords,
  dirname,
  extensionOf,
  extractOutline,
  findMatches,
  flattenTree,
  formatBytes,
  isInside,
  isTextPath,
  normalizePath,
  replaceAll,
  replaceOne,
  uniquePath,
} from './model';

describe('paths', () => {
  it('normalises every spelling to a rooted, slash-collapsed path', () => {
    expect(normalizePath('/a//b.typ')).toBe('/a/b.typ');
    expect(normalizePath('a/b.typ')).toBe('/a/b.typ');
    expect(normalizePath('./a/b.typ')).toBe('/a/b.typ');
    expect(normalizePath('/a/./b.typ')).toBe('/a/b.typ');
    expect(normalizePath('/a/b/')).toBe('/a/b');
    expect(normalizePath('')).toBe('/');
  });

  it('splits a path into name and directory', () => {
    expect(basename('/a/b.typ')).toBe('b.typ');
    expect(basename('/b.typ')).toBe('b.typ');
    expect(dirname('/a/b.typ')).toBe('/a');
    expect(dirname('/b.typ')).toBe('/');
  });

  it('reads the extension case-insensitively, and never for a dotless name', () => {
    expect(extensionOf('/a/b.TYP')).toBe('typ');
    expect(extensionOf('/a/b')).toBe('');
    expect(extensionOf('/a/.hidden')).toBe('');
  });

  it('knows which extensions the engine treats as text', () => {
    expect(isTextPath('/a/b.typ')).toBe(true);
    expect(isTextPath('/a/b.bib')).toBe(true);
    expect(isTextPath('/a/b.png')).toBe(false);
    expect(isTextPath('/a/b.pdf')).toBe(false);
  });

  it('tests containment on path segments, not raw prefixes', () => {
    expect(isInside('/a/b/c.typ', '/a/b')).toBe(true);
    expect(isInside('/a/b/c.typ', '/a')).toBe(true);
    expect(isInside('/a/bc/c.typ', '/a/b')).toBe(false);
    expect(isInside('/anything', '/')).toBe(true);
  });

  it('de-duplicates a path with a numeric suffix that keeps the extension', () => {
    expect(uniquePath('/notes.typ', ['/notes.typ'])).toBe('/notes-2.typ');
    expect(uniquePath('/notes.typ', ['/notes.typ', '/notes-2.typ'])).toBe('/notes-3.typ');
    expect(uniquePath('/a/notes.typ', ['/b/notes.typ'])).toBe('/a/notes.typ');
  });
});

describe('buildTree', () => {
  it('sorts folders before files at every level, case-insensitively', () => {
    const tree = buildTree(
      [
        { path: '/zebra.typ', binary: false },
        { path: '/alpha.typ', binary: false },
        { path: '/docs/beta.typ', binary: false },
      ],
      ['/docs'],
    );
    expect(tree.map((node) => node.path)).toEqual(['/docs', '/alpha.typ', '/zebra.typ']);
    const docs = tree[0];
    expect(docs.kind).toBe('folder');
  });

  it('creates implied folders from file paths and marks binaries', () => {
    const tree = buildTree([{ path: '/assets/logo.png', binary: true }], []);
    expect(tree).toHaveLength(1);
    const assets = tree[0];
    expect(assets.kind).toBe('folder');
    if (assets.kind !== 'folder') throw new Error('expected a folder');
    expect(assets.children[0]).toMatchObject({ kind: 'file', binary: true, name: 'logo.png' });
  });

  it('flattens depth-first', () => {
    const tree = buildTree(
      [{ path: '/docs/a.typ', binary: false }, { path: '/b.typ', binary: false }],
      [],
    );
    expect(flattenTree(tree)).toEqual(['/docs/a.typ', '/b.typ']);
  });
});

describe('extractOutline', () => {
  it('reads heading levels, titles, lines and offsets', () => {
    const text = '= One\n\nsome text\n== Two\n';
    expect(extractOutline(text)).toEqual([
      { level: 1, title: 'One', line: 1, from: 0, to: 5 },
      { level: 2, title: 'Two', line: 4, from: 17, to: 23 },
    ]);
  });

  it('skips headings inside fenced code blocks', () => {
    const text = '= Real\n```\n= Not a heading\n```\n= Also real\n';
    const titles = extractOutline(text).map((entry) => entry.title);
    expect(titles).toEqual(['Real', 'Also real']);
  });

  it('ignores a marker with no title', () => {
    expect(extractOutline('=\n==  \n')).toEqual([]);
  });
});

describe('search', () => {
  it('finds matches across lines with 1-based line/column and a line preview', () => {
    const text = 'alpha\nbeta alpha';
    const matcher = buildMatcher('alpha', { caseSensitive: false, regex: false, wholeWord: true })!;
    const matches = findMatches('/a.typ', text, matcher);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ line: 1, column: 1, from: 0, to: 5, preview: 'alpha' });
    expect(matches[1]).toMatchObject({
      line: 2,
      column: 6,
      from: 11,
      to: 16,
      preview: 'beta alpha',
      previewFrom: 5,
      previewTo: 10,
    });
  });

  it('honours case sensitivity and whole-word matching', () => {
    const text = 'Cat cat catalog CAT';
    const sensitive = buildMatcher('cat', { caseSensitive: true, regex: false, wholeWord: false })!;
    // Lowercase only: the standalone `cat` and the prefix of `catalog`.
    expect(findMatches('/a.typ', text, sensitive)).toHaveLength(2);
    const whole = buildMatcher('cat', { caseSensitive: false, regex: false, wholeWord: true })!;
    // Case-insensitive and whole-word: every `cat`/`Cat`/`CAT` but not `catalog`.
    expect(findMatches('/a.typ', text, whole)).toHaveLength(3);
  });

  it('never loops forever on a zero-width regex', () => {
    const matcher = buildMatcher('a*', { caseSensitive: true, regex: true, wholeWord: false })!;
    expect(findMatches('/a.typ', 'bbb', matcher)).toHaveLength(0);
  });

  it('returns null for an invalid pattern rather than throwing', () => {
    expect(buildMatcher('(', { caseSensitive: false, regex: true, wholeWord: false })).toBeNull();
  });

  it('supports $1 group references in replaceAll and counts replacements', () => {
    const matcher = buildMatcher('(\\w)(\\d)', { caseSensitive: true, regex: true, wholeWord: false })!;
    expect(replaceAll('a1 b2 c3', matcher, '$2$1')).toEqual({ text: '1a 2b 3c', count: 3 });
  });

  it('replaces only the ordinal-th match for replaceOne', () => {
    const matcher = buildMatcher('x', { caseSensitive: true, regex: false, wholeWord: false })!;
    expect(replaceOne('x x x', matcher, 1, 'y')).toBe('x y x');
    expect(replaceOne('x x x', matcher, 5, 'y')).toBe('x x x');
  });
});

describe('utilities', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('counts words as runs of non-whitespace', () => {
    expect(countWords('  one two\tthree\n')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});
