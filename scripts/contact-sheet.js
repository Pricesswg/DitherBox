#!/usr/bin/env node
/**
 * La tavola dei preset: la stessa foto passata da tutti, uno accanto
 * all'altro.
 *
 *   node scripts/contact-sheet.js docs/presets.png examples/sample.jpg
 *
 * Serve a scegliere con gli occhi invece che dal nome. Un preset non e'
 * solo una tavolozza: e' tavolozza, grandezza dei pixel e trama insieme,
 * e quelle tre cose si giudicano soltanto vedendole.
 */

import { chromium } from 'playwright';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

import { PRESETS, applyPreset, presetLabel, processImage, paletteInfo } from '../src/core/index.js';
import { loadImage, encodePng } from '../src/cli/imageio.js';
import { launchChromium } from './find-chromium.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [out = 'docs/presets.png', foto = 'examples/sample.jpg', larghezza = '300'] = process.argv.slice(2);

const CELLA = Number(larghezza);
const sorgente = await loadImage(resolve(ROOT, foto));

// La finestra va dimensionata sulla griglia, se no lo scatto taglia via
// le colonne che non ci stanno e la tavola esce monca: la prima versione
// perdeva tre preset su quindici.
const COLONNE = 5;
const GAP = 18;
const BORDO = 22;
const ALTO_CELLA = Math.round((CELLA * sorgente.height) / sorgente.width);

/** Il PNG di un preset, come data URI da mettere nella pagina. */
async function riquadro(chiave) {
  const opzioni = applyPreset(chiave, {});
  const alto = Math.round((CELLA * sorgente.height) / sorgente.width);
  const { image } = processImage(sorgente, {
    ...opzioni,
    // Alla misura della cella, cosi' il pixelone del preset si vede per
    // quello che e' invece di sparire in una riduzione successiva.
    megapixels: (CELLA * alto) / 1e6,
  });
  const png = encodePng(image);
  const { colors } = paletteInfo(opzioni.palette);
  return {
    chiave,
    nome: presetLabel(chiave),
    dati: `data:image/png;base64,${png.toString('base64')}`,
    sotto: `${colors.length} col · ${opzioni.algorithm} · ${opzioni.scale}x`,
  };
}

const riquadri = [];
for (const chiave of Object.keys(PRESETS)) riquadri.push(await riquadro(chiave));

const pagina = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; background: #0f0f0f; }
  #griglia {
    display: grid;
    grid-template-columns: repeat(${COLONNE}, ${CELLA}px);
    gap: ${GAP}px;
    padding: ${BORDO}px;
    font: 500 13px/1.3 ui-monospace, "DejaVu Sans Mono", monospace;
    color: #ffffff;
  }
  figure { margin: 0; }
  img { display: block; width: ${CELLA}px; image-rendering: pixelated; }
  figcaption { padding-top: 7px; }
  .sotto { color: #808080; font-size: 11px; letter-spacing: .02em; }
</style>
<div id="griglia">${riquadri.map((r) => `
  <figure>
    <img src="${r.dati}" alt="${r.nome}">
    <figcaption>${r.nome}<div class="sotto">${r.sotto}</div></figcaption>
  </figure>`).join('')}
</div>`;

const browser = await launchChromium(chromium);
if (!browser) {
  process.stderr.write('Nessun Chromium utilizzabile: installalo o imposta CHROMIUM_PATH\n');
  process.exit(1);
}
const page = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: {
    width: COLONNE * CELLA + (COLONNE - 1) * GAP + BORDO * 2 + 40,
    height: Math.ceil(riquadri.length / COLONNE) * (ALTO_CELLA + GAP + 46)
      + BORDO * 2 + 40,
  },
});
await page.setContent(pagina, { waitUntil: 'load' });
const destinazione = resolve(ROOT, out);
mkdirSync(dirname(destinazione), { recursive: true });
await page.locator('#griglia').screenshot({ path: destinazione });
await browser.close();
process.stdout.write(`${destinazione}\n`);
