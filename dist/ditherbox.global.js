/* DitherBox — build singolo file. Generato da scripts/build.js: non modificarlo a mano. */
(function (global) {
'use strict';

const __m_src_core_palettes_js = (() => {

/**
 * Tavolozze colori.
 * Ogni palette e' un array di terne [r, g, b] (0-255).
 * L'ordine conta solo per la leggibilita': il quantizzatore cerca sempre
 * il colore piu' vicino in distanza euclidea pesata sulla percezione.
 */

/** Legge #rgb o #rrggbb (con o senza cancelletto) in una terna 0-255. */
const hex = (s) => {
  const body = s.startsWith('#') ? s.slice(1) : s;
  // La forma corta raddoppia ogni cifra: #f0a diventa #ff00aa.
  const full = body.length === 3 ? body.replace(/./g, (c) => c + c) : body;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

/** Costruisce una scala di grigi con `levels` livelli equispaziati. */
function grayRamp(levels) {
  const out = [];
  for (let i = 0; i < levels; i++) {
    const v = Math.round((i * 255) / (levels - 1));
    out.push([v, v, v]);
  }
  return out;
}

/** Monitor a fosfori: dal nero al colore del fosforo, `levels` gradini. */
function phosphor(color, levels) {
  const [r, g, b] = hex(color);
  const out = [];
  for (let i = 0; i < levels; i++) {
    const t = i / (levels - 1);
    out.push([Math.round(r * t), Math.round(g * t), Math.round(b * t)]);
  }
  return out;
}

const PALETTES = {
  bw: {
    ramp: true,
    label: '1-bit B/N',
    colors: [[0, 0, 0], [255, 255, 255]],
  },
  gray4: { ramp: true, label: 'Grigi 4', colors: grayRamp(4) },
  gray8: { ramp: true, label: 'Grigi 8', colors: grayRamp(8) },
  gray16: { ramp: true, label: 'Grigi 16', colors: grayRamp(16) },
  gameboy: {
    ramp: true,
    label: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'].map(hex),
  },
  gameboyPocket: {
    ramp: true,
    label: 'GB Pocket',
    colors: ['#181818', '#4a4a4a', '#8c8c8c', '#c5c5c5'].map(hex),
  },
  cgaCyan: {
    label: 'CGA ciano',
    colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'].map(hex),
  },
  cgaGreen: {
    label: 'CGA verde',
    colors: ['#000000', '#55ff55', '#ff5555', '#ffff55'].map(hex),
  },
  pico8: {
    label: 'PICO-8',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751',
      '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436',
      '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ].map(hex),
  },
  c64: {
    label: 'C64',
    colors: [
      '#000000', '#ffffff', '#880000', '#aaffee',
      '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
      '#dd8855', '#664400', '#ff7777', '#333333',
      '#777777', '#aaff66', '#0088ff', '#bbbbbb',
    ].map(hex),
  },
  zx: {
    label: 'ZX Spectrum',
    colors: [
      '#000000', '#0000d7', '#d70000', '#d700d7',
      '#00d700', '#00d7d7', '#d7d700', '#d7d7d7',
      '#0000ff', '#ff0000', '#ff00ff', '#00ff00',
      '#00ffff', '#ffff00', '#ffffff',
    ].map(hex),
  },
  greenCrt: { ramp: true, label: 'CRT verde', colors: phosphor('#33ff66', 4) },
  amberCrt: { ramp: true, label: 'CRT ambra', colors: phosphor('#ffb000', 4) },

  // Marathon (Bungie, 2025). L'art director la chiama "graphic realism":
  // rosa e gialli iper-saturi che spiccano su blu acciaio freddi e neri
  // profondi, senza sfumature. Regge bene il dithering proprio perche' i
  // colori sono pochi e lontanissimi fra loro.
  marathon: {
    // Rampa, non palette a colori: i suoi otto colori, ordinati per
    // luminanza, salgono regolari dal nero al bianco sporco. Mappandoci
    // sopra la luminanza si ottengono le fasce piatte di colore del gioco;
    // cercando invece il colore RGB piu' vicino si ottengono coriandoli.
    ramp: true,
    label: 'Marathon',
    colors: [
      '#0a0c10', '#29324f', '#01ffff', '#59b41d',
      '#c2fe0b', '#ff2d95', '#ff0d1a', '#f4f1e8',
    ].map(hex),
  },
  // Due sole tinte, per il taglio da manifesto.
  marathonDuo: {
    ramp: true,
    label: 'Marathon duo',
    colors: ['#0a0c10', '#c2fe0b'].map(hex),
  },
  // I terminali del Marathon del 1994: verde su nero, con quel filo di
  // verde acceso sulle lettere.
  marathonTerm: {
    ramp: true,
    label: 'Marathon 94',
    colors: ['#04120a', '#0d3b1e', '#1f7a3d', '#3dff7a'].map(hex),
  },
  risograph: {
    label: 'Risografia',
    colors: ['#1d1a2e', '#0078bf', '#ff48b0', '#f5f1e6'].map(hex),
  },
  blueprint: {
    ramp: true,
    label: 'Cianografia',
    colors: ['#0b2545', '#13315c', '#8da9c4', '#eef4ed'].map(hex),
  },
};

const PALETTE_KEYS = Object.keys(PALETTES);

const HEX_RE = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Vero se la stringa e' un elenco di colori esadecimali separati da virgola,
 * cioe' una palette scritta a mano: "#0a0c10,#c2fe0b".
 *
 * E' il formato che usiamo ovunque per le palette personalizzate: sta in un
 * attributo data-*, in una riga di config.toml e in un argomento della riga
 * di comando senza bisogno di trattamenti diversi.
 */
function isCustomPalette(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 && parts.every((p) => HEX_RE.test(p));
}

/** Trasforma un elenco di colori in stringa: l'inverso di isCustomPalette. */
function stringifyPalette(colors) {
  return colors.map((c) => (typeof c === 'string' ? c : rgbToHex(c))).join(',');
}

/** Legge una stringa "#aabbcc,#ddeeff" in un elenco di terne. */
function parseCustomPalette(value) {
  return value.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => hex(s));
}

/**
 * Risolve l'opzione `palette` in un array di colori.
 * Accetta la chiave di una palette predefinita, un elenco di esadecimali
 * separati da virgola, oppure un array gia' pronto.
 */
function resolvePalette(palette) {
  if (Array.isArray(palette)) {
    return palette.map((c) => (typeof c === 'string' ? hex(c) : c.slice(0, 3)));
  }
  if (isCustomPalette(palette)) return parseCustomPalette(palette);
  const entry = PALETTES[palette];
  if (!entry) throw new Error(`Palette sconosciuta: ${palette}`);
  return entry.colors;
}



/** Converte una terna in stringa esadecimale, per la UI. */
function rgbToHex([r, g, b]) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Come `resolvePalette`, ma restituisce anche se la palette e' una rampa
 * di luminanza (nel qual caso conviene quantizzare sul canale luma).
 */
function paletteInfo(palette) {
  const colors = resolvePalette(palette);
  let ramp;
  if (typeof palette === 'string' && PALETTES[palette]) {
    ramp = !!PALETTES[palette].ramp;
  } else {
    // Una palette scritta a mano viene trattata come scala tonale quando i
    // suoi colori stanno quasi in fila per luminanza: e' il caso del duotono
    // e delle rampe, dove mappare sul grigio da' un risultato molto migliore
    // che cercare il colore piu' vicino.
    ramp = isMonotoneRamp(colors);
  }
  return { colors, ramp };
}

/**
 * Vero se i colori, ordinati per luminanza, stanno quasi su una retta nello
 * spazio RGB: allora sono gradini di una stessa tinta, non colori distinti.
 */
function isMonotoneRamp(colors) {
  if (colors.length <= 2) return true;
  const byLuma = [...colors].sort(
    (a, b) => (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2])
      - (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]),
  );
  const first = byLuma[0];
  const last = byLuma[byLuma.length - 1];
  const axis = [last[0] - first[0], last[1] - first[1], last[2] - first[2]];
  const axisLen = Math.hypot(...axis) || 1;

  for (const c of byLuma) {
    const v = [c[0] - first[0], c[1] - first[1], c[2] - first[2]];
    const t = (v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]) / (axisLen * axisLen);
    // Distanza dal segmento che unisce il colore piu' scuro al piu' chiaro.
    const scarto = Math.hypot(
      v[0] - t * axis[0], v[1] - t * axis[1], v[2] - t * axis[2],
    );
    if (scarto > axisLen * 0.16) return false;
  }
  return true;
}

  return { PALETTES, PALETTE_KEYS, grayRamp, hexToRgb: hex, isCustomPalette, paletteInfo, parseCustomPalette, resolvePalette, rgbToHex, stringifyPalette };
})();

