/**
 * Il motore vero e proprio: quantizzazione su palette + dithering.
 *
 * Due strade a seconda della palette:
 *  - palette "rampa" (B/N, grigi, Game Boy, fosfori): si lavora sul solo
 *    canale di luminanza. E' il comportamento giusto per le scale tonali,
 *    perche' un rosso saturo deve finire sul gradino scuro, non sul verde
 *    che gli capita piu' vicino in distanza RGB.
 *  - palette a colori (CGA, PICO-8, C64, ZX): si lavora sui tre canali.
 */

import { ORDERED_MATRICES, DIFFUSION_KERNELS } from './matrices.js';
import { createImage, luma } from './adjust.js';

export const ORDERED_ALGORITHMS = Object.keys(ORDERED_MATRICES);
export const DIFFUSION_ALGORITHMS = Object.keys(DIFFUSION_KERNELS);

export const ALGORITHMS = [
  'none',
  'random',
  ...ORDERED_ALGORITHMS,
  ...DIFFUSION_ALGORITHMS,
];

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Prepara le strutture di ricerca per una palette.
 * `spread` e' la distanza media fra colori adiacenti: e' l'ampiezza naturale
 * del rumore ordinato, quella che riempie esattamente il buco fra due livelli.
 */
export function buildQuantizer(colors, ramp) {
  const n = colors.length;
  if (n < 2) throw new Error('La palette deve avere almeno due colori');
  const lumas = colors.map(([r, g, b]) => luma(r, g, b));

  if (ramp) {
    // Ordina per luminanza e costruisci una LUT 256 -> indice palette.
    const order = lumas.map((l, i) => i).sort((a, b) => lumas[a] - lumas[b]);
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      let best = order[0];
      let bestD = Infinity;
      for (const idx of order) {
        const d = Math.abs(lumas[idx] - v);
        if (d < bestD) {
          bestD = d;
          best = idx;
        }
      }
      lut[v] = best;
    }
    let gap = 0;
    for (let i = 1; i < order.length; i++) gap += lumas[order[i]] - lumas[order[i - 1]];
    const spread = order.length > 1 ? gap / (order.length - 1) : 255;
    return {
      ramp: true,
      colors,
      lumas,
      spread,
      nearestLuma: (l) => lut[clamp255(l) | 0],
    };
  }

  // Palette a colori: ricerca esaustiva con memoria sui 15 bit alti dell'RGB.
  const cache = new Int16Array(32768).fill(-1);
  const nearestRGB = (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key];
    if (hit >= 0) return hit;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const c = colors[i];
      const dr = r - c[0];
      const dg = g - c[1];
      const db = b - c[2];
      // Pesi percettivi: l'occhio perdona molto di piu' un errore sul blu.
      const d = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    cache[key] = best;
    return best;
  };

  let sum = 0;
  for (let i = 0; i < n; i++) {
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = colors[i];
      const b = colors[j];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d < bestD) bestD = d;
    }
    sum += bestD;
  }
  // La distanza euclidea su tre canali si riporta a "per canale" dividendo
  // per radice di 3, che e' l'unita' in cui ragiona la matrice di soglia.
  const spread = sum / n / Math.sqrt(3);

  return { ramp: false, colors, lumas, spread, nearestRGB };
}

/**
 * Applica il dithering. Non modifica l'immagine di partenza.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {object} opts
 * @param {string} opts.algorithm     una chiave di ALGORITHMS
 * @param {Array}  opts.colors        palette risolta (terne rgb)
 * @param {boolean} opts.ramp         true se la palette e' una scala tonale
 * @param {number} opts.strength      0..2, quanta parte dell'errore/rumore applicare
 * @param {number} opts.bias          -100..100, sposta la soglia (piu' chiaro/scuro)
 * @param {number} opts.noise         0..100, grana casuale aggiunta prima della soglia
 * @param {boolean} opts.serpentine   scansione a serpentina (riduce le strisciate)
 */
export function ditherImage(img, opts) {
  const {
    algorithm = 'floydSteinberg',
    colors,
    ramp = false,
    strength = 1,
    bias = 0,
    noise = 0,
    serpentine = true,
    quantizer,
  } = opts;

  const q = quantizer || buildQuantizer(colors, ramp);
  const out = createImage(img.width, img.height);
  const biasValue = (bias / 100) * 127.5;
  const noiseAmp = (noise / 100) * q.spread;

  if (algorithm in DIFFUSION_KERNELS) {
    diffuse(img, out, q, DIFFUSION_KERNELS[algorithm], {
      strength, biasValue, noiseAmp, serpentine,
    });
  } else {
    const matrix = algorithm in ORDERED_MATRICES ? ORDERED_MATRICES[algorithm]() : null;
    ordered(img, out, q, matrix, { algorithm, strength, biasValue, noiseAmp });
  }
  return out;
}

