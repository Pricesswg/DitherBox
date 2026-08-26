/**
 * La pipeline completa, condivisa da widget web e app da terminale.
 */

import {
  applyAdjustments, sharpen, downscaleByFactor, upscaleByFactor,
  resampleBox, cloneImage, selectionFrame, cropRect, padToAspect, padFrame, luma,
} from './adjust.js';
import { buildQuantizer, ditherImage } from './dither.js';
import { paletteInfo } from './palettes.js';
import { normalizeOptions, aspectRatio } from './options.js';

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} source
 * @param {object} rawOptions vedi PARAMS in options.js
 * @returns {{image:object, options:object, palette:Array, ditherWidth:number, ditherHeight:number}}
 */
/**
 * Le misure chieste a mano, col lato mancante dedotto, o null se non se ne
 * e' chiesta nessuna.
 *
 * Chiedere una misura decide anche il rapporto: 1920x1080 e' 16:9, e non
 * avrebbe senso ritagliare a 4:3 per poi stiracchiare. Quando c'e', quindi,
 * il rapporto lo detta lei.
 */
export function requestedSize(sourceWidth, sourceHeight, options) {
  const w = Math.max(0, Math.round(options.width || 0));
  const h = Math.max(0, Math.round(options.height || 0));
  if (!w && !h) return null;

  const ratio = aspectRatio(options.aspect) || (sourceWidth / sourceHeight);
  if (w && h) return { width: w, height: h };
  if (w) return { width: w, height: Math.max(1, Math.round(w / ratio)) };
  return { width: Math.max(1, Math.round(h * ratio)), height: h };
}

/**
 * Le misure a cui portare l'immagine prima che Pixel la riduca a blocchi.
 *
 * Con una misura chiesta a mano non si passa dai megapixel, e si ingrandisce
 * anche: chi scrive 1920 su una foto piccola quel numero lo vuole.
 *
 * Pixel complica: a 3x il file esce per forza multiplo di tre, perche' i
 * blocchi sono interi. Si punta quindi al multiplo piu' vicino invece di
 * mancare la misura sempre per difetto. A Pixel 1, che e' il caso normale,
 * la misura chiesta si ottiene esatta.
 */
export function resampleTarget(frameWidth, frameHeight, chieste, options) {
  if (!chieste) return targetSize(frameWidth, frameHeight, options.megapixels);

  const f = Math.max(1, Math.round(options.scale));
  // Senza ingrandimento il file e' l'immagine a blocchi, quindi per ottenere
  // la misura chiesta bisogna partire da f volte tanto.
  const quantizza = (v) => (options.upscale || f === 1
    ? Math.max(f, Math.round(v / f) * f)
    : Math.max(1, v * f));

  const width = quantizza(chieste.width);
  const height = quantizza(chieste.height);
  return { scale: width / frameWidth, width, height };
}

export function processImage(source, rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const { colors, ramp, bits } = paletteInfo(options.palette);

  // 0. Inquadratura. Il ritaglio si fa subito, perche' quello che si butta
  //    via non deve consumare ne' megapixel ne' tempo; le bande si mettono
  //    invece alla fine, dopo il dithering, per non ditherarle.
  const chieste = requestedSize(source.width, source.height, options);
  // Una misura chiesta a mano detta anche il rapporto: 1920x1080 e' 16:9.
  const ratio = chieste ? chieste.width / chieste.height : aspectRatio(options.aspect);
  const ritaglia = ratio !== null && options.fit === 'crop';
  const bande = ratio !== null && options.fit === 'pad';
  // La selezione prende le proporzioni del rapporto quando si ritaglia e
  // quelle della foto quando si mettono le bande, cosi' zoom e posizioni
  // hanno un senso in tutti e due i casi.
  const sel = selectionFrame(source.width, source.height, {
    ratio: ritaglia ? ratio : null,
    zoom: options.zoom,
    alignX: options.alignX,
    alignY: options.alignY,
  });
  const inquadrata = cropRect(source, sel);

  // 1. Riduzione alla risoluzione richiesta. E' anche il motivo per cui le
  //    foto da fotocamera non fanno arrancare l'interfaccia: si lavora su
  //    due megapixel, non su dodici.
  //    Il budget si misura sul fotogramma con le bande gia' contate: senza,
  //    "2 MP" descriverebbe la fotografia e il file ne peserebbe di piu'.
  const frame = bande ? padFrame(inquadrata.width, inquadrata.height, ratio) : inquadrata;
  const target = resampleTarget(frame.width, frame.height, chieste, options);
  // Coi megapixel non si ingrandisce mai; con una misura chiesta a mano si',
  // perche' e' stata chiesta.
  let img = target.scale < 1 || chieste
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
  if (bande) {
    image = padToAspect(image, ratio, coloreBanda(colors), options.alignX, options.alignY);
  }

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
  const chieste = requestedSize(width, height, options);
  const ratio = chieste ? chieste.width / chieste.height : aspectRatio(options.aspect);
  const ritaglia = ratio !== null && options.fit === 'crop';
  const bande = ratio !== null && options.fit === 'pad';

  const sel = selectionFrame(width, height, {
    ratio: ritaglia ? ratio : null,
    zoom: options.zoom,
    alignX: options.alignX,
    alignY: options.alignY,
  });
  let { width: w, height: h } = sel;

  const frame = bande ? padFrame(w, h, ratio) : { width: w, height: h };
  const { scale } = resampleTarget(frame.width, frame.height, chieste, options);
  if (scale < 1 || chieste) {
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