const __m_src_core_matrices_js = (() => {

/**
 * Matrici di soglia (dithering ordinato) e kernel di diffusione dell'errore.
 */

/**
 * Genera ricorsivamente una matrice di Bayer di lato `size` (potenza di 2).
 * I valori sono normalizzati in [0, 1).
 */
function bayerMatrix(size) {
  if (size === 1) return [[0]];
  const half = bayerMatrix(size / 2);
  const n = size / 2;
  const out = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = half[y][x] * 4;
      out[y][x] = v;
      out[y][x + n] = v + 2;
      out[y + n][x] = v + 3;
      out[y + n][x + n] = v + 1;
    }
  }
  return out;
}

/** Normalizza una matrice intera in [0, 1). */
function normalize(m) {
  const size = m.length;
  const max = size * size;
  return m.map((row) => row.map((v) => v / max));
}

const bayerCache = new Map();
function bayer(size) {
  if (!bayerCache.has(size)) bayerCache.set(size, normalize(bayerMatrix(size)));
  return bayerCache.get(size);
}

/** Retino a punti raggruppati 4x4 (effetto rotocalco). */
const CLUSTER4 = [
  [12, 5, 6, 13],
  [4, 0, 1, 7],
  [11, 3, 2, 8],
  [15, 10, 9, 14],
];

/** Retino a punti raggruppati 8x8 (punto piu' grosso, molto "stampa"). */
const CLUSTER8 = [
  [24, 10, 12, 26, 35, 47, 49, 37],
  [8, 0, 2, 14, 45, 59, 61, 51],
  [22, 6, 4, 16, 43, 57, 63, 53],
  [30, 20, 18, 28, 33, 41, 55, 39],
  [34, 46, 48, 36, 25, 11, 13, 27],
  [44, 58, 60, 50, 9, 1, 3, 15],
  [42, 56, 62, 52, 23, 7, 5, 17],
  [32, 40, 54, 38, 31, 21, 19, 29],
];

/** Matrice a linee diagonali: da' un effetto "incisione". */
const LINES4 = [
  [0, 4, 8, 12],
  [12, 0, 4, 8],
  [8, 12, 0, 4],
  [4, 8, 12, 0],
];

const ORDERED_MATRICES = {
  bayer2: () => bayer(2),
  bayer4: () => bayer(4),
  bayer8: () => bayer(8),
  bayer16: () => bayer(16),
  cluster4: () => normalize(CLUSTER4),
  cluster8: () => normalize(CLUSTER8),
  lines4: () => normalize(LINES4),
};

/**
 * Kernel di diffusione dell'errore.
 * Ogni voce: [dx, dy, peso]. La somma dei pesi e' `divisor`.
 * dy = 0 significa "stessa riga, a destra"; dy > 0 righe successive.
 */
const DIFFUSION_KERNELS = {
  floydSteinberg: {
    divisor: 16,
    points: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
  },
  falseFloydSteinberg: {
    divisor: 8,
    points: [
      [1, 0, 3],
      [0, 1, 3],
      [1, 1, 2],
    ],
  },
  atkinson: {
    // Diffonde solo 6/8 dell'errore: contrasto piu' alto, il look Mac classico.
    divisor: 8,
    points: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
  jarvis: {
    divisor: 48,
    points: [
      [1, 0, 7], [2, 0, 5],
      [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
      [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1],
    ],
  },
  stucki: {
    divisor: 42,
    points: [
      [1, 0, 8], [2, 0, 4],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
      [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1],
    ],
  },
  burkes: {
    divisor: 32,
    points: [
      [1, 0, 8], [2, 0, 4],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
    ],
  },
  sierra: {
    divisor: 32,
    points: [
      [1, 0, 5], [2, 0, 3],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
      [-1, 2, 2], [0, 2, 3], [1, 2, 2],
    ],
  },
  sierra2: {
    divisor: 16,
    points: [
      [1, 0, 4], [2, 0, 3],
      [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1],
    ],
  },
  sierraLite: {
    divisor: 4,
    points: [
      [1, 0, 2],
      [-1, 1, 1],
      [0, 1, 1],
    ],
  },
  stevensonArce: {
    divisor: 200,
    points: [
      [2, 0, 32],
      [-3, 1, 12], [-1, 1, 26], [1, 1, 30], [3, 1, 16],
      [-2, 2, 12], [0, 2, 26], [2, 2, 12],
      [-3, 3, 5], [-1, 3, 12], [1, 3, 12], [3, 3, 5],
    ],
  },
};

  return { DIFFUSION_KERNELS, ORDERED_MATRICES, bayer, bayerMatrix };
})();

