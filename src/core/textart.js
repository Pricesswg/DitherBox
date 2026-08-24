/**
 * L'immagine scritta con i caratteri.
 *
 * Due modi, con due compromessi diversi:
 *  - ascii   un carattere per pixel, scelto su una rampa di densita'. Si
 *            incolla ovunque, perche' usa solo caratteri che ogni font ha.
 *  - braille otto punti per cella, cioe' 2x4 pixel: quattro volte il
 *            dettaglio, ma i glifi braille mancano da parecchi font e
 *            altrove le colonne si sfalsano.
 *
 * Qui sta solo la parte comune - quale carattere per quale pixel - cosi'
 * terminale e browser disegnano la stessa immagine invece di due varianti
 * che col tempo divergono.
 */

import { luma, resampleBox, applyAdjustments, sharpen } from './adjust.js';
import { ditherImage } from './dither.js';
import { paletteInfo } from './palettes.js';

/** Dal buio al pieno. Pensata per fondo scuro: piu' denso = piu' chiaro. */
export const ASCII_RAMP = ' .·:;+=xX$&@█';

export const TEXT_MODES = ['ascii', 'braille'];

/**
 * Quanti pixel entrano in una cella, e quanto va allargata l'immagine perche'
 * a schermo torni con le proporzioni giuste: una cella di testo e' larga uno
 * e alta circa due.
 */
export const TEXT_CELLS = {
  ascii: { cx: 1, cy: 1, ratio: 2 },
  braille: { cx: 2, cy: 4, ratio: 1 },
};

/** Il carattere della rampa per una luminanza 0-255. */
export function asciiChar(l) {
  const ultimo = ASCII_RAMP.length - 1;
  return ASCII_RAMP[Math.max(0, Math.min(ultimo, Math.round((l / 255) * ultimo)))];
}

/**
 * Soglia adattiva: la meta' fra il pixel piu' scuro e il piu' chiaro.
 * Su un'immagine gia' ditherata a due tinte cade esattamente in mezzo.
 */
export function brailleThreshold(img) {
  let min = 255;
  let max = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const l = luma(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (l < min) min = l;
    if (l > max) max = l;
  }
  return (min + max) / 2;
}

/**
 * La cella braille che parte da (x, y): quali punti accendere e di che
 * colore sono in media i pixel accesi.
 * @returns {{char: string, bits: number, colour: number[]|null}}
 */
export function brailleCell(img, x, y, threshold) {
  let bits = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let accesi = 0;
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const sx = x + dx;
      const sy = y + dy;
      if (sx >= img.width || sy >= img.height) continue;
      const i = (sy * img.width + sx) * 4;
      const [cr, cg, cb] = [img.data[i], img.data[i + 1], img.data[i + 2]];
      if (luma(cr, cg, cb) <= threshold) continue;
      // Numerazione dei punti braille: i primi tre di ogni colonna sono
      // contigui, il quarto sta nei due bit alti.
      bits |= dy < 3 ? 1 << (dy + 3 * dx) : 0x40 << dx;
      r += cr; g += cg; b += cb;
      accesi++;
    }
  }
  return {
    char: String.fromCharCode(0x2800 + bits),
    bits,
    colour: accesi ? [r / accesi, g / accesi, b / accesi] : null,
  };
}

/**
 * Le misure in pixel che l'immagine deve avere per riempire `cols` colonne
 * di testo in questo modo, senza deformarsi.
 */
export function textTarget(srcWidth, srcHeight, cols, mode) {
  const m = TEXT_CELLS[mode] || TEXT_CELLS.ascii;
  const width = Math.max(m.cx, Math.round(cols) * m.cx);
  // Proporzioni: la cella e' alta circa il doppio di quanto e' larga.
  const height = Math.max(m.cy, Math.round((width / (srcWidth / srcHeight)) / m.ratio));
  return {
    width,
    height: Math.ceil(height / m.cy) * m.cy,
    cols: Math.round(cols),
    rows: Math.ceil(height / m.cy),
  };
}

/** Ridimensiona un'immagine perche' stia in `cols` colonne di testo. */
export function fitForText(img, cols, mode) {
  const t = textTarget(img.width, img.height, cols, mode);
  return resampleBox(img, t.width, t.height);
}

/**
 * L'immagine come testo semplice, senza colori: pronta da copiare e
 * incollare. L'immagine deve gia' avere le misure date da textTarget.
 */
export function toText(img, mode = 'ascii') {
  const righe = [];
  if (mode === 'braille') {
    const soglia = brailleThreshold(img);
    for (let y = 0; y < img.height; y += 4) {
      let riga = '';
      for (let x = 0; x < img.width; x += 2) riga += brailleCell(img, x, y, soglia).char;
      righe.push(riga.replace(/⠀+$/, ''));
    }
  } else {
    for (let y = 0; y < img.height; y++) {
      let riga = '';
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        riga += asciiChar(luma(img.data[i], img.data[i + 1], img.data[i + 2]));
      }
      righe.push(riga.replace(/ +$/, ''));
    }
  }
  return righe.join('\n');
}

/**
 * Dall'immagine di partenza al testo, passando per le regolazioni di tono.
 *
 * I due modi vogliono trattamenti opposti, ed e' il motivo per cui questa
 * funzione esiste invece di lasciar fare al chiamante:
 *  - l'ASCII **non** va ditherato. La rampa ha gia' tredici livelli, e
 *    ridurre a due tinte prima di mapparla li butta via: verrebbero righe
 *    di blocchi pieni al posto di una figura leggibile.
 *  - il braille invece **va** ditherato, perche' un punto o c'e' o non c'e':
 *    la gradazione la fa il dithering con la densita' dei puntini.
 *
 * @param {object} source immagine di partenza (RGBA)
 * @param {object} options `mode`, `cols`, piu' i parametri di tono e
 *   l'algoritmo, gli stessi che usa il resto del motore.
 */
export function imageToText(source, options = {}) {
  const mode = TEXT_MODES.includes(options.mode) ? options.mode : 'ascii';
  const cols = Math.max(8, Math.min(400, Math.round(options.cols || 80)));

  const piccola = fitForText(source, cols, mode);
  applyAdjustments(piccola, options);
  if (options.sharpen) sharpen(piccola, options.sharpen);

  if (mode !== 'braille') return toText(piccola, 'ascii');

  const { colors, ramp } = paletteInfo('bw');
  const ditherata = ditherImage(piccola, {
    algorithm: options.algorithm || 'atkinson',
    colors,
    ramp,
    strength: (options.strength ?? 100) / 100,
    bias: options.bias ?? 0,
    noise: options.noise ?? 0,
    serpentine: options.serpentine !== false,
  });
  return toText(ditherata, 'braille');
}
