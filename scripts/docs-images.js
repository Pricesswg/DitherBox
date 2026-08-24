#!/usr/bin/env node
/**
 * Rigenera tutte le immagini del README in un colpo solo.
 *
 *   npm run docs
 *
 * Se un giorno cambiano l'interfaccia o i colori, il README si riallinea
 * con un comando invece che a schermate fatte a mano. La foto e' la stessa
 * che il programma carica all'avvio quando non trova immagini, cosi' le
 * schermate mostrano esattamente quello che si vede aprendolo.
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

const FOTO = 'examples/sample.jpg';

// La foto e' un soggetto scuro su un muro chiaro, cioe' il caso in cui a
// un bit il muro diventa un blocco pieno e la figura sparisce. Contrasto
// giu', gamma su per tirare fuori le ombre, e un po' di nitidezza perche'
// a questa risoluzione il MOLLE si chiude in una macchia.
await script('termshot.js', [
  'docs/tui.png', FOTO, '100', '34', 'braille', 'en', 'simonitto',
  '{"algorithm":"atkinson","contrast":-15,"gamma":1.5,"brightness":-12,"sharpen":70}',
]);

await script('screenshot.js', [
  'docs/widget.png', '1180', '900', FOTO,
  '{"palette":"marathon","algorithm":"atkinson","scale":2}',
], { DBX_HEIGHT: '700px' });

process.stdout.write('docs/tui.png docs/widget.png\n');