const __m_src_core_adjust_js = (() => {

/**
 * Pre-elaborazione dell'immagine prima del dithering.
 * Formato immagine usato ovunque nel progetto:
 *   { width, height, data: Uint8ClampedArray }  con data in RGBA.
 * E' esattamente la forma di un ImageData del canvas, quindi nel browser
 * si passa direttamente l'oggetto senza conversioni.
 */

/** Coefficienti Rec. 709: la luminanza percepita, non la media dei canali. */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

function luma(r, g, b) {
  return LUMA_R * r + LUMA_G * g + LUMA_B * b;
}

function createImage(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function cloneImage(img) {
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
function applyAdjustments(img, opts = {}) {
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
function sharpen(img, amount) {
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
function downscaleByFactor(img, factor) {
  const f = Math.max(1, Math.round(factor));
  if (f === 1) return cloneImage(img);
  const w = Math.max(1, Math.floor(img.width / f));
  const h = Math.max(1, Math.floor(img.height / f));
  return resampleBox(img, w, h);
}

/** Ringrandisce di un fattore intero senza interpolare: pixel netti. */
function upscaleByFactor(img, factor) {
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
function resampleBox(img, targetW, targetH) {
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
function fitWithin(img, maxW, maxH) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  if (scale >= 1) return cloneImage(img);
  return resampleBox(img, Math.round(img.width * scale), Math.round(img.height * scale));
}

/** Istogramma della luminanza su `bins` bande: alimenta il visualizzatore. */
function lumaHistogram(img, bins = 16) {
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

  return { LUMA_B, LUMA_G, LUMA_R, applyAdjustments, cloneImage, createImage, downscaleByFactor, fitWithin, luma, lumaHistogram, resampleBox, sharpen, upscaleByFactor };
})();

const __m_src_core_dither_js = (() => {
  const { ORDERED_MATRICES, DIFFUSION_KERNELS } = __m_src_core_matrices_js;
  const { createImage, luma } = __m_src_core_adjust_js;
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




const ORDERED_ALGORITHMS = Object.keys(ORDERED_MATRICES);
const DIFFUSION_ALGORITHMS = Object.keys(DIFFUSION_KERNELS);

/** Etichette leggibili, condivise da interfaccia web e TUI. */
const ALGORITHM_LABELS = {
  none: 'Nessuno (soglia)',
  random: 'Rumore casuale',
  bayer2: 'Bayer 2x2',
  bayer4: 'Bayer 4x4',
  bayer8: 'Bayer 8x8',
  bayer16: 'Bayer 16x16',
  cluster4: 'Retino 4x4',
  cluster8: 'Retino 8x8',
  lines4: 'Linee diagonali',
  floydSteinberg: 'Floyd-Steinberg',
  falseFloydSteinberg: 'Floyd-Steinberg light',
  atkinson: 'Atkinson',
  jarvis: 'Jarvis-Judice-Ninke',
  stucki: 'Stucki',
  burkes: 'Burkes',
  sierra: 'Sierra',
  sierra2: 'Sierra 2 righe',
  sierraLite: 'Sierra lite',
  stevensonArce: 'Stevenson-Arce',
};

const ALGORITHMS = [
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
function buildQuantizer(colors, ramp) {
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
function ditherImage(img, opts) {
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

  return { ALGORITHMS, ALGORITHM_LABELS, DIFFUSION_ALGORITHMS, ORDERED_ALGORITHMS, buildQuantizer, ditherImage };
})();

const __m_src_core_options_js = (() => {
  const { ALGORITHMS, ALGORITHM_LABELS } = __m_src_core_dither_js;
  const { PALETTES, PALETTE_KEYS, isCustomPalette } = __m_src_core_palettes_js;
/**
 * Schema dei parametri, definito una volta sola.
 * Sia il widget web sia la TUI costruiscono i propri controlli iterando
 * questa lista: aggiungere un parametro qui lo fa comparire in entrambi.
 */




/** @typedef {'enum'|'range'|'bool'} ParamType */

const PARAMS = [
  {
    key: 'palette',
    label: 'Palette',
    group: 'dither',
    type: 'enum',
    values: PALETTE_KEYS,
    labels: Object.fromEntries(PALETTE_KEYS.map((k) => [k, PALETTES[k].label])),
    default: 'bw',
  },
  {
    key: 'algorithm',
    label: 'Algoritmo',
    group: 'dither',
    type: 'enum',
    values: ALGORITHMS,
    labels: ALGORITHM_LABELS,
    default: 'floydSteinberg',
  },
  {
    key: 'scale',
    label: 'Pixel',
    group: 'dither',
    type: 'range',
    min: 1,
    max: 16,
    step: 1,
    default: 1,
    unit: 'x',
    hint: 'Riduce prima di ditherare: 1 = dettaglio pieno, 8 = pixelone da 8 bit',
  },
  {
    key: 'strength',
    label: 'Intensità',
    group: 'dither',
    type: 'range',
    min: 0,
    max: 200,
    step: 5,
    default: 100,
    unit: '%',
    hint: 'Quanta parte dell’errore (o del rumore ordinato) viene applicata',
  },
  {
    key: 'bias',
    label: 'Soglia',
    group: 'dither',
    type: 'range',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
    hint: 'Sposta il punto di taglio: negativo scurisce, positivo schiarisce',
  },
  {
    key: 'noise',
    label: 'Grana',
    group: 'dither',
    type: 'range',
    min: 0,
    max: 100,
    step: 1,
    default: 0,
    unit: '%',
    hint: 'Rumore casuale prima della soglia: rompe le bande troppo regolari',
  },
  {
    key: 'serpentine',
    label: 'Serpentina',
    group: 'dither',
    type: 'bool',
    default: true,
    hint: 'Scansione alternata riga per riga: elimina le strisciate diagonali',
  },

  {
    key: 'brightness',
    label: 'Luminosità',
    group: 'tone',
    type: 'range',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
  },
  {
    key: 'contrast',
    label: 'Contrasto',
    group: 'tone',
    type: 'range',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
  },
  {
    key: 'gamma',
    label: 'Gamma',
    group: 'tone',
    type: 'range',
    min: 0.2,
    max: 3,
    step: 0.05,
    default: 1,
    decimals: 2,
  },
  {
    key: 'saturation',
    label: 'Saturazione',
    group: 'tone',
    type: 'range',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
  },
  {
    key: 'sharpen',
    label: 'Nitidezza',
    group: 'tone',
    type: 'range',
    min: 0,
    max: 200,
    step: 5,
    default: 0,
    unit: '%',
    hint: 'Maschera di contrasto: recupera i dettagli che il dithering mangia',
  },
  {
    key: 'invert',
    label: 'Inverti',
    group: 'tone',
    type: 'bool',
    default: false,
  },

  {
    key: 'megapixels',
    label: 'Megapixel',
    group: 'output',
    type: 'range',
    // Gradini scelti a mano invece di un intervallo regolare: fra 0.01 e 24
    // megapixel ci sono tre ordini di grandezza, e un cursore lineare
    // schiaccerebbe tutta la meta' bassa - proprio quella dove si sgrana
    // davvero l'immagine - nei primi millimetri di corsa.
    steps: [
      0.01, 0.015, 0.02, 0.03, 0.05, 0.07,
      0.1, 0.15, 0.2, 0.3, 0.5, 0.7,
      1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24,
    ],
    default: 2,
    format: formatMegapixels,
    hint: 'Risoluzione del risultato: abbassala per sgranare di proposito la foto',
  },
  {
    key: 'upscale',
    label: 'Ringrandisci',
    group: 'output',
    type: 'bool',
    default: true,
    hint: 'Riporta il risultato alla dimensione di prima con pixel netti',
  },
];

// I parametri con gradini espliciti ricavano da li' i propri estremi:
// il resto del codice puo' continuare a leggere min e max senza saperlo.
for (const p of PARAMS) {
  if (p.steps) {
    p.min = p.steps[0];
    p.max = p.steps[p.steps.length - 1];
  }
}

const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

const GROUP_LABELS = {
  dither: 'DITHER',
  tone: 'TONO',
  output: 'OUTPUT',
};

const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.key, p.default]));

/** Preset pronti: la stessa lista alimenta il menu web e il picker della TUI. */
const PRESETS = {
  macintosh: {
    label: 'Macintosh 1984',
    options: { palette: 'bw', algorithm: 'atkinson', contrast: 15, sharpen: 40 },
  },
  giornale: {
    label: 'Giornale',
    options: { palette: 'bw', algorithm: 'cluster8', scale: 2, contrast: 20 },
  },
  gameboy: {
    label: 'Game Boy',
    options: { palette: 'gameboy', algorithm: 'bayer4', scale: 4, contrast: 10 },
  },
  fanzine: {
    label: 'Fanzine fotocopiata',
    options: { palette: 'bw', algorithm: 'bayer8', contrast: 45, sharpen: 80, noise: 8 },
  },
  terminale: {
    label: 'Terminale a fosfori',
    options: { palette: 'greenCrt', algorithm: 'bayer4', scale: 2, contrast: 25 },
  },
  arcade: {
    label: 'Arcade 16 colori',
    options: { palette: 'pico8', algorithm: 'floydSteinberg', scale: 3, saturation: 25 },
  },
  cga: {
    label: 'CGA 1981',
    options: { palette: 'cgaCyan', algorithm: 'bayer4', scale: 3, saturation: 20 },
  },
  incisione: {
    label: 'Incisione',
    options: { palette: 'bw', algorithm: 'lines4', contrast: 30, sharpen: 60 },
  },
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function formatMegapixels(v) {
  if (v < 0.1) return `${Math.round(v * 1000)} kpx`;
  if (v < 1) return `${v.toFixed(2).replace(/0$/, '')} MP`;
  if (v < 10) return `${v.toFixed(1).replace(/\.0$/, '')} MP`;
  return `${v.toFixed(0)} MP`;
}

const stepsCache = new WeakMap();

/**
 * I valori che un cursore puo' assumere, in ordine.
 *
 * Web e terminale lavorano tutti e due su questo elenco per indice: cosi'
 * un passo di tastiera e uno di mouse portano esattamente allo stesso
 * valore, e le scale logaritmiche non hanno bisogno di codice a parte.
 */
function paramSteps(param) {
  if (param.type !== 'range') return null;
  const memoria = stepsCache.get(param);
  if (memoria) return memoria;

  let values;
  if (param.steps) {
    values = param.steps;
  } else {
    const decimali = (String(param.step).split('.')[1] || '').length;
    values = [];
    for (let v = param.min; v <= param.max + param.step / 1000; v += param.step) {
      values.push(Number(v.toFixed(decimali)));
    }
    if (values[values.length - 1] !== param.max) values.push(param.max);
  }
  stepsCache.set(param, values);
  return values;
}

/** L'indice del passo piu' vicino a `value`. */
function stepIndex(param, value) {
  const steps = paramSteps(param);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i] - value);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Sposta un parametro di `delta` passi, restando dentro l'intervallo. */
function stepBy(param, value, delta) {
  const steps = paramSteps(param);
  const i = clamp(stepIndex(param, value) + delta, 0, steps.length - 1);
  return steps[i];
}

/**
 * Riempie i valori mancanti coi default e riporta ogni parametro nel
 * suo intervallo. Nessuna eccezione per un valore fuori scala: viene
 * semplicemente tagliato, cosi' la UI non puo' mai mettere il motore in crisi.
 */
function normalizeOptions(input = {}) {
  const out = { ...DEFAULTS, ...input };
  for (const p of PARAMS) {
    const v = out[p.key];
    if (p.type === 'range') {
      const n = Number(v);
      // Il valore viene agganciato al passo piu' vicino: cosi' quello che
      // arriva da un attributo HTML o da un file di configurazione e' sempre
      // uno dei valori che i cursori sanno rappresentare.
      out[p.key] = Number.isFinite(n) ? stepBy(p, clamp(n, p.min, p.max), 0) : p.default;
    } else if (p.type === 'bool') {
      out[p.key] = Boolean(v);
    } else if (p.type === 'enum') {
      // Una palette scritta a mano (array o elenco di esadecimali) passa
      // indenne: non e' uno dei nomi predefiniti ed e' giusto cosi'.
      if (p.key === 'palette' && (Array.isArray(v) || isCustomPalette(v))) continue;
      if (!p.values.includes(v)) out[p.key] = p.default;
    }
  }
  return out;
}

/** Testo del valore di un parametro, usato identico da web e terminale. */
function formatValue(param, value) {
  if (param.type === 'bool') return value ? 'ON' : 'OFF';
  if (param.type === 'enum') {
    if (isCustomPalette(value)) return 'Personalizzata';
    return (param.labels && param.labels[value]) || String(value);
  }
  if (param.format) return param.format(Number(value));
  const n = Number(value);
  const text = param.decimals ? n.toFixed(param.decimals) : String(Math.round(n));
  return param.unit ? `${text}${param.unit}` : text;
}

/** Applica un preset sopra i default, restituendo opzioni complete. */
function applyPreset(name, base = DEFAULTS) {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Preset sconosciuto: ${name}`);
  return normalizeOptions({ ...base, ...preset.options });
}

  return { DEFAULTS, GROUP_LABELS, PARAMS, PARAM_BY_KEY, PRESETS, applyPreset, formatValue, normalizeOptions, paramSteps, stepBy, stepIndex };
})();

const __m_src_core_process_js = (() => {
  const { applyAdjustments, sharpen, downscaleByFactor, upscaleByFactor, resampleBox, cloneImage } = __m_src_core_adjust_js;
  const { buildQuantizer, ditherImage } = __m_src_core_dither_js;
  const { paletteInfo } = __m_src_core_palettes_js;
  const { normalizeOptions } = __m_src_core_options_js;
/**
 * La pipeline completa, condivisa da widget web e app da terminale.
 */






/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} source
 * @param {object} rawOptions vedi PARAMS in options.js
 * @returns {{image:object, options:object, palette:Array, ditherWidth:number, ditherHeight:number}}
 */
function processImage(source, rawOptions = {}) {
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
function targetSize(width, height, megapixels) {
  const scale = Math.min(1, Math.sqrt((megapixels * 1e6) / (width * height)));
  return {
    scale,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

  return { processImage, targetSize };
})();

const __m_src_core_index_js = Object.assign({}, __m_src_core_palettes_js, __m_src_core_matrices_js, __m_src_core_adjust_js, __m_src_core_dither_js, __m_src_core_options_js, __m_src_core_process_js);

const __m_src_web_ditherbox_js = (() => {
  const { PARAMS, GROUP_LABELS, PRESETS, DEFAULTS, PALETTES, normalizeOptions, formatValue, applyPreset, paramSteps, stepIndex, processImage, targetSize, resampleBox, fitWithin, paletteInfo, rgbToHex, stringifyPalette, isCustomPalette } = __m_src_core_index_js;
/**
 * DitherBox - widget per il browser.
 *
 * Nessuna dipendenza, nessun accesso al DOM al momento dell'import: il modulo
 * si puo' importare anche in un contesto server (Astro SSR) senza esplodere,
 * perche' tutto quello che tocca il documento sta dentro il costruttore.
 *
 *   import { DitherBox } from './src/web/ditherbox.js';
 *   const box = new DitherBox('#dither');
 */



const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  return node;
}

/**
 * Legge un File/Blob/URL in un oggetto disegnabile, rispettando
 * l'orientamento EXIF: le foto da telefono arrivano quasi sempre ruotate.
 */
async function decodeSource(source) {
  if (typeof createImageBitmap === 'function' && (source instanceof Blob)) {
    try {
      return await createImageBitmap(source, { imageOrientation: 'from-image' });
    } catch {
      // Safari piu' vecchi non conoscono imageOrientation: si riprova liscio.
      try {
        return await createImageBitmap(source);
      } catch { /* si passa al percorso con <img> */ }
    }
  }
  const url = source instanceof Blob ? URL.createObjectURL(source) : source;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Immagine non leggibile'));
      img.src = url;
    });
    return img;
  } finally {
    if (source instanceof Blob) URL.revokeObjectURL(url);
  }
}

/** Estrae gli ImageData da una sorgente gia' decodificata. */
function toImageData(drawable) {
  const w = drawable.naturalWidth || drawable.width;
  const h = drawable.naturalHeight || drawable.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(drawable, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

class DitherBox {
  /**
   * @param {HTMLElement|string} target elemento o selettore
   * @param {object} config
   * @param {object} [config.options]        opzioni iniziali (vedi PARAMS)
   * @param {number} [config.previewMaxSize] lato massimo usato per l anteprima
   * @param {boolean} [config.presets]       mostra la barra dei preset
   * @param {string}  [config.src]           immagine da caricare all avvio
   * @param {string}  [config.downloadName]  nome del file scaricato
   */
  constructor(target, config = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) throw new Error(`DitherBox: elemento non trovato (${target})`);

    this.root = root;
    this.config = {
      previewMaxSize: 900,
      presets: true,
      downloadName: 'ditherbox.png',
      ...config,
    };
    this.options = normalizeOptions(config.options);
    this.source = null;        // ImageData a piena risoluzione
    this.previewBase = null;   // copia ridotta, base di tutte le anteprime
    this.previewCache = null;  // { megapixels, image } per non ricampionare a vuoto
    this.sourceName = null;
    this.listeners = { change: [], load: [], error: [] };
    this.controls = new Map();
    this.customColors = ['#0a0c10', '#c2fe0b'];
    this._pending = null;

    this.#build();
    if (config.src) this.load(config.src).catch((e) => this.#fail(e));
  }

  // ---------------------------------------------------------------- API

  /** Carica un File, un Blob o un URL. */
  async load(source, name) {
    this.#status('Carico…');
    try {
      const drawable = await decodeSource(source);
      this.source = toImageData(drawable);
      if (drawable.close) drawable.close();
      // Base dell'anteprima: si calcola una volta sola al caricamento, cosi'
      // muovere un cursore non costa mai un ricampionamento della foto intera.
      this.previewBase = fitWithin(
        this.source, this.config.previewMaxSize, this.config.previewMaxSize,
      );
      this.previewCache = null;
      this.sourceName = name || (source instanceof File ? source.name : null);
      this.root.classList.add('is-loaded');
      if (this.fileName) this.fileName.textContent = this.sourceName || 'immagine caricata';
      this.render();
      this.#emit('load', { width: this.source.width, height: this.source.height });
    } catch (err) {
      this.#fail(err);
      throw err;
    }
  }

  /** Aggiorna una o piu' opzioni e ridisegna. */
  set(patch) {
    this.options = normalizeOptions({ ...this.options, ...patch });
    this.#syncControls();
    this.render();
    this.#emit('change', this.getOptions());
  }

  getOptions() {
    return { ...this.options };
  }

  /** Torna ai valori di partenza. */
  reset() {
    this.set({ ...DEFAULTS, ...(this.config.options || {}) });
  }

  /** Ricalcola l anteprima. Debounced: gli slider sparano decine di eventi. */
  render() {
    if (!this.previewBase) return;
    if (this._pending) cancelAnimationFrame(this._pending);
    this._pending = requestAnimationFrame(() => {
      this._pending = null;
      this.#draw();
    });
  }

  /**
   * Elabora a piena risoluzione e restituisce il canvas del risultato.
   * L anteprima lavora ridotta; l export no.
   */
  renderFull() {
    if (!this.source) throw new Error('Nessuna immagine caricata');
    const { image } = processImage(this.source, this.options);
    return this.#toCanvas(image);
  }

  /** @returns {Promise<Blob>} il PNG a piena risoluzione. */
  toBlob(type = 'image/png', quality) {
    const canvas = this.renderFull();
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Export fallito'))),
        type,
        quality,
      );
    });
  }

  /** Scarica il risultato come PNG. */
  async download(filename) {
    this.#status('Preparo il PNG…');
    const blob = await this.toBlob();
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = filename || this.#defaultFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.render();
  }

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  }

  /** Smonta il widget e libera i listener. */
  destroy() {
    if (this._pending) cancelAnimationFrame(this._pending);
    for (const [event, fn] of this._rootListeners || []) {
      this.root.removeEventListener(event, fn);
    }
    this.root.replaceChildren();
    this.root.classList.remove('dbx', 'is-loaded', 'is-dragging');
  }

  // ------------------------------------------------------- costruzione UI

  #build() {
    const root = this.root;
    root.classList.add('dbx');
    root.replaceChildren();

    root.append(this.#buildStage(), this.#buildPanel());
    this.#wireDropZone();
    this.#syncControls();
  }

  #buildStage() {
    const stage = el('div', 'dbx__stage');
    this.canvas = el('canvas', 'dbx__canvas');
    this.ctx = this.canvas.getContext('2d');
    stage.appendChild(this.canvas);

    const drop = el('div', 'dbx__drop');
    const invito = el('button', 'dbx__drop-button', {
      type: 'button', text: 'Scegli una foto',
    });
    invito.addEventListener('click', () => this.fileInput.click());
    drop.append(
      this.#cameraIcon(),
      el('p', 'dbx__drop-title', { text: 'Trascina qui una foto' }),
      invito,
      el('p', 'dbx__drop-sub', {
        text: 'oppure incollala con Ctrl+V — l’immagine non lascia il tuo browser',
      }),
    );
    stage.appendChild(drop);

    this.statusEl = el('div', 'dbx__status', { role: 'status', 'aria-live': 'polite' });
    stage.appendChild(this.statusEl);
    return stage;
  }

  /**
   * Il pannello e' diviso in tre fasce: la sorgente in cima e le azioni in
   * fondo restano sempre visibili, solo i parametri scorrono. Prima scorreva
   * tutto, e su schermi bassi il pulsante per aprire la foto finiva sotto il
   * taglio: c'era, ma nessuno lo trovava.
   */
  #buildPanel() {
    const panel = el('div', 'dbx__panel');
    panel.append(this.#buildSourceBar(), this.#buildScroller(), this.#buildActions());
    return panel;
  }

  #buildSourceBar() {
    const bar = el('div', 'dbx__source');

    // Il campo file vero, dentro una label: cosi' il clic funziona su tutta
    // la riga e la tastiera ci arriva senza trucchi.
    const field = el('label', 'dbx__file-field');
    this.fileInput = el('input', 'dbx__file-input', { type: 'file', accept: 'image/*' });
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files && this.fileInput.files[0];
      if (file) this.load(file).catch(() => {});
      this.fileInput.value = '';
    });
    this.fileName = el('span', 'dbx__file-name', { text: 'nessun file scelto' });
    field.append(
      this.fileInput,
      el('span', 'dbx__file-label', { text: 'Apri foto' }),
      this.fileName,
    );
    bar.appendChild(field);

    this.cameraInput = el('input', 'dbx__file-input', {
      type: 'file', accept: 'image/*', capture: 'environment',
    });
    this.cameraInput.addEventListener('change', () => {
      const file = this.cameraInput.files && this.cameraInput.files[0];
      if (file) this.load(file).catch(() => {});
      this.cameraInput.value = '';
    });
    const shoot = el('button', 'dbx__button dbx__button--camera', {
      type: 'button', text: 'Scatta', title: 'Scatta una foto con la fotocamera',
    });
    shoot.addEventListener('click', () => this.cameraInput.click());
    bar.append(shoot, this.cameraInput);

    return bar;
  }

  #buildScroller() {
    const scroller = el('div', 'dbx__scroll');

    if (this.config.presets) {
      scroller.appendChild(this.#buildSection('Preset', this.#buildPresetChips()));
    }
    scroller.appendChild(this.#buildSection('Colori', this.#buildPaletteChips()));

    const groups = new Map();
    for (const param of PARAMS) {
      // La palette ha gia' il suo selettore a campioni qui sopra.
      if (param.key === 'palette') continue;
      if (!groups.has(param.group)) {
        const body = el('div', 'dbx__controls');
        groups.set(param.group, body);
        scroller.appendChild(this.#buildSection(GROUP_LABELS[param.group] || param.group, body));
      }
      groups.get(param.group).appendChild(this.#buildControl(param));
    }
    return scroller;
  }

  #buildSection(title, body) {
    const section = el('section', 'dbx__group');
    section.append(el('h3', 'dbx__group-title', { text: title }), body);
    return section;
  }

  #buildPresetChips() {
    const bar = el('div', 'dbx__chips');
    for (const [key, preset] of Object.entries(PRESETS)) {
      const b = el('button', 'dbx__chip', { type: 'button', text: preset.label });
      b.addEventListener('click', () => this.set(applyPreset(key, this.options)));
      bar.appendChild(b);
    }
    return bar;
  }

  /**
   * Selettore delle palette a campioni di colore: un elenco a discesa non
   * dice niente, mentre qui si sceglie guardando le tinte.
   */
  #buildPaletteChips() {
    const wrap = el('div', 'dbx__palettes');
    this.paletteButtons = new Map();

    const aggiungi = (key, label, colors) => {
      const b = el('button', 'dbx__palette', { type: 'button', title: label });
      const swatch = el('span', 'dbx__swatch');
      for (const c of colors.slice(0, 8)) {
        const dot = el('span', 'dbx__swatch-dot');
        dot.style.background = typeof c === 'string' ? c : rgbToHex(c);
        swatch.appendChild(dot);
      }
      b.append(swatch, el('span', 'dbx__palette-name', { text: label }));
      b.addEventListener('click', () => this.set({ palette: key }));
      wrap.appendChild(b);
      this.paletteButtons.set(key, b);
      return b;
    };

    for (const [key, entry] of Object.entries(PALETTES)) {
      aggiungi(key, entry.label, entry.colors);
    }

    // Voce personalizzata: si aggiorna insieme all'editor qui sotto.
    this.customButton = aggiungi('__custom__', 'Su misura', this.customColors);
    this.customButton.addEventListener('click', () => {
      this.set({ palette: stringifyPalette(this.customColors) });
    });

    wrap.appendChild(this.#buildCustomEditor());
    return wrap;
  }

  /** Editor della palette personalizzata: una fila di selettori colore. */
  #buildCustomEditor() {
    const editor = el('div', 'dbx__custom');
    this.customList = el('div', 'dbx__custom-list');

    const ridisegna = () => {
      this.customList.replaceChildren();
      this.customColors.forEach((colore, i) => {
        const cella = el('span', 'dbx__custom-cell');
        const input = el('input', 'dbx__custom-color', { type: 'color', value: colore });
        input.addEventListener('input', () => {
          this.customColors[i] = input.value;
          this.#refreshCustomSwatch();
          this.set({ palette: stringifyPalette(this.customColors) });
        });
        cella.appendChild(input);

        if (this.customColors.length > 2) {
          const togli = el('button', 'dbx__custom-remove', {
            type: 'button', text: '×', title: 'Togli questo colore',
          });
          togli.addEventListener('click', () => {
            this.customColors.splice(i, 1);
            ridisegna();
            this.#refreshCustomSwatch();
            this.set({ palette: stringifyPalette(this.customColors) });
          });
          cella.appendChild(togli);
        }
        this.customList.appendChild(cella);
      });
    };

    const aggiungi = el('button', 'dbx__custom-add', {
      type: 'button', text: '+', title: 'Aggiungi un colore',
    });
    aggiungi.addEventListener('click', () => {
      if (this.customColors.length >= 16) return;
      this.customColors.push('#888888');
      ridisegna();
      this.#refreshCustomSwatch();
      this.set({ palette: stringifyPalette(this.customColors) });
    });

    // Riempie l'editor coi colori della palette selezionata: e' il modo piu'
    // naturale di partire da una predefinita e poi ritoccarla.
    const copia = el('button', 'dbx__custom-add', {
      type: 'button', text: '⧉', title: 'Copia qui i colori della palette scelta',
    });
    copia.addEventListener('click', () => {
      const { colors } = paletteInfo(this.options.palette);
      this.customColors = colors.slice(0, 16).map(rgbToHex);
      ridisegna();
      this.#refreshCustomSwatch();
      this.set({ palette: stringifyPalette(this.customColors) });
    });

    this._redrawCustom = ridisegna;
    ridisegna();
    editor.append(this.customList, aggiungi, copia);
    return editor;
  }

  #refreshCustomSwatch() {
    if (!this.customButton) return;
    const swatch = this.customButton.querySelector('.dbx__swatch');
    swatch.replaceChildren();
    for (const c of this.customColors.slice(0, 8)) {
      const dot = el('span', 'dbx__swatch-dot');
      dot.style.background = c;
      swatch.appendChild(dot);
    }
  }

  #buildControl(param) {
    const id = `dbx-${param.key}-${Math.random().toString(36).slice(2, 7)}`;
    const wrap = el('div', `dbx__control dbx__control--${param.type}`);
    const label = el('label', 'dbx__label', { for: id, text: param.label });
    if (param.hint) label.title = param.hint;
    wrap.appendChild(label);

    let input;
    let value = null;

    if (param.type === 'enum') {
      input = el('select', 'dbx__select', { id });
      for (const v of param.values) {
        input.appendChild(el('option', null, {
          value: v, text: (param.labels && param.labels[v]) || v,
        }));
      }
      input.addEventListener('change', () => this.set({ [param.key]: input.value }));
    } else if (param.type === 'bool') {
      input = el('input', 'dbx__checkbox', { id, type: 'checkbox' });
      input.addEventListener('change', () => this.set({ [param.key]: input.checked }));
    } else {
      // Il cursore lavora sull'indice del passo, non sul valore: e' l'unico
      // modo per far scorrere allo stesso modo una scala regolare e una a
      // gradini scelti a mano come quella dei megapixel.
      const steps = paramSteps(param);
      input = el('input', 'dbx__range', {
        id, type: 'range', min: 0, max: steps.length - 1, step: 1,
      });
      value = el('output', 'dbx__value', { for: id });
      input.addEventListener('input', () => {
        this.set({ [param.key]: steps[Number(input.value)] });
      });
      label.addEventListener('dblclick', () => this.set({ [param.key]: param.default }));
    }

    if (param.hint) input.title = param.hint;
    wrap.appendChild(input);
    if (value) wrap.appendChild(value);

    this.controls.set(param.key, { param, input, value });
    return wrap;
  }

  #buildActions() {
    const actions = el('div', 'dbx__actions');

    const save = el('button', 'dbx__button dbx__button--primary', {
      type: 'button', text: 'Scarica PNG',
    });
    save.addEventListener('click', () => this.download().catch((e) => this.#fail(e)));

    const reset = el('button', 'dbx__button dbx__button--ghost', {
      type: 'button', text: 'Azzera',
    });
    reset.addEventListener('click', () => this.reset());

    actions.append(save, reset);
    return actions;
  }

  #cameraIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'dbx__drop-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linejoin', 'round');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '13');
    circle.setAttribute('r', '3.5');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '1.5');
    svg.append(path, circle);
    return svg;
  }

  #wireDropZone() {
    const root = this.root;
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const listeners = [
      ['dragenter', (e) => { stop(e); root.classList.add('is-dragging'); }],
      ['dragover', (e) => { stop(e); root.classList.add('is-dragging'); }],
      ['dragleave', (e) => {
        stop(e);
        if (!root.contains(e.relatedTarget)) root.classList.remove('is-dragging');
      }],
      ['drop', (e) => {
        stop(e);
        root.classList.remove('is-dragging');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          this.#fail(new Error('Quel file non è un’immagine'));
          return;
        }
        this.load(file).catch(() => {});
      }],
      ['paste', (e) => {
        const item = [...(e.clipboardData ? e.clipboardData.items : [])]
          .find((it) => it.type.startsWith('image/'));
        if (item) this.load(item.getAsFile()).catch(() => {});
      }],
    ];
    for (const [event, fn] of listeners) root.addEventListener(event, fn);
    this._rootListeners = listeners;
  }

  // ------------------------------------------------------------ interni

  #syncControls() {
    for (const [key, { param, input, value }] of this.controls) {
      const v = this.options[key];
      if (param.type === 'bool') input.checked = Boolean(v);
      else if (param.type === 'range') input.value = stepIndex(param, v);
      else input.value = v;
      if (value) value.textContent = formatValue(param, v);
    }

    if (this.paletteButtons) {
      const attiva = isCustomPalette(this.options.palette)
        ? '__custom__'
        : this.options.palette;
      for (const [key, button] of this.paletteButtons) {
        button.classList.toggle('is-active', key === attiva);
        button.setAttribute('aria-pressed', String(key === attiva));
      }
    }
  }

  /**
   * L'immagine su cui lavora l'anteprima.
   *
   * Deve subire la stessa riduzione in megapixel del risultato finale, se no
   * l'anteprima resta nitida mentre il file scaricato esce sgranato: si
   * sceglierebbe alla cieca.
   */
  #previewSource() {
    const { megapixels } = this.options;
    if (this.previewCache && this.previewCache.megapixels === megapixels) {
      return this.previewCache.image;
    }
    const target = targetSize(this.source.width, this.source.height, megapixels);
    const base = this.previewBase;
    const k = Math.min(1, base.width / target.width, base.height / target.height);
    const image = k < 1 || target.width < base.width
      ? resampleBox(
        base,
        Math.max(1, Math.round(target.width * k)),
        Math.max(1, Math.round(target.height * k)),
      )
      : base;
    this.previewCache = { megapixels, image };
    return image;
  }

  #draw() {
    const started = performance.now();
    const source = this.#previewSource();
    // I megapixel li ha gia' applicati #previewSource: qui si dice al motore
    // di non ridurre una seconda volta.
    const { image } = processImage(source, {
      ...this.options,
      megapixels: (source.width * source.height) / 1e6,
    });
    this.ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    this.#showCanvas(image);

    const out = targetSize(this.source.width, this.source.height, this.options.megapixels);
    const mp = ((out.width * out.height) / 1e6).toFixed(2);
    const ms = Math.round(performance.now() - started);
    this.#status(
      `${this.source.width}×${this.source.height} → ${out.width}×${out.height} (${mp} MP) · ${ms} ms`,
    );
  }

  #showCanvas(image) {
    if (this.canvas.width !== image.width || this.canvas.height !== image.height) {
      this.canvas.width = image.width;
      this.canvas.height = image.height;
      this.ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    }
  }

  #toCanvas(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').putImageData(
      new ImageData(image.data, image.width, image.height), 0, 0,
    );
    return canvas;
  }

  #defaultFilename() {
    const base = this.sourceName
      ? this.sourceName.replace(/\.[^.]+$/, '')
      : 'ditherbox';
    const palette = isCustomPalette(this.options.palette) ? 'custom' : this.options.palette;
    return `${base}-${palette}-${this.options.algorithm}.png`;
  }

  #status(text) {
    if (this.statusEl) this.statusEl.textContent = text || '';
  }

  #fail(err) {
    this.#status(`Errore: ${err.message}`);
    this.#emit('error', err);
  }

  #emit(event, payload) {
    for (const fn of this.listeners[event] || []) {
      try {
        fn(payload, this);
      } catch (e) {
        console.error('[DitherBox] listener in errore', e);
      }
    }
  }
}

/**
 * Funzione secca, per chi vuole solo ditherare un'immagine senza interfaccia.
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} drawable
 * @returns {HTMLCanvasElement}
 */
function ditherToCanvas(drawable, options = {}) {
  const { image } = processImage(toImageData(drawable), options);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(
    new ImageData(image.data, image.width, image.height), 0, 0,
  );
  return canvas;
}

/**
 * Aggancia automaticamente ogni elemento con `data-ditherbox`.
 * Gli attributi `data-*` diventano opzioni: data-palette, data-algorithm, ...
 * Per una palette personalizzata basta un elenco di colori:
 * `data-palette="#0a0c10,#c2fe0b"`.
 */
function autoInit(scope = document) {
  const boxes = [];
  for (const node of scope.querySelectorAll('[data-ditherbox]')) {
    if (node.dataset.dbxReady) continue;
    node.dataset.dbxReady = '1';
    const options = {};
    for (const param of PARAMS) {
      const raw = node.dataset[param.key];
      if (raw === undefined) continue;
      if (param.type === 'range') options[param.key] = Number(raw);
      else if (param.type === 'bool') options[param.key] = raw !== 'false';
      else options[param.key] = raw;
    }
    boxes.push(new DitherBox(node, { options, src: node.dataset.src || undefined }));
  }
  return boxes;
}




  return { DEFAULTS, DitherBox, PALETTES, PARAMS, PRESETS, autoInit, ditherToCanvas, processImage };
})();

global.DitherBox = Object.assign(__m_src_web_ditherbox_js.DitherBox, {
  ALGORITHMS: __m_src_core_index_js.ALGORITHMS,
  ALGORITHM_LABELS: __m_src_core_index_js.ALGORITHM_LABELS,
  DEFAULTS: __m_src_core_index_js.DEFAULTS,
  DIFFUSION_ALGORITHMS: __m_src_core_index_js.DIFFUSION_ALGORITHMS,
  DIFFUSION_KERNELS: __m_src_core_index_js.DIFFUSION_KERNELS,
  GROUP_LABELS: __m_src_core_index_js.GROUP_LABELS,
  LUMA_B: __m_src_core_index_js.LUMA_B,
  LUMA_G: __m_src_core_index_js.LUMA_G,
  LUMA_R: __m_src_core_index_js.LUMA_R,
  ORDERED_ALGORITHMS: __m_src_core_index_js.ORDERED_ALGORITHMS,
  ORDERED_MATRICES: __m_src_core_index_js.ORDERED_MATRICES,
  PALETTES: __m_src_core_index_js.PALETTES,
  PALETTE_KEYS: __m_src_core_index_js.PALETTE_KEYS,
  PARAMS: __m_src_core_index_js.PARAMS,
  PARAM_BY_KEY: __m_src_core_index_js.PARAM_BY_KEY,
  PRESETS: __m_src_core_index_js.PRESETS,
  applyAdjustments: __m_src_core_index_js.applyAdjustments,
  applyPreset: __m_src_core_index_js.applyPreset,
  bayer: __m_src_core_index_js.bayer,
  bayerMatrix: __m_src_core_index_js.bayerMatrix,
  buildQuantizer: __m_src_core_index_js.buildQuantizer,
  cloneImage: __m_src_core_index_js.cloneImage,
  createImage: __m_src_core_index_js.createImage,
  ditherImage: __m_src_core_index_js.ditherImage,
  downscaleByFactor: __m_src_core_index_js.downscaleByFactor,
  fitWithin: __m_src_core_index_js.fitWithin,
  formatValue: __m_src_core_index_js.formatValue,
  grayRamp: __m_src_core_index_js.grayRamp,
  hexToRgb: __m_src_core_index_js.hexToRgb,
  isCustomPalette: __m_src_core_index_js.isCustomPalette,
  luma: __m_src_core_index_js.luma,
  lumaHistogram: __m_src_core_index_js.lumaHistogram,
  normalizeOptions: __m_src_core_index_js.normalizeOptions,
  paletteInfo: __m_src_core_index_js.paletteInfo,
  paramSteps: __m_src_core_index_js.paramSteps,
  parseCustomPalette: __m_src_core_index_js.parseCustomPalette,
  processImage: __m_src_core_index_js.processImage,
  resampleBox: __m_src_core_index_js.resampleBox,
  resolvePalette: __m_src_core_index_js.resolvePalette,
  rgbToHex: __m_src_core_index_js.rgbToHex,
  sharpen: __m_src_core_index_js.sharpen,
  stepBy: __m_src_core_index_js.stepBy,
  stepIndex: __m_src_core_index_js.stepIndex,
  stringifyPalette: __m_src_core_index_js.stringifyPalette,
  targetSize: __m_src_core_index_js.targetSize,
  upscaleByFactor: __m_src_core_index_js.upscaleByFactor,
  DEFAULTS: __m_src_web_ditherbox_js.DEFAULTS,
  DitherBox: __m_src_web_ditherbox_js.DitherBox,
  PALETTES: __m_src_web_ditherbox_js.PALETTES,
  PARAMS: __m_src_web_ditherbox_js.PARAMS,
  PRESETS: __m_src_web_ditherbox_js.PRESETS,
  autoInit: __m_src_web_ditherbox_js.autoInit,
  ditherToCanvas: __m_src_web_ditherbox_js.ditherToCanvas,
  processImage: __m_src_web_ditherbox_js.processImage
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
