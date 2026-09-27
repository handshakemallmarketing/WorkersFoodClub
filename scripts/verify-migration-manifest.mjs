import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sqlDirectory = path.resolve('packages/durability/sql');
const manifestPath = path.join(sqlDirectory, 'MANIFEST.sha256');
const manifestText = await readFile(manifestPath, 'utf8');
const entries = new Map();

for (const [index, rawLine] of manifestText.split(/\r?\n/).entries()) {
  const line = rawLine.trim();
  if (!line) continue;
  const match = /^([a-f0-9]{64})  ([^/\\]+\.sql)$/.exec(line);
  if (!match) throw new Error(`MIGRATION_MANIFEST_LINE_INVALID:${index + 1}`);
  const [, expectedHash, filename] = match;
  if (entries.has(filename)) throw new Error(`MIGRATION_MANIFEST_DUPLICATE:${filename}`);
  entries.set(filename, expectedHash);
}

const sqlFiles = (await readdir(sqlDirectory))
  .filter(filename => filename.endsWith('.sql'))
  .sort();
const manifestedFiles = [...entries.keys()];

if (JSON.stringify(sqlFiles) !== JSON.stringify(manifestedFiles)) {
  const missing = sqlFiles.filter(filename => !entries.has(filename));
  const stale = manifestedFiles.filter(filename => !sqlFiles.includes(filename));
  const orderInvalid = missing.length === 0 && stale.length === 0;
  throw new Error(`MIGRATION_MANIFEST_COVERAGE_INVALID:missing=${missing.join(',')}:stale=${stale.join(',')}:order=${orderInvalid ? 'invalid' : 'unchecked'}`);
}

for (const filename of sqlFiles) {
  const filePath = path.join(sqlDirectory, filename);
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`MIGRATION_FILE_NOT_REGULAR:${filename}`);
  }
  const bytes = await readFile(filePath);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== entries.get(filename)) {
    throw new Error(`MIGRATION_MANIFEST_HASH_MISMATCH:${filename}`);
  }
}

console.log(`Migration manifest verified: ${sqlFiles.length} files`);
