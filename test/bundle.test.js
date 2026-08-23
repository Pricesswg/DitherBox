import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as core from '../src/core/index.js';
import { sampleImage } from './helpers.js';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'dist', 'ditherbox.global.js');

/** Valuta il file impacchettato come uno script classico e ne prende il globale. */
async function loadBundle() {
  const source = await readFile(BUNDLE, 'utf8');
  const scope = {};
  // eslint-disable-next-line no-new-func
  new Function('globalThis', `${source}`).call(scope, scope);
  return scope.DitherBox;
}

test('il file impacchettato espone la classe e tutto il motore', async () => {
  const D = await loadBundle();
  assert.equal(typeof D, 'function', 'DitherBox deve essere la classe');
  for (const name of [
    'processImage', 'ditherImage', 'buildQuantizer', 'createImage',
    'PALETTES', 'ALGORITHMS', 'PRESETS', 'PARAMS', 'DEFAULTS',
    'normalizeOptions', 'applyPreset', 'formatValue',
    'autoInit', 'ditherToCanvas',
  ]) assert.ok(D[name] !== undefined, `manca ${name} nel bundle`);

  assert.equal(D.PARAMS.length, core.PARAMS.length);
  assert.equal(D.ALGORITHMS.length, core.ALGORITHMS.length);
  assert.deepEqual(Object.keys(D.PALETTES), Object.keys(core.PALETTES));
});

test('il bundle produce esattamente lo stesso risultato dei sorgenti', async () => {
  const D = await loadBundle();
  const img = sampleImage(96, 72);
  for (const preset of Object.keys(core.PRESETS)) {
    // Grana a zero: e' rumore casuale, e due esecuzioni non possono
    // coincidere per costruzione. Tutto il resto e' deterministico.
    const options = { ...core.applyPreset(preset), noise: 0 };
    const daSorgente = core.processImage(img, options).image;
    const daBundle = D.processImage(img, options).image;
    assert.deepEqual(
      [daBundle.width, daBundle.height],
      [daSorgente.width, daSorgente.height],
      `${preset}: misure diverse`,
    );
    assert.deepEqual([...daBundle.data], [...daSorgente.data], `${preset}: pixel diversi`);
  }
});

test('la grana casuale e davvero casuale anche nel bundle', async () => {
  const D = await loadBundle();
  const img = sampleImage(64, 64);
  const options = { palette: 'bw', algorithm: 'bayer8', noise: 40 };
  const a = D.processImage(img, options).image;
  const b = D.processImage(img, options).image;
  assert.notDeepEqual([...a.data], [...b.data]);
});

test('il bundle sul disco e allineato ai sorgenti', async () => {
  const prima = await readFile(BUNDLE, 'utf8');
  await run(process.execPath, [join(ROOT, 'scripts', 'build.js')], { cwd: ROOT });
  const dopo = await readFile(BUNDLE, 'utf8');
  assert.equal(
    prima, dopo,
    'dist/ditherbox.global.js non e aggiornato: lancia npm run build e ricommetti',
  );
});

test('il foglio di stile impacchettato e copia di quello sorgente', async () => {
  assert.equal(
    await readFile(join(ROOT, 'dist', 'ditherbox.css'), 'utf8'),
    await readFile(join(ROOT, 'src', 'web', 'ditherbox.css'), 'utf8'),
  );
});

test('il bundle non contiene import o export rimasti in giro', async () => {
  const source = await readFile(BUNDLE, 'utf8');
  assert.ok(!/^\s*import\s/m.test(source), 'e rimasta una istruzione import');
  assert.ok(!/^\s*export\s/m.test(source), 'e rimasta una istruzione export');
});