/** Soglia semplice, rumore casuale o matrice ordinata: nessuna memoria fra pixel. */
function ordered(img, out, q, matrix, { algorithm, strength, biasValue, noiseAmp }) {
  const { width: w, height: h } = img;
  const src = img.data;
  const dst = out.data;
  const size = matrix ? matrix.length : 0;
  const amp = q.spread * strength;
  const pal = q.colors;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let offset = biasValue;
      if (matrix) offset += (matrix[y % size][x % size] - 0.5) * amp;
      else if (algorithm === 'random') offset += (Math.random() - 0.5) * amp;
      if (noiseAmp) offset += (Math.random() - 0.5) * noiseAmp;

      let idx;
      if (q.ramp) {
        idx = q.nearestLuma(luma(src[i], src[i + 1], src[i + 2]) + offset);
      } else {
        idx = q.nearestRGB(
          clamp255(src[i] + offset) | 0,
          clamp255(src[i + 1] + offset) | 0,
          clamp255(src[i + 2] + offset) | 0,
        );
      }
      const c = pal[idx];
      dst[i] = c[0];
      dst[i + 1] = c[1];
      dst[i + 2] = c[2];
      dst[i + 3] = src[i + 3];
    }
  }
}

/** Diffusione dell'errore, con scansione opzionale a serpentina. */
function diffuse(img, out, q, kernel, { strength, biasValue, noiseAmp, serpentine }) {
  const { width: w, height: h } = img;
  const src = img.data;
  const dst = out.data;
  const pal = q.colors;
  const { points, divisor } = kernel;
  const k = strength / divisor;

  // Buffer in virgola mobile: l'errore accumulato deve poter uscire da 0..255,
  // altrimenti le zone piatte si saturano e compaiono le bande.
  const channels = q.ramp ? 1 : 3;
  const buf = new Float32Array(w * h * channels);
  if (q.ramp) {
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      buf[p] = luma(src[i], src[i + 1], src[i + 2]) + biasValue;
    }
  } else {
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      buf[p * 3] = src[i] + biasValue;
      buf[p * 3 + 1] = src[i + 1] + biasValue;
      buf[p * 3 + 2] = src[i + 2] + biasValue;
    }
  }

  for (let y = 0; y < h; y++) {
    const rightward = !serpentine || y % 2 === 0;
    const xStart = rightward ? 0 : w - 1;
    const xEnd = rightward ? w : -1;
    const xStep = rightward ? 1 : -1;

    for (let x = xStart; x !== xEnd; x += xStep) {
      const p = y * w + x;
      const i = p * 4;
      const jitter = noiseAmp ? (Math.random() - 0.5) * noiseAmp : 0;

      let idx;
      let e0 = 0, e1 = 0, e2 = 0;
      if (q.ramp) {
        const v = buf[p] + jitter;
        idx = q.nearestLuma(v);
        e0 = v - q.lumas[idx];
      } else {
        const r = buf[p * 3] + jitter;
        const g = buf[p * 3 + 1] + jitter;
        const b = buf[p * 3 + 2] + jitter;
        idx = q.nearestRGB(clamp255(r) | 0, clamp255(g) | 0, clamp255(b) | 0);
        const c = pal[idx];
        e0 = r - c[0];
        e1 = g - c[1];
        e2 = b - c[2];
      }

      const c = pal[idx];
      dst[i] = c[0];
      dst[i + 1] = c[1];
      dst[i + 2] = c[2];
      dst[i + 3] = src[i + 3];

      for (let n = 0; n < points.length; n++) {
        const [rawDx, dy, weight] = points[n];
        // A serpentina il kernel va specchiato, se no l'errore viene
        // spinto sempre dalla stessa parte e l'immagine "scivola".
        const dx = rightward ? rawDx : -rawDx;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        const f = weight * k;
        if (q.ramp) {
          buf[np] += e0 * f;
        } else {
          buf[np * 3] += e0 * f;
          buf[np * 3 + 1] += e1 * f;
          buf[np * 3 + 2] += e2 * f;
        }
      }
    }
  }
}
