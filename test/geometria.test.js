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

/**
 * Un'immagine con un segno riconoscibile in un angolo: serve a dire quale
 * parte e' sopravvissuta al ritaglio, che le sole misure non raccontano.
 */
function conSegno(w, h, sx, sy, lato = 20) {
  const img = sampleImage(w, h);
  for (let y = sy; y < sy + lato; y++) {
    for (let x = sx; x < sx + lato; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 255;
    }
  }
  return img;
}

const contiene = (img, [r, g, b]) => {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] === r && img.data[i + 1] === g && img.data[i + 2] === b) return true;
  }
  return false;
};

test('le posizioni spostano davvero il ritaglio, non solo il numero', () => {
  // Larga 400 e alta 200: chiedendo 1:1 il taglio e' orizzontale, e resta
  // un margine di 200 pixel su cui scorrere.
  const sinistra = conSegno(400, 200, 5, 90);
  const destra = conSegno(400, 200, 375, 90);
  const rosso = [255, 0, 0];
  const opzioni = (alignX) => ({
    palette: 'bit8', algorithm: 'bayer2', aspect: '1:1', fit: 'crop', alignX, megapixels: 24,
  });

  assert.ok(contiene(processImage(sinistra, opzioni(0)).image, rosso),
    'a 0 il ritaglio deve prendere il bordo sinistro');
  assert.ok(!contiene(processImage(sinistra, opzioni(100)).image, rosso),
    'a 100 il bordo sinistro deve restare fuori');

  assert.ok(contiene(processImage(destra, opzioni(100)).image, rosso),
    'a 100 il ritaglio deve prendere il bordo destro');
  assert.ok(!contiene(processImage(destra, opzioni(0)).image, rosso),
    'a 0 il bordo destro deve restare fuori');

  assert.ok(!contiene(processImage(sinistra, opzioni(50)).image, rosso));
  assert.ok(!contiene(processImage(destra, opzioni(50)).image, rosso));
});

/**
 * A zoom 100 il rettangolo tocca gia' due lati e su quell'asse non si muove:
 * e' il motivo per cui una posizione sola non basta. Rimpicciolito, il
 * margine c'e' su tutti e due, e i due cursori devono lavorare davvero.
 */
test('rimpicciolita la selezione, tutte e due le posizioni si muovono', () => {
  const rosso = [255, 0, 0];
  const alto = conSegno(300, 300, 140, 5);
  const basso = conSegno(300, 300, 140, 275);
  const opzioni = (alignY) => ({
    palette: 'bit8', algorithm: 'bayer2', aspect: '1:1', fit: 'crop',
    zoom: 50, alignY, megapixels: 24,
  });

  assert.ok(contiene(processImage(alto, opzioni(0)).image, rosso), 'a 0 deve prendere in alto');
  assert.ok(!contiene(processImage(alto, opzioni(100)).image, rosso));
  assert.ok(contiene(processImage(basso, opzioni(100)).image, rosso), 'a 100 deve prendere in basso');
  assert.ok(!contiene(processImage(basso, opzioni(0)).image, rosso));

  // Su un'immagine quadrata portata a 1:1, a zoom 100 in verticale non c'e'
  // margine: la posizione non puo' cambiare niente, ed e' giusto cosi'.
  const pieno = (alignY) => processImage(alto, {
    palette: 'bit8', algorithm: 'bayer2', aspect: '1:1', fit: 'crop', zoom: 100, alignY,
  }).image;
  assert.deepEqual([...pieno(0).data], [...pieno(100).data]);
});

test('lo zoom rimpicciolisce la selezione, le posizioni no', () => {
  for (const fit of ['crop', 'pad']) {
    const misure = [0, 25, 50, 75, 100].map((v) => {
      const a = exportSize(400, 200, { aspect: '1:1', fit, alignX: v, alignY: v });
      return `${a.width}x${a.height}`;
    });
    assert.equal(new Set(misure).size, 1, `${fit}: le misure cambiano con la posizione: ${misure}`);

    const pieno = exportSize(400, 200, { aspect: '1:1', fit, zoom: 100 });
    const meta = exportSize(400, 200, { aspect: '1:1', fit, zoom: 50 });
    assert.ok(meta.width < pieno.width, `${fit}: lo zoom non ha rimpicciolito niente`);
  }
});

/** Senza rapporto lo zoom resta un ritaglio a proporzioni invariate. */
test('lo zoom funziona anche senza un rapporto scelto', () => {
  const img = sampleImage(400, 200);
  const { image } = processImage(img, { aspect: 'source', zoom: 50, megapixels: 24 });
  assert.equal(image.width, 200);
  assert.equal(image.height, 100);
});
