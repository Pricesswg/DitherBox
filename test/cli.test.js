import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgs, helpText } from '../src/cli/main.js';
import { parseSimpleToml } from '../src/cli/theme.js';
import { loadImage } from '../src/cli/imageio.js';
import { tempDir, writeSample } from './helpers.js';

const run = promisify(execFile);
const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ditherbox.js');
const cli = (args, opts = {}) => run(process.execPath, [BIN, ...args], opts);

/** Misure di un file immagine, per non ripetere la lettura ogni volta. */
async function size(path) {
  const img = await loadImage(path);
  return [img.width, img.height];
}

test('parseArgs distingue posizionali, valori e interruttori', () => {
  const { flags, positional } = parseArgs([
    'a.png', 'b.png', '--palette', 'gameboy', '--scale=4',
    '--no-serpentine', '--invert', '-o', 'out.png', '-p', 'macintosh',
  ]);
  assert.deepEqual(positional, ['a.png', 'b.png']);
  assert.equal(flags.palette, 'gameboy');
  assert.equal(flags.scale, '4');
  assert.equal(flags.serpentine, false);
  assert.equal(flags.invert, true);
  assert.equal(flags.out, 'out.png');
  assert.equal(flags.preset, 'macintosh');
});

test('parseArgs tratta tutto dopo -- come nomi di file', () => {
  const { positional } = parseArgs(['--scale', '2', '--', '--strano.png']);
  assert.deepEqual(positional, ['--strano.png']);
});

test('parseArgs protesta se manca il valore', () => {
  assert.throws(() => parseArgs(['--palette']), /Manca il valore/);
});

test('l aiuto elenca tutte le opzioni di elaborazione', () => {
  const text = helpText();
  for (const flag of ['--palette', '--algorithm', '--scale', '--megapixels', '--out-dir']) {
    assert.ok(text.includes(flag), `manca ${flag} nell aiuto`);
  }
});

test('parseSimpleToml legge tipi, commenti e cancelletti fra virgolette', () => {
  const r = parseSimpleToml([
    '# intestazione', 'theme = "nord"', 'scale = 4', 'gamma = 1.25',
    'upscale = true', 'invert = false', 'accent = "#ff0000"  # colore',
    'nudo = bw', 'vuoto =', '[sezione]',
  ].join('\n'));
  assert.deepEqual(r, {
    theme: 'nord', scale: 4, gamma: 1.25, upscale: true,
    invert: false, accent: '#ff0000', nudo: 'bw',
  });
});

test('--version e --help escono con successo', async () => {
  assert.match((await cli(['--version'])).stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.ok((await cli(['--help'])).stdout.includes('USO'));
  assert.ok((await cli(['--list'])).stdout.includes('PALETTE'));
});

test('elabora un file e ne salva un altro', async (t) => {
  const dir = tempDir(t);
  const input = await writeSample(dir, 'in.png', 200, 150);
  const output = join(dir, 'out.png');
  const { stdout } = await cli([input, '--preset', 'macintosh', '-o', output]);
  assert.ok(stdout.includes('out.png'));

  const img = await loadImage(output);
  const colori = new Set();
  for (let i = 0; i < img.data.length; i += 4) colori.add(img.data[i]);
  assert.deepEqual([...colori].sort((a, b) => a - b), [0, 255]);
});

test('rispetta megapixel e scala anche senza interfaccia', async (t) => {
  const dir = tempDir(t);
  const input = await writeSample(dir, 'in.png', 400, 200);   // 0.08 MP

  // 0.02 MP = un quarto dei pixel, cioe' meta' per lato: 200x100.
  // Poi --scale 4 riduce a blocchi e --no-upscale lascia il risultato crudo.
  const out = join(dir, 'p.png');
  await cli([input, '--megapixels', '0.02', '--scale', '4', '--no-upscale', '-o', out]);
  assert.deepEqual(
    await size(out), [50, 25],
  );

  // Chiedere piu' megapixel della foto non la ingrandisce.
  const grande = join(dir, 'g.png');
  await cli([input, '--megapixels', '24', '-o', grande]);
  assert.deepEqual(await size(grande), [400, 200]);
});

test('accetta una palette scritta a mano', async (t) => {
  const dir = tempDir(t);
  const input = await writeSample(dir, 'in.png', 120, 90);
  const out = join(dir, 'duo.png');
  await cli([input, '--palette', '#0a0c10,#c2fe0b', '--algorithm', 'atkinson', '-o', out]);

  const img = await loadImage(out);
  const colori = new Set();
  for (let i = 0; i < img.data.length; i += 4) {
    colori.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
  }
  assert.ok(colori.size <= 2, `colori usati: ${[...colori].join(' | ')}`);
  for (const c of colori) assert.ok(['10,12,16', '194,254,11'].includes(c), c);

  // Una palette scritta male resta un errore comprensibile.
  await assert.rejects(
    () => cli([input, '--palette', 'rosso,verde', '-o', join(dir, 'x.png')]),
    /non esiste/,
  );
});

test('le palette Marathon ci sono e sono elencate', async () => {
  const { stdout } = await cli(['--list']);
  for (const nome of ['marathon', 'marathonDuo', 'marathonTerm']) {
    assert.ok(stdout.includes(nome), `manca ${nome} in --list`);
  }
});

test('elaborazione in blocco su una cartella', async (t) => {
  const dir = tempDir(t);
  await writeSample(dir, 'a.png', 60, 60);
  await writeSample(dir, 'b.png', 60, 60);
  const esiti = join(dir, 'esiti');
  await cli([dir, '--preset', 'gameboy', '--out-dir', esiti]);
  const files = readdirSync(esiti).sort();
  assert.equal(files.length, 2);
  assert.ok(files.every((f) => f.includes('gameboy')), files.join(', '));
});

test('--print scrive nel terminale senza salvare niente', async (t) => {
  const dir = tempDir(t);
  const input = await writeSample(dir, 'in.png', 120, 90);
  const { stdout } = await cli([input, '--print', '--mode', 'ascii'], {
    env: { ...process.env, COLUMNS: '60', LINES: '20' },
  });
  assert.ok(stdout.split('\n').length > 3);
  assert.deepEqual(readdirSync(dir), ['in.png'], 'non deve creare file');
});

test('gli errori sono comprensibili e escono con codice 1', async (t) => {
  const dir = tempDir(t);
  const input = await writeSample(dir, 'in.png', 40, 40);
  const casi = [
    [[input, '--palette', 'inesistente', '-o', join(dir, 'x.png')], /non esiste/],
    [[join(dir, 'manca.png'), '-o', join(dir, 'x.png')], /Non trovo/],
    [[input, '--scale', 'abc', '-o', join(dir, 'x.png')], /vuole un numero/],
    [[input, '--preset', 'inventato', '-o', join(dir, 'x.png')], /inesistente/],
    [[input, '--mode', 'inventato', '--print'], /inesistente/],
    [[input, input, '-o', join(dir, 'x.png')], /--out-dir/],
    [[input], /terminale interattivo/],
  ];
  for (const [args, atteso] of casi) {
    await assert.rejects(
      () => cli(args),
      (err) => {
        assert.equal(err.code, 1, args.join(' '));
        assert.match(err.stderr, atteso, args.join(' '));
        return true;
      },
      args.join(' '),
    );
  }
});
