/**
 * La pipeline completa, condivisa da widget web e app da terminale.
 */

import {
  applyAdjustments, sharpen, downscaleByFactor, upscaleByFactor,
  resampleBox, cloneImage, cropToAspect, padToAspect, cropFrame, padFrame, luma,
} from './adjust.js';
import { buildQuantizer, ditherImage } from './dither.js';
import { paletteInfo } from './palettes.js';
import { normalizeOptions, aspectRatio } from './options.js';

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} source
 * @param {object} rawOptions vedi PARAMS in options.js
 * @returns {{image:object, options:object, palette:Array, ditherWidth:number, ditherHeight:number}}
 */
export function processImage(source, rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const { colors, ramp, bits } = paletteInfo(options.palette);

  // 0. Inquadratura. Il ritaglio si fa subito, perche' quello che si butta
  //    via non deve consumare ne' megapixel ne' tempo; le bande si mettono
  //    invece alla fine, dopo il dithering, per non ditherarle.
  const ratio = aspectRatio(options.aspect);
  const ritaglia = ratio !== null && options.fit === 'crop';
  const bande = ratio !== null && options.fit === 'pad';
  const inquadrata = ritaglia ? cropToAspect(source, ratio) : source;

  // 1. Riduzione alla risoluzione richiesta. E' anche il motivo per cui le
  //    foto da fotocamera non fanno arrancare l'interfaccia: si lavora su
  //    due megapixel, non su dodici.
  //    Il budget si misura sul fotogramma con le bande gia' contate: senza,
  //    "2 MP" descriverebbe la fotografia e il file ne peserebbe di piu'.
  const frame = bande ? padFrame(inquadrata.width, inquadrata.height, ratio) : inquadrata;
  const target = targetSize(frame.width, frame.height, options.megapixels);
  let img = target.scale < 1
    ? resampleBox(inquadrata, inquadrata.width * target.scale, inquadrata.height * target.scale)
    : cloneImage(inquadrata);

  // 2. Regolazioni tonali sul pieno dettaglio, prima di buttare via pixel.
  applyAdjustments(img, options);
  if (options.sharpen) sharpen(img, options.sharpen);

  // 3. Riduzione a blocchi: e' questa che da' il pixellone.
  const small = downscaleByFactor(img, options.scale);

  // 4. Dithering.
  const quantizer = buildQuantizer(colors, ramp, bits);
  const dithered = ditherImage(small, {
    algorithm: options.algorithm,
    colors,
    ramp,
    quantizer,
    strength: options.strength / 100,
    bias: options.bias,
    noise: options.noise,
    serpentine: options.serpentine,
  });

  // 5. Ritorno alla scala di partenza, a pixel netti.
  let image = options.upscale && options.scale > 1
    ? upscaleByFactor(dithered, options.scale)
    : cloneImage(dithered);

  // 6. Le bande, dell'unico colore che si puo' usare senza mentire: uno
  //    di quelli della tavolozza.
  if (bande) image = padToAspect(image, ratio, coloreBanda(colors));

  return {
    image,
    options,
    palette: colors,
    ditherWidth: dithered.width,
    ditherHeight: dithered.height,
  };
}

/**
 * Le misure che avra' il file, senza toccare un pixel.
 *
 * Le interfacce devono poter scrivere "1868x1078 -> 1414x1414" accanto ai
 * controlli a ogni battuta di tasto, e ditherare due megapixel per stampare
 * due numeri non e' una cosa che si possa fare. Ripercorre quindi la
 * geometria di processImage sulle sole misure.
 *
 * Ripercorrerla vuol dire poterne divergere, ed e' il motivo per cui
 * test/geometria.test.js confronta le due su tutte le combinazioni invece
 * di fidarsi.
 */
export function exportSize(width, height, rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const ratio = aspectRatio(options.aspect);
  const ritaglia = ratio !== null && options.fit === 'crop';
  const bande = ratio !== null && options.fit === 'pad';

  let { width: w, height: h } = ritaglia
    ? cropFrame(width, height, ratio)
    : { width, height };

  const frame = bande ? padFrame(w, h, ratio) : { width: w, height: h };
  const { scale } = targetSize(frame.width, frame.height, options.megapixels);
  if (scale < 1) {
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }

  const f = Math.max(1, Math.round(options.scale));
  if (f > 1) {
    w = Math.max(1, Math.floor(w / f));
    h = Math.max(1, Math.floor(h / f));
    if (options.upscale) {
      w *= f;
      h *= f;
    }
  }

  return bande ? padFrame(w, h, ratio) : { width: w, height: h };
}

/**
 * Le misure a cui un'immagine va portata per stare in `megapixels`.
 * Non ingrandisce mai: se la foto e' gia' piu' piccola resta com'e'.
 *
 * La usano anche le interfacce, per scrivere "3024x4032 -> 1224x1632"
 * accanto al cursore senza dover elaborare davvero l'immagine.
 */
export function targetSize(width, height, megapixels) {
  const scale = Math.min(1, Math.sqrt((megapixels * 1e6) / (width * height)));
  return {
    scale,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Il colore delle bande: il piu' scuro della tavolozza.
 *
 * Nero, quando la tavolozza ce l'ha, ed e' quasi sempre cosi'. Prenderlo
 * dalla tavolozza invece di scrivere 0,0,0 vuol dire che anche una tavolozza
 * senza nero, un duotono per esempio, ottiene bande di un colore che il file
 * puo' davvero contenere.
 */
function coloreBanda(colors) {
  let scelto = colors[0] || [0, 0, 0];
  let minimo = Infinity;
  for (const c of colors) {
    const l = luma(c[0], c[1], c[2]);
    if (l < minimo) {
      minimo = l;
      scelto = c;
    }
  }
  return scelto;
}
