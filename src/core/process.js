/**
 * La pipeline completa, condivisa da widget web e app da terminale.
 */

import {
  applyAdjustments, sharpen, downscaleByFactor, upscaleByFactor,
  resampleBox, cloneImage,
} from './adjust.js';
import { buildQuantizer, ditherImage } from './dither.js';
import { paletteInfo } from './palettes.js';
import { normalizeOptions } from './options.js';

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} source
 * @param {object} rawOptions vedi PARAMS in options.js
 * @returns {{image:object, options:object, palette:Array, ditherWidth:number, ditherHeight:number}}
 */
export function processImage(source, rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const { colors, ramp } = paletteInfo(options.palette);

  // 1. Riduzione alla risoluzione richiesta. E' anche il motivo per cui le
  //    foto da fotocamera non fanno arrancare l'interfaccia: si lavora su
  //    due megapixel, non su dodici.
  const target = targetSize(source.width, source.height, options.megapixels);
  let img = target.scale < 1
    ? resampleBox(source, target.width, target.height)
    : cloneImage(source);

  // 2. Regolazioni tonali sul pieno dettaglio, prima di buttare via pixel.
  applyAdjustments(img, options);
  if (options.sharpen) sharpen(img, options.sharpen);

  // 3. Riduzione a blocchi: e' questa che da' il pixellone.
  const small = downscaleByFactor(img, options.scale);

  // 4. Dithering.
  const quantizer = buildQuantizer(colors, ramp);
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
  const image = options.upscale && options.scale > 1
    ? upscaleByFactor(dithered, options.scale)
    : cloneImage(dithered);

  return {
    image,
    options,
    palette: colors,
    ditherWidth: dithered.width,
    ditherHeight: dithered.height,
  };
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
