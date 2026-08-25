import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processImage, exportSize, PARAMS, paletteInfo, aspectRatio,
} from '../src/core/index.js';
import { sampleImage } from './helpers.js';

const RAPPORTI = PARAMS.find((p) => p.key === 'aspect').values;
const ADATTAMENTI = PARAMS.find((p) => p.key === 'fit').values;

/** Le combinazioni su cui vale la pena insistere, sorgenti comprese. */
function* combinazioni() {
  for (const source of [[120, 90], [90, 120], [100, 100], [301, 97]]) {
    for (const aspect of RAPPORTI) {
      for (const fit of ADATTAMENTI) {
        for (const scale of [1, 3]) {
          for (const upscale of [true, false]) {
            yield {
              source,
              options: { aspect, fit, scale, upscale, megapixels: 0.01, algorithm: 'bayer4' },
            };
          }
        }
      }
    }
  }
}

/**
 * exportSize ripercorre la geometria di processImage sui soli numeri, per
 * poterla scrivere nell'intestazione senza ditherare. Due strade separate
 * che devono dare lo stesso risultato divergono al primo cambiamento: qui
 * si confrontano davvero, invece di dare per buono che siano allineate.
 */
test('exportSize predice le misure che processImage produce', () => {
  const differenze = [];
  for (const { source, options } of combinazioni()) {
    const img = sampleImage(source[0], source[1]);
    const vero = processImage(img, options);
    const previsto = exportSize(source[0], source[1], options);
    if (previsto.width !== vero.image.width || previsto.height !== vero.image.height) {
      differenze.push(
        `${source[0]}x${source[1]} ${JSON.stringify(options)}: `
        + `previsto ${previsto.width}x${previsto.height}, `
        + `ottenuto ${vero.image.width}x${vero.image.height}`,
      );
    }
  }
  assert.deepEqual(differenze, []);
});

test('il ritaglio porta al rapporto chiesto e non ingrandisce mai', () => {
  const img = sampleImage(300, 200);
  for (const aspect of RAPPORTI) {
    const ratio = aspectRatio(aspect);
    const { image } = processImage(img, { aspect, fit: 'crop', megapixels: 24 });
    if (ratio === null) {
      assert.equal(image.width, 300, 'source non deve toccare le misure');
      assert.equal(image.height, 200);
      continue;
    }
    assert.ok(image.width <= 300 && image.height <= 200, `${aspect} ha ingrandito`);
    // Un pixel di tolleranza: le misure sono intere, il rapporto no.
    assert.ok(
      Math.abs(image.width / image.height - ratio) < 0.02,
      `${aspect}: ottenuto ${image.width}x${image.height}`,
    );
  }
});

test('le bande portano al rapporto chiesto senza perdere contenuto', () => {
  const img = sampleImage(300, 200);
  for (const aspect of RAPPORTI) {
    const ratio = aspectRatio(aspect);
    if (ratio === null) continue;
    const { image } = processImage(img, { aspect, fit: 'pad', megapixels: 24 });
    assert.ok(
      Math.abs(image.width / image.height - ratio) < 0.02,
      `${aspect}: ottenuto ${image.width}x${image.height}`,
    );
    // Nessun lato si accorcia: le bande aggiungono, non tolgono.
    assert.ok(image.width >= 300 || image.height >= 200, `${aspect} ha tagliato`);
  }
});

/**
 * Una banda di un colore che la tavolozza non ha e' un colore in piu' nel
 * file: il conto dei colori salta, e su una tavolozza a due toni si vede
 * a occhio nudo.
 */
test('le bande usano un colore della tavolozza, il piu' + " scuro", () => {
  const img = sampleImage(300, 200);
  for (const palette of ['bw', 'gameboy', 'megadrive', 'risograph']) {
    const { colors } = paletteInfo(palette);
    const { image } = processImage(img, {
      palette, aspect: '1:1', fit: 'pad', megapixels: 24,
    });
    const angolo = [image.data[0], image.data[1], image.data[2]];
    assert.ok(
      colors.some((c) => c[0] === angolo[0] && c[1] === angolo[1] && c[2] === angolo[2]),
      `${palette}: banda ${angolo} non e' nella tavolozza`,
    );
  }
});

test('senza rapporto la pipeline resta quella di prima', () => {
  const img = sampleImage(200, 150);
  const senza = processImage(img, { palette: 'bw', algorithm: 'bayer4' });
  const esplicito = processImage(img, {
    palette: 'bw', algorithm: 'bayer4', aspect: 'source', fit: 'pad',
  });
  assert.equal(senza.image.width, esplicito.image.width);
  assert.equal(senza.image.height, esplicito.image.height);
  assert.deepEqual([...senza.image.data], [...esplicito.image.data]);
});
