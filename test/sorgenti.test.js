import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Elenca i .js di una cartella, scendendo nelle sottocartelle solo se lo si
 * chiede. `fs.globSync` farebbe lo stesso in una riga, ma c'e' solo da Node
 * 22 mentre il programma gira da 18: un test che pretende una versione piu'
 * nuova di quella che prova taglia fuori chi lavora sulla minima supportata,
 * ed e' l'unica ragione per cui questa suite non partiva su 18 e 20.
 */
function sorgenti(dir, ricorsiva) {
  const dentro = [];
  for (const voce of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const percorso = join(dir, voce.name);
    if (voce.isDirectory()) {
      if (ricorsiva) dentro.push(...sorgenti(percorso, true));
    } else if (voce.name.endsWith('.js')) {
      dentro.push(percorso);
    }
  }
  return dentro;
}

/**
 * Non tutti i file del progetto vengono importati dai test: gli script di
 * servizio, per esempio, nessuno li tocca finche' non li si lancia a mano.
 * Un errore di sintassi la' dentro passerebbe inosservato fino al momento
 * peggiore, quindi qui si controllano tutti.
 */
test('ogni file del progetto e sintatticamente valido', async () => {
  const files = [
    ...sorgenti('src', true),
    ...sorgenti('test', true),
    ...sorgenti('scripts', false),
    ...sorgenti('bin', false),
    ...sorgenti('dist', false),
  ];
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
