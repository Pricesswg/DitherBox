#!/usr/bin/env node
/**
 * Genera l'immagine di prova usata dalle schermate del README.
 *
 *   node scripts/sample.js docs/sample.png 900 1200
 *
 * Non e' una foto: e' una scena calcolata a mano, con una sfera
 * illuminata sopra un pavimento a scacchi che si perde nella nebbia. La
 * scelta non e' estetica ma tecnica: serve una immagine con sfumature
 * lunghe e continue (il fondo, l'ombreggiatura, la nebbia) e insieme un
 * motivo regolare ad alta frequenza (gli scacchi), perche' sono le due
 * cose su cui il dithering si comporta in modo diverso e si vede se
 * l'algoritmo lavora bene. Una foto qualsiasi non le garantisce entrambe.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

import { createImage } from '../src/core/index.js';
import { savePng } from '../src/cli/imageio.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [out = 'docs/sample.png', larghezza = '900', altezza = '1200'] = process.argv.slice(2);

const W = Number(larghezza);
const H = Number(altezza);

const img = createImage(W, H);

const ORIZZONTE = 0.52;          // altezza della linea dell'orizzonte
const LUCE = [-0.42, -0.62, 0.66];
const CX = 0.5;
const CY = 0.44;
const R = 0.27;                  // raggio della sfera, in frazioni di larghezza

const chiaro = (v) => Math.max(0, Math.min(1, v));

for (let y = 0; y < H; y++) {
  const v = y / H;
  for (let x = 0; x < W; x++) {
    const u = x / W;
    let l;

    // La sfera: normale ricavata dal disco, illuminazione diffusa piu'
    // un riflesso speculare stretto, e un po' di rimbalzo dal basso.
    const dx = (u - CX) / R;
    const dy = ((v - CY) * (H / W)) / R;
    const d2 = dx * dx + dy * dy;

    if (d2 <= 1) {
      const nz = Math.sqrt(1 - d2);
      const diff = Math.max(0, LUCE[0] * dx + LUCE[1] * dy + LUCE[2] * nz);
      const spec = Math.pow(diff, 42) * 0.9;
      const rimbalzo = 0.10 * Math.max(0, dy);
      l = 0.04 + 0.78 * Math.pow(diff, 1.25) + spec + rimbalzo;
    } else if (v > ORIZZONTE) {
      // Il pavimento: scacchi in prospettiva, sempre piu' fitti verso
      // l'orizzonte, che sbiadiscono nella nebbia.
      const profondita = (v - ORIZZONTE) / (1 - ORIZZONTE);
      const z = 0.35 / Math.max(0.02, profondita);
      const sx = (u - 0.5) * z * 3.4;
      const casella = (Math.floor(sx) + Math.floor(z * 1.6)) & 1;
      const nebbia = chiaro(1 - profondita * 2.2);
      l = (casella ? 0.62 : 0.20) * (1 - nebbia) + 0.46 * nebbia;

      // Ombra della sfera, schiacciata sul pavimento.
      const ox = (u - CX) / (R * 1.5);
      const oy = (v - (ORIZZONTE + 0.10)) / (R * 0.30);
      const o = ox * ox + oy * oy;
      if (o < 1) l *= 0.30 + 0.70 * Math.pow(o, 0.7);
    } else {
      // Il cielo: una sfumatura lunga, il caso peggiore per il dithering.
      l = 0.78 - 0.50 * (v / ORIZZONTE);
    }

    // Vignettatura: toglie la piattezza agli angoli.
    const vig = 1 - 0.30 * (((u - 0.5) ** 2 + (v - 0.5) ** 2) * 2.4);
    const g = Math.round(chiaro(l * vig) * 255);

    const i = (y * W + x) * 4;
    img.data[i] = g;
    img.data[i + 1] = g;
    img.data[i + 2] = g;
    img.data[i + 3] = 255;
  }
}

const destinazione = resolve(ROOT, out);
mkdirSync(dirname(destinazione), { recursive: true });
await savePng(destinazione, img);
process.stdout.write(`${destinazione}\n`);
