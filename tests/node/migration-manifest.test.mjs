import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const verifier = path.resolve('scripts/verify-migration-manifest.mjs');

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function runVerifier(cwd) {
  return spawnSync(process.execPath, [path.join(cwd, 'scripts/verify-migration-manifest.mjs')], {
    cwd,
    encoding: 'utf8',
  });
}

async function fixture(files, manifestOrder = Object.keys(files).sort()) {
  const root = await mkdtemp(path.join(tmpdir(), 'wfc-migration-manifest-'));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'packages/durability/sql'), { recursive: true });
  await copyFile(verifier, path.join(root, 'scripts/verify-migration-manifest.mjs'));
  for (const [filename, bytes] of Object.entries(files)) {
    await writeFile(path.join(root, 'packages/durability/sql', filename), bytes);
  }
  const manifest = manifestOrder
    .map(filename => `${hash(files[filename])}  ${filename}`)
    .join('\n');
  await writeFile(path.join(root, 'packages/durability/sql/MANIFEST.sha256'), `${manifest}\n`);
  return root;
}

test('repository migration manifest covers and verifies every SQL migration', () => {
  const result = spawnSync(process.execPath, [verifier], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Migration manifest verified: 44 files/);
});

test('migration manifest verifier rejects tampering, coverage drift, ordering drift and symlinks', async t => {
  await t.test('modified migration bytes', async () => {
    const root = await fixture({ '001_first.sql': 'SELECT 1;\n' });
    try {
      await writeFile(path.join(root, 'packages/durability/sql/001_first.sql'), 'SELECT 2;\n');
      const result = runVerifier(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /MIGRATION_MANIFEST_HASH_MISMATCH:001_first\.sql/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('unmanifested migration', async () => {
    const root = await fixture({ '001_first.sql': 'SELECT 1;\n' });
    try {
      await writeFile(path.join(root, 'packages/durability/sql/002_second.sql'), 'SELECT 2;\n');
      const result = runVerifier(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /missing=002_second\.sql/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('stale manifest entry', async () => {
    const root = await fixture({
      '001_first.sql': 'SELECT 1;\n',
      '002_second.sql': 'SELECT 2;\n',
    });
    try {
      await rm(path.join(root, 'packages/durability/sql/002_second.sql'));
      const result = runVerifier(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /stale=002_second\.sql/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('reordered manifest', async () => {
    const files = {
      '001_first.sql': 'SELECT 1;\n',
      '002_second.sql': 'SELECT 2;\n',
    };
    const root = await fixture(files, ['002_second.sql', '001_first.sql']);
    try {
      const result = runVerifier(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /order=invalid/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test('symbolic-link migration', async () => {
    const root = await fixture({ '001_first.sql': 'SELECT 1;\n' });
    try {
      await symlink('001_first.sql', path.join(root, 'packages/durability/sql/002_second.sql'));
      const manifestPath = path.join(root, 'packages/durability/sql/MANIFEST.sha256');
      await writeFile(
        manifestPath,
        `${hash('SELECT 1;\n')}  001_first.sql\n${hash('SELECT 1;\n')}  002_second.sql\n`,
      );
      const result = runVerifier(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /MIGRATION_FILE_NOT_REGULAR:002_second\.sql/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
