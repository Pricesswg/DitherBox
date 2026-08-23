/**
 * La pipeline completa, condivisa da widget web e app da terminale.
 */

import {
  applyAdjustments, sharpen, downscaleByFactor, upscaleByFactor,
  fitWithin, cloneImage,
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
  const { colors, ramp } = paletteInfo(options.palette, options.inkPaper);

  // 1. Le foto da fotocamera sono enormi: si riduce subito, se no ogni
  //    spostamento di slider costa secondi.
  let img = fitWithin(source, options.maxSize, options.maxSize);

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
