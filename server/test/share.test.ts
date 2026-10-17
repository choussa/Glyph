/**
 * Share store tests.
 *
 * The store is the security boundary for read-only links: a token must never
 * address a path outside the store, and the public projection must never carry
 * source text. These cases pin both down.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ShareNotFound, ShareStore } from '../src/share.ts';

const root = await mkdtemp(join(tmpdir(), 'glyph-shares-'));
const store = new ShareStore(root, 'https://glyph.example/');

after(() => rm(root, { recursive: true, force: true }));

const BUNDLE = {
  entry: '/main.typ',
  files: { '/main.typ': '= Hello\n', '/lib.typ': '#let x = 1\n' },
  assets: { '/logo.png': 'iVBORw0KGgo=' },
};

test('creates an unguessable token and persists the bundle', async () => {
  const record = await store.create({ title: '  On   attention  ', bundle: BUNDLE });
  assert.match(record.token, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(record.title, 'On attention');

  // The bytes are on disk, not only in the returned object.
  const raw = JSON.parse(await readFile(join(root, `${record.token}.json`), 'utf8')) as {
    bundle: typeof BUNDLE;
  };
  assert.deepEqual(raw.bundle, BUNDLE);

  const loaded = await store.get(record.token);
  assert.deepEqual(loaded.bundle, BUNDLE);
  assert.equal(loaded.token, record.token);
});

test('defaults the title and truncates an absurd one', async () => {
  const untitled = await store.create({ bundle: BUNDLE });
  assert.equal(untitled.title, 'Shared document');

  const long = await store.create({ title: 'x'.repeat(500), bundle: BUNDLE });
  assert.equal(long.title.length, 200);
});

test('projects metadata without sources, with the canonical read-only URL', async () => {
  const record = await store.create({ title: 'Shared paper', bundle: BUNDLE });
  const summary = store.summary(record);

  assert.equal(summary.url, `https://glyph.example/project/${record.token}`);
  assert.equal(summary.entry, '/main.typ');
  assert.equal(summary.files, 2);
  assert.equal(summary.assets, 1);

  const serialised = JSON.stringify(summary);
  assert.equal(serialised.includes('= Hello'), false, 'summary leaked source text');
  assert.equal(serialised.includes('iVBORw0KGgo='), false, 'summary leaked asset bytes');
});

test('a share with no entry defaults to /main.typ', async () => {
  const withoutEntry = { files: BUNDLE.files, assets: BUNDLE.assets };
  const record = await store.create({ bundle: withoutEntry });
  assert.equal(store.summary(record).entry, '/main.typ');
});

test('rejects malformed tokens without touching the filesystem', async () => {
  for (const token of ['../../etc/passwd', '/etc/passwd', 'short', 'a'.repeat(23), '']) {
    await assert.rejects(store.get(token), ShareNotFound);
    assert.equal(await store.remove(token), false);
  }
});

test('a valid-looking token that does not exist is not found', async () => {
  await assert.rejects(store.get('A'.repeat(22)), ShareNotFound);
});

test('revoking is idempotent', async () => {
  const record = await store.create({ bundle: BUNDLE });
  assert.equal(await store.remove(record.token), true);
  await assert.rejects(store.get(record.token), ShareNotFound);
  assert.equal(await store.remove(record.token), false);
});

test('a corrupt or aliased record is refused', async () => {
  const corrupt = 'A'.repeat(22);
  await writeFile(join(root, `${corrupt}.json`), '{ not json', 'utf8');
  await assert.rejects(store.get(corrupt), ShareNotFound);

  const aliased = 'B'.repeat(22);
  await writeFile(
    join(root, `${aliased}.json`),
    JSON.stringify({ token: 'C'.repeat(22), title: 'x', bundle: BUNDLE }),
    'utf8',
  );
  await assert.rejects(store.get(aliased), ShareNotFound);
});

test('lists every readable share and skips junk', async () => {
  await writeFile(join(root, 'not-a-share.txt'), 'ignored', 'utf8');
  const listed = await store.list();
  assert.ok(listed.length >= 1);
  for (const record of listed) assert.match(record.token, /^[A-Za-z0-9_-]{22}$/);
});

test('builds an ASCII download name', async () => {
  const named = await store.create({ title: 'Résumé / “final”', bundle: BUNDLE });
  assert.equal(store.pdfFilename(named), 'Rsum-final.pdf');

  const empty = await store.create({ title: '日本語', bundle: BUNDLE });
  assert.equal(store.pdfFilename(empty), 'document.pdf');
});

test('an empty directory lists nothing rather than throwing', async () => {
  const empty = new ShareStore(join(root, 'does-not-exist'), 'http://localhost');
  assert.deepEqual(await empty.list(), []);
});
