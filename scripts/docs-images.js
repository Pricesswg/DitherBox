#!/usr/bin/env node
/**
 * Rigenera tutte le immagini del README in un colpo solo.
 *
 *   npm run docs
 *
 * Se un giorno cambiano l'interfaccia o i colori, il README si riallinea
 * con un comando invece che a schermate fatte a mano.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esegui = promisify(execFile);

const script = (nome, args, env) => esegui(
  process.execPath, [join(ROOT, 'scripts', nome), ...args],
  { cwd: ROOT, env: { ...process.env, ...env } },
);

mkdirSync(join(ROOT, 'docs'), { recursive: true });

// La scena di prova: la usano sia la schermata del terminale sia quella
// del widget, cosi' le due mostrano la stessa immagine.
await script('sample.js', ['docs/sample.png', '900', '1200']);

await script('termshot.js', [
  'docs/tui.png', 'docs/sample.png', '100', '34', 'braille', 'en', 'simonitto',
  '{"algorithm":"atkinson","contrast":12}',
]);

await script('screenshot.js', [
  'docs/widget.png', '1180', '900', 'docs/sample.png',
  '{"palette":"marathon","algorithm":"atkinson","scale":2}',
], { DBX_HEIGHT: '700px' });

process.stdout.write('docs/sample.png docs/tui.png docs/widget.png\n');
