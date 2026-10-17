/**
 * Project store tests.
 *
 * A project is a bundle plus the reference app's editable fields (`name`,
 * `previewed`, `settings`), so these cases pin the two things that make it
 * durable and safe: readable ids that cannot address a path outside the store,
 * and field validation that refuses a dangling `previewed` pointer or a bogus
 * settings blob instead of storing it.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ProjectInvalid, ProjectNotFound, ProjectStore } from '../src/project.ts';

const root = await mkdtemp(join(tmpdir(), 'glyph-projects-'));
const store = new ProjectStore(root);

after(() => rm(root, { recursive: true, force: true }));

const BUNDLE = {
  entry: '/main.typ',
  files: { '/main.typ': '= Hello\n', '/chapter.typ': '= Chapter\n' },
};

test('creates a readable, collision-free id and persists the bundle', async () => {
  const record = await store.create({ name: 'On the shape of attention', bundle: BUNDLE });
  assert.match(record.id, /^[a-z0-9][a-z0-9-]{0,63}$/);
  assert.match(record.id, /^on-the-shape-of-attention-[0-9a-f]{6}$/);
  assert.equal(record.previewed, null);
  assert.equal(record.settings, null);

  const loaded = await store.get(record.id);
  assert.deepEqual(loaded.bundle, BUNDLE);
  assert.equal(loaded.name, 'On the shape of attention');
});

test('gives two projects with the same name different ids', async () => {
  const first = await store.create({ name: 'Draft', bundle: BUNDLE });
  const second = await store.create({ name: 'Draft', bundle: BUNDLE });
  assert.notEqual(first.id, second.id);
});

test('normalises the name, truncates an absurd one, and slugs a unicode one', async () => {
  const messy = await store.create({ name: '  Résumé   /  Final  ', bundle: BUNDLE });
  assert.equal(messy.name, 'Résumé / Final');
  // NFKD folds the accents away, so the slug stays ASCII and URL-safe.
  assert.match(messy.id, /^[a-z0-9][a-z0-9-]*-[0-9a-f]{6}$/);
  assert.ok(messy.id.includes('final'));

  const untitled = await store.create({ bundle: BUNDLE });
  assert.equal(untitled.name, 'Untitled project');
  assert.match(untitled.id, /^untitled-project-[0-9a-f]{6}$/);

  const long = await store.create({ name: 'x'.repeat(500), bundle: BUNDLE });
  assert.equal(long.name.length, 120);
});

test('accepts a previewed file that exists and refuses one that does not', async () => {
  const ok = await store.create({ previewed: '/chapter.typ', bundle: BUNDLE });
  assert.equal(ok.previewed, '/chapter.typ');

  await assert.rejects(
    store.create({ previewed: '/missing.typ', bundle: BUNDLE }),
    (error: unknown) => {
      assert.ok(error instanceof ProjectInvalid);
      assert.equal(error.field, 'previewed');
      return true;
    },
  );
});

test('stores settings as a JSON string and refuses anything else', async () => {
  const ok = await store.create({ settings: '{"theme":"dark"}', bundle: BUNDLE });
  assert.equal(ok.settings, '{"theme":"dark"}');

  // Keys are re-serialised, so an odd-but-valid object still round-trips.
  const spaced = await store.create({ settings: '{ "theme" : "dark" }', bundle: BUNDLE });
  assert.equal(spaced.settings, '{"theme":"dark"}');

  for (const bad of ['not json', '[1,2]', '"a string"', '42']) {
    await assert.rejects(
      store.create({ settings: bad, bundle: BUNDLE }),
      (error: unknown) => {
        assert.ok(error instanceof ProjectInvalid);
        assert.equal(error.field, 'settings');
        return true;
      },
      `expected ${bad} to be refused`,
    );
  }

  const huge = JSON.stringify({ pad: 'x'.repeat(17 * 1024) });
  await assert.rejects(store.create({ settings: huge, bundle: BUNDLE }), ProjectInvalid);
});

test('a malformed or missing id is not found', async () => {
  for (const id of ['../../etc/passwd', '/etc/passwd', 'UPPER', 'a'.repeat(65), '']) {
    await assert.rejects(store.get(id), ProjectNotFound);
    assert.equal(await store.remove(id), false);
  }
  await assert.rejects(store.get('never-made-000000'), ProjectNotFound);
});

test('update changes only the supplied fields', async () => {
  const created = await store.create({ name: 'First', previewed: '/chapter.typ', bundle: BUNDLE });
  const renamed = await store.update(created.id, { name: 'Second' });

  assert.equal(renamed.name, 'Second');
  assert.equal(renamed.id, created.id);
  assert.equal(renamed.createdAt, created.createdAt);
  assert.equal(renamed.previewed, '/chapter.typ', 'previewed survived a rename');
  assert.deepEqual(renamed.bundle, BUNDLE, 'sources survived a rename');
  assert.ok(renamed.updatedAt >= created.updatedAt);
});

test('replacing sources re-validates the previewed pointer', async () => {
  const created = await store.create({ previewed: '/chapter.typ', bundle: BUNDLE });
  const replaced = await store.update(created.id, {
    bundle: { entry: '/index.typ', files: { '/index.typ': '= Index\n' } },
  });
  // The old pointer is gone with the old bundle, so it is cleared.
  assert.equal(replaced.previewed, null);

  await assert.rejects(store.update(created.id, { previewed: '/main.typ' }), ProjectInvalid);
});

test('revoking is idempotent', async () => {
  const record = await store.create({ bundle: BUNDLE });
  assert.equal(await store.remove(record.id), true);
  await assert.rejects(store.get(record.id), ProjectNotFound);
  assert.equal(await store.remove(record.id), false);
});

test('lists summaries, newest first, and skips junk', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'glyph-projects-list-'));
  const listing = new ProjectStore(isolated);
  try {
    const first = await listing.create({ name: 'Older', bundle: BUNDLE });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await listing.create({ name: 'Newer', bundle: BUNDLE });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await listing.update(first.id, { name: 'Touched' });

    await writeFile(join(isolated, 'junk.json'), 'not json', 'utf8');
    await writeFile(join(isolated, 'notes.txt'), 'ignored', 'utf8');

    const summaries = await listing.list();
    assert.equal(summaries.length, 2);
    assert.equal(summaries[0]!.name, 'Touched');
    assert.equal(summaries[1]!.name, 'Newer');
    assert.equal(summaries[0]!.entry, '/main.typ');
    assert.equal(summaries[0]!.files, 2);
    assert.equal(summaries[0]!.assets, 0);
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
});

test('an empty directory lists nothing rather than throwing', async () => {
  const empty = new ProjectStore(join(root, 'does-not-exist'));
  assert.deepEqual(await empty.list(), []);
});

test('a record whose id disagrees with its filename is refused', async () => {
  const id = 'aliased-000000';
  await writeFile(
    join(root, `${id}.json`),
    JSON.stringify({
      id: 'other-000000',
      name: 'x',
      previewed: null,
      settings: null,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      bundle: BUNDLE,
    }),
    'utf8',
  );
  await assert.rejects(store.get(id), ProjectNotFound);
});
