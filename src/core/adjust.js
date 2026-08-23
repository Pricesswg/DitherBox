/**
 * Pre-elaborazione dell'immagine prima del dithering.
 * Formato immagine usato ovunque nel progetto:
 *   { width, height, data: Uint8ClampedArray }  con data in RGBA.
 * E' esattamente la forma di un ImageData del canvas, quindi nel browser
 * si passa direttamente l'oggetto senza conversioni.
 */

/** Coefficienti Rec. 709: la luminanza percepita, non la media dei canali. */
export const LUMA_R = 0.2126;
export const LUMA_G = 0.7152;
export const LUMA_B = 0.0722;

export function luma(r, g, b) {
  return LUMA_R * r + LUMA_G * g + LUMA_B * b;
}

export function createImage(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneImage(img) {
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
  };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Regolazioni tonali, applicate in place nell'ordine:
 * esposizione -> contrasto -> gamma -> saturazione -> inversione.
 *
 * @param {number} brightness -100..100
 * @param {number} contrast   -100..100
 * @param {number} gamma      0.1..3   (>1 schiarisce i mezzitoni)
 * @param {number} saturation -100..100 (-100 = bianco e nero)
 */
export function applyAdjustments(img, opts = {}) {
  const {
    brightness = 0,
    contrast = 0,
    gamma = 1,
    saturation = 0,
    invert = false,
  } = opts;

  const bAdd = (brightness / 100) * 255;
  const c = Math.max(-255, Math.min(255, (contrast / 100) * 255));
  const cFactor = (259 * (c + 255)) / (255 * (259 - c));
  const invGamma = 1 / Math.max(0.01, gamma);
  const sat = 1 + saturation / 100;

  // Tabella di lookup: brightness/contrast/gamma dipendono solo dal valore
  // del canale, quindi si precalcolano una volta sola per tutti i pixel.
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let v = i + bAdd;
    v = cFactor * (v - 128) + 128;
    v = 255 * Math.pow(clamp255(v) / 255, invGamma);
    lut[i] = invert ? 255 - v : v;
  }

  const d = img.data;
  const needsSat = Math.abs(saturation) > 0.001;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]];
    let g = lut[d[i + 1]];
    let b = lut[d[i + 2]];
    if (needsSat) {
      const l = luma(r, g, b);
      r = clamp255(l + (r - l) * sat);
      g = clamp255(l + (g - l) * sat);
      b = clamp255(l + (b - l) * sat);
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  return img;
}

/**
 * Maschera di contrasto 3x3. Sulle foto da fotocamera aiuta parecchio:
 * il dithering mangia i dettagli fini, un filo di sharpen li tiene su.
 * @param {number} amount 0..200 (percentuale)
 */
export function sharpen(img, amount) {
  if (!amount) return img;
  const k = amount / 100;
  const { width: w, height: h, data } = img;
  const src = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        // Media dei 4 vicini ortogonali, con i bordi che ripiegano sul centro.
        const c = src[i + ch];
        const up = y > 0 ? src[i - w * 4 + ch] : c;
        const dn = y < h - 1 ? src[i + w * 4 + ch] : c;
        const lf = x > 0 ? src[i - 4 + ch] : c;
        const rt = x < w - 1 ? src[i + 4 + ch] : c;
        const blur = (up + dn + lf + rt) / 4;
        data[i + ch] = clamp255(c + (c - blur) * k);
      }
    }
  }
  return img;
}

/**
 * Riduce l'immagine di un fattore intero facendo la media dei blocchi.
 * E' il passo che da' il "pixelone" da gioco anni '80: si dithera a bassa
 * risoluzione e poi si ringrandisce a blocchi netti.
 */
export function downscaleByFactor(img, factor) {
  const f = Math.max(1, Math.round(factor));
  if (f === 1) return cloneImage(img);
  const w = Math.max(1, Math.floor(img.width / f));
  const h = Math.max(1, Math.floor(img.height / f));
  return resampleBox(img, w, h);
}

/** Ringrandisce di un fattore intero senza interpolare: pixel netti. */
export function upscaleByFactor(img, factor) {
  const f = Math.max(1, Math.round(factor));
  if (f === 1) return cloneImage(img);
  const w = img.width * f;
  const h = img.height * f;
  const out = createImage(w, h);
  const src = img.data;
  const dst = out.data;
  for (let y = 0; y < h; y++) {
    const sy = (y / f) | 0;
    for (let x = 0; x < w; x++) {
      const sx = (x / f) | 0;
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return out;
}

/**
 * Ricampionamento a media di area (box filter). Buono in riduzione,
 * che e' l'unico caso in cui lo usiamo.
 */
export function resampleBox(img, targetW, targetH) {
  const w = Math.max(1, Math.round(targetW));
  const h = Math.max(1, Math.round(targetH));
  if (w === img.width && h === img.height) return cloneImage(img);

  const out = createImage(w, h);
  const src = img.data;
  const dst = out.data;
  const xRatio = img.width / w;
  const yRatio = img.height / h;

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.min(img.height, Math.ceil((y + 1) * yRatio)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.ceil((x + 1) * xRatio)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const si = (sy * img.width + sx) * 4;
          r += src[si];
          g += src[si + 1];
          b += src[si + 2];
          a += src[si + 3];
          n++;
        }
      }
      const di = (y * w + x) * 4;
      dst[di] = r / n;
      dst[di + 1] = g / n;
      dst[di + 2] = b / n;
      dst[di + 3] = a / n;
    }
  }
  return out;
}

/** Riduce l'immagine perche' stia dentro maxW x maxH, mantenendo le proporzioni. */
export function fitWithin(img, maxW, maxH) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  if (scale >= 1) return cloneImage(img);
  return resampleBox(img, Math.round(img.width * scale), Math.round(img.height * scale));
}

/** Istogramma della luminanza su `bins` bande: alimenta il visualizzatore. */
export function lumaHistogram(img, bins = 16) {
  const out = new Float64Array(bins);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = luma(d[i], d[i + 1], d[i + 2]);
    const b = Math.min(bins - 1, ((l / 256) * bins) | 0);
    out[b]++;
  }
  const max = Math.max(...out, 1);
  return Array.from(out, (v) => v / max);
}
