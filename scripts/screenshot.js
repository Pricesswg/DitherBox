#!/usr/bin/env node
/**
 * Apre examples/index.html in Chromium e ne salva una schermata del widget.
 * Serve a guardarlo senza doverlo aprire a mano dopo ogni modifica.
 *
 *   npm run screenshot -- esito.png 1240 820 foto.png '{"palette":"marathon"}' 400
 *
 * Tutti gli argomenti dopo il nome del file sono facoltativi: larghezza,
 * altezza, foto da caricare, opzioni in JSON, scorrimento del pannello.
 *
 * La pagina carica dist/, quindi va ricostruito il pacchetto dopo aver
 * toccato i sorgenti: ci pensa questo script.
 */

import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

import { launchChromium } from './find-chromium.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [out = 'ditherbox.png', w = '1240', h = '820', foto, opzioni, scorri] = process.argv.slice(2);

await promisify(execFile)(process.execPath, [join(ROOT, 'scripts', 'build.js')], { cwd: ROOT });

const browser = await launchChromium(chromium);
if (!browser) {
  process.stderr.write('Nessun Chromium utilizzabile: installalo o imposta CHROMIUM_PATH\n');
  process.exit(1);
}

const page = await browser.newPage({
  viewportSize: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 2,
});

const errori = [];
page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
page.on('pageerror', (e) => errori.push(`PAGEERROR: ${e.message}`));

await page.goto(pathToFileURL(join(ROOT, 'examples', 'index.html')).href, { waitUntil: 'networkidle' });

if (foto) {
  const b64 = readFileSync(foto).toString('base64');
  await page.evaluate(async (dati) => {
    const bin = atob(dati);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    await window.__boxes[0].load(new File([blob], 'foto.png', { type: 'image/png' }));
  }, b64);
  await page.waitForTimeout(500);
}

if (opzioni) {
  await page.evaluate((o) => window.__boxes[0].set(JSON.parse(o)), opzioni);
  await page.waitForTimeout(400);
}

if (scorri) {
  await page.evaluate((t) => { document.querySelector('.dbx__scroll').scrollTop = Number(t); }, scorri);
  await page.waitForTimeout(150);
}

await page.locator('.dbx').first().screenshot({ path: out });
if (errori.length) process.stderr.write(`errori nella pagina:\n${errori.join('\n')}\n`);
process.stdout.write(`${out}\n`);
await browser.close();
