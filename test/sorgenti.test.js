import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { globSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Non tutti i file del progetto vengono importati dai test: gli script di
 * servizio, per esempio, nessuno li tocca finche' non li si lancia a mano.
 * Un errore di sintassi la' dentro passerebbe inosservato fino al momento
 * peggiore, quindi qui si controllano tutti.
 */
test('ogni file del progetto e sintatticamente valido', async () => {
  const files = globSync(['src/**/*.js', 'test/**/*.js', 'scripts/*.js', 'bin/*.js', 'dist/*.js'], { cwd: ROOT });
  assert.ok(files.length > 15, `trovati solo ${files.length} file: il filtro e sbagliato`);

  const rotti = [];
  await Promise.all(files.map(async (f) => {
    try {
      await run(process.execPath, ['--check', f], { cwd: ROOT });
    } catch (err) {
      rotti.push(`${f}: ${String(err.stderr).split('\n').find((l) => l.includes('Error')) || 'errore'}`);
    }
  }));
  assert.deepEqual(rotti, []);
});
