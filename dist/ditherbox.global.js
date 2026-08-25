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

/**
 * Tutti i colori rappresentabili con `rb`, `gb`, `bb` bit per canale.
 *
 * E' cosi' che funzionava davvero l'hardware: non una tavolozza scelta a
 * mano ma un troncamento. Il colore a 8 bit del PC (3 bit di rosso, 3 di
 * verde, 2 di blu) e i nove bit del Mega Drive sono la stessa idea con
 * numeri diversi, quindi si scrivono una volta sola.
 *
 * Ogni livello viene riportato su tutta la scala 0-255, se no il bianco
 * non sarebbe bianco: con 3 bit i gradini sono 0, 36, 73 ... 255.
 */
function bitDepthPalette(rb, gb, bb) {
  const scala = (v, bits) => Math.round((v * 255) / ((1 << bits) - 1));
  const out = [];
  for (let r = 0; r < (1 << rb); r++) {
    for (let g = 0; g < (1 << gb); g++) {
      for (let b = 0; b < (1 << bb); b++) {
        out.push([scala(r, rb), scala(g, gb), scala(b, bb)]);
      }
    }
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
    colors: [[0, 0, 0], [255, 255, 255]],
  },
  gray4: { ramp: true, colors: grayRamp(4) },
  gray8: { ramp: true, colors: grayRamp(8) },
  gray16: { ramp: true, colors: grayRamp(16) },
  gameboy: {
    ramp: true,
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'].map(hex),
  },
  gameboyPocket: {
    ramp: true,
    colors: ['#181818', '#4a4a4a', '#8c8c8c', '#c5c5c5'].map(hex),
  },
  cgaCyan: {
    colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'].map(hex),
  },
  cgaGreen: {
    colors: ['#000000', '#55ff55', '#ff5555', '#ffff55'].map(hex),
  },
  pico8: {
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751',
      '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436',
      '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ].map(hex),
  },
  c64: {
    colors: [
      '#000000', '#ffffff', '#880000', '#aaffee',
      '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
      '#dd8855', '#664400', '#ff7777', '#333333',
      '#777777', '#aaff66', '#0088ff', '#bbbbbb',
    ].map(hex),
  },
  zx: {
    colors: [
      '#000000', '#0000d7', '#d70000', '#d700d7',
      '#00d700', '#00d7d7', '#d7d700', '#d7d7d7',
      '#0000ff', '#ff0000', '#ff00ff', '#00ff00',
      '#00ffff', '#ffff00', '#ffffff',
    ].map(hex),
  },
  greenCrt: { ramp: true, colors: phosphor('#33ff66', 4) },
  amberCrt: { ramp: true, colors: phosphor('#ffb000', 4) },

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
    colors: [
      '#0a0c10', '#29324f', '#01ffff', '#59b41d',
      '#c2fe0b', '#ff2d95', '#ff0d1a', '#f4f1e8',
    ].map(hex),
  },
  // Due sole tinte, per il taglio da manifesto.
  marathonDuo: {
    ramp: true,
    colors: ['#0a0c10', '#c2fe0b'].map(hex),
  },
  // I terminali del Marathon del 1994: verde su nero, con quel filo di
  // verde acceso sulle lettere.
  marathonTerm: {
    ramp: true,
    colors: ['#04120a', '#0d3b1e', '#1f7a3d', '#3dff7a'].map(hex),
  },
  // ------------------------------------------------- vecchie console e PC

  // NES / Famicom. La tavolozza non e' RGB: il chip generava il colore
  // modulando la portante NTSC, quindi ogni conversione in RGB e' una
  // resa. Questa e' la piu' diffusa, con i quattro livelli di luminosita'
  // per dodici tinte piu' i grigi.
  nes: {
    colors: [
      '#7c7c7c', '#0000fc', '#0000bc', '#4428bc',
      '#940084', '#a80020', '#a81000', '#881400',
      '#503000', '#007800', '#006800', '#005800',
      '#004058', '#000000',
      '#bcbcbc', '#0078f8', '#0058f8', '#6844fc',
      '#d800cc', '#e40058', '#f83800', '#e45c10',
      '#ac7c00', '#00b800', '#00a800', '#00a844',
      '#008888',
      '#f8f8f8', '#3cbcfc', '#6888fc', '#9878f8',
      '#f878f8', '#f85898', '#f87858', '#fca044',
      '#f8b800', '#b8f818', '#58d854', '#58f898',
      '#00e8d8', '#787878',
      '#fcfcfc', '#a4e4fc', '#b8b8f8', '#d8b8f8',
      '#f8b8f8', '#f8a4c0', '#f0d0b0', '#fce0a8',
      '#f8d878', '#d8f878', '#b8f8b8', '#b8f8d8',
      '#00fcfc', '#d8d8d8',
    ].map(hex),
  },

  // IBM EGA, 1984: i sedici colori nati dal cavo digitale a sei fili,
  // due bit per canale ma solo nelle combinazioni che il monitor accettava.
  ega: {
    colors: [
      '#000000', '#0000aa', '#00aa00', '#00aaaa',
      '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
      '#555555', '#5555ff', '#55ff55', '#55ffff',
      '#ff5555', '#ff55ff', '#ffff55', '#ffffff',
    ].map(hex),
  },

  // MSX1 e ColecoVision: il TMS9918 di Texas Instruments. Quindici colori
  // piu' il trasparente, con quei tre verdi che si riconoscono a occhio.
  msx: {
    colors: [
      '#000000', '#3eb849', '#74d07d', '#5955e0',
      '#8076f1', '#b95e51', '#65dbef', '#db6559',
      '#ff897d', '#ccc35e', '#ded087', '#3aa241',
      '#b766b5', '#cccccc', '#ffffff',
    ].map(hex),
  },

  // Teletext, Televideo, Ceefax: gli otto angoli del cubo RGB e nient'altro.
  // Niente mezze tinte, per questo il dithering ci si vede tantissimo.
  teletext: {
    colors: [
      '#000000', '#ff0000', '#00ff00', '#ffff00',
      '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
    ].map(hex),
  },

  // Amiga Workbench 1.3: quattro colori e basta, ed erano il sistema
  // operativo intero. Il blu e l'arancio insieme sono inconfondibili.
  amigaWb: {
    colors: ['#0055aa', '#000000', '#ffffff', '#ff8800'].map(hex),
  },

  // Virtual Boy: l'unico schermo che facesse solo rosso, in quattro livelli.
  virtualBoy: { ramp: true, colors: phosphor('#e00000', 4) },

  // Il vero colore a 8 bit: 3 bit di rosso, 3 di verde, 2 di blu. E' quello
  // che davano le schede prima del colore reale, e il blu piu' povero degli
  // altri e' voluto, non un errore: l'occhio ci vede meno.
  bit8: { bits: [3, 3, 2] },

  // Mega Drive / Genesis: nove bit, tre per canale, cioe' 512 colori.
  // E' la ragione per cui i giochi Sega hanno quel colore un po' spento
  // rispetto alle console coeve.
  megadrive: { bits: [3, 3, 3] },

  risograph: {
    colors: ['#1d1a2e', '#0078bf', '#ff48b0', '#f5f1e6'].map(hex),
  },
  blueprint: {
    ramp: true,
    colors: ['#0b2545', '#13315c', '#8da9c4', '#eef4ed'].map(hex),
  },
};

// Le palette dichiarate per profondita' di bit si materializzano subito.
// Farlo alla prima richiesta sembrava un risparmio, ma lasciava
// `entry.colors` a undefined per chiunque leggesse la tabella senza
// passare da resolvePalette: `--list` moriva proprio li'. Sono 768 terne
// in tutto, il risparmio non esisteva.
for (const entry of Object.values(PALETTES)) {
  if (!entry.colors && entry.bits) entry.colors = bitDepthPalette(...entry.bits);
}

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
  const bits = typeof palette === 'string' && PALETTES[palette]
    ? PALETTES[palette].bits
    : undefined;
  return { colors, ramp, bits };
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

  return { PALETTES, PALETTE_KEYS, bitDepthPalette, grayRamp, hexToRgb: hex, isCustomPalette, paletteInfo, parseCustomPalette, resolvePalette, rgbToHex, stringifyPalette };
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

/**
 * Le misure del fotogramma che porta `width`x`height` al rapporto `ratio`
 * senza tagliare niente: si allarga il lato che manca, mai si stringe.
 *
 * Serve a misurare le bande prima di averle: il budget di megapixel deve
 * contarle, altrimenti "2 MP" descrive la fotografia e non il file.
 */
function padFrame(width, height, ratio) {
  const corrente = width / height;
  if (corrente > ratio) return { width, height: Math.max(1, Math.round(width / ratio)) };
  if (corrente < ratio) return { width: Math.max(1, Math.round(height * ratio)), height };
  return { width, height };
}

/**
 * Le misure del ritaglio centrato che porta `width`x`height` a `ratio`.
 * Gemella di padFrame, e come quella esiste per poter misurare il
 * fotogramma senza costruirlo.
 */
function cropFrame(width, height, ratio) {
  const corrente = width / height;
  if (corrente > ratio) return { width: Math.max(1, Math.round(height * ratio)), height };
  if (corrente < ratio) return { width, height: Math.max(1, Math.round(width / ratio)) };
  return { width, height };
}

/**
 * Ritaglio centrato al rapporto `ratio` (larghezza / altezza).
 * Quello che avanza si perde: e' la cosa che ci si aspetta chiedendo 16:9.
 */
function cropToAspect(img, ratio) {
  const { width: w, height: h } = cropFrame(img.width, img.height, ratio);
  if (w === img.width && h === img.height) return cloneImage(img);

  const x0 = Math.floor((img.width - w) / 2);
  const y0 = Math.floor((img.height - h) / 2);
  const out = createImage(w, h);
  // Una riga per volta: sono contigue in memoria, quindi si copiano in blocco
  // invece che pixel per pixel.
  for (let y = 0; y < h; y++) {
    const da = ((y + y0) * img.width + x0) * 4;
    out.data.set(img.data.subarray(da, da + w * 4), y * w * 4);
  }
  return out;
}

/**
 * Bande centrate fino al rapporto `ratio`, del colore `colour`.
 *
 * Va chiamata *dopo* il dithering, e con un colore preso dalla tavolozza:
 * bande aggiunte prima verrebbero ditherate anche loro, e bande di un colore
 * qualsiasi introdurrebbero nel file una tinta che la tavolozza non ammette.
 */
function padToAspect(img, ratio, colour) {
  const frame = padFrame(img.width, img.height, ratio);
  if (frame.width === img.width && frame.height === img.height) return cloneImage(img);

  const out = createImage(frame.width, frame.height);
  const [r, g, b] = colour;
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = 255;
  }
  const x0 = Math.floor((frame.width - img.width) / 2);
  const y0 = Math.floor((frame.height - img.height) / 2);
  for (let y = 0; y < img.height; y++) {
    const da = y * img.width * 4;
    out.data.set(
      img.data.subarray(da, da + img.width * 4),
      ((y + y0) * frame.width + x0) * 4,
    );
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

  return { LUMA_B, LUMA_G, LUMA_R, applyAdjustments, cloneImage, createImage, cropFrame, cropToAspect, downscaleByFactor, fitWithin, luma, lumaHistogram, padFrame, padToAspect, resampleBox, sharpen, upscaleByFactor };
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
function buildQuantizer(colors, ramp, bits) {
  const n = colors.length;
  if (n < 2) throw new Error('La palette deve avere almeno due colori');

  // Palette a profondita' di bit: l'indice si calcola, non si cerca.
  // Con 256 o 512 colori la ricerca esaustiva costerebbe cara, e sarebbe
  // anche sbagliata: su una griglia regolare il colore piu' vicino e'
  // sempre quello che si ottiene troncando, non serve confrontarli tutti.
  if (bits) {
    const [rb, gb, bb] = bits;
    const passo = (b) => 255 / ((1 << b) - 1);
    // Si arrotonda al gradino piu' vicino invece di troncare: troncando,
    // ogni valore scivolerebbe all'ingiu' e l'immagine uscirebbe piu'
    // scura di mezzo gradino, che con due bit di blu si vede benissimo.
    const quant = (v, b) => Math.min((1 << b) - 1, Math.round(clamp255(v) / passo(b)));
    return {
      ramp: false,
      colors,
      bits,
      lumas: colors.map(([r, g, b]) => luma(r, g, b)),
      // I gradini piu' fitti decidono quanto puo' spingere il rumore
      // ordinato: e' la stessa unita' "per canale" delle altre palette.
      spread: Math.min(passo(rb), passo(gb), passo(bb)) / Math.sqrt(3),
      nearestRGB: (r, g, b) => (
        (quant(r, rb) << (gb + bb)) | (quant(g, gb) << bb) | quant(b, bb)
      ),
    };
  }

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

  return { ALGORITHMS, DIFFUSION_ALGORITHMS, ORDERED_ALGORITHMS, buildQuantizer, ditherImage };
})();

const __m_src_core_i18n_js = (() => {

/**
 * Traduzioni dell'interfaccia.
 *
 * Le chiavi sono in inglese e l'inglese e' la lingua di riferimento: se una
 * traduzione manca si ricade su quella, invece di mostrare la chiave nuda.
 * Widget, applicazione da terminale e riga di comando pescano tutti da qui,
 * cosi' una stringa si traduce una volta sola.
 *
 * Le etichette dei parametri restano corte di proposito (dodici caratteri al
 * massimo in ogni lingua): nella TUI la colonna e' larga tredici, e una
 * parola tedesca lunga sfonderebbe la cornice.
 */

const LOCALES = ['en', 'it', 'es', 'fr', 'de'];

const LOCALE_NAMES = {
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

const DEFAULT_LOCALE = 'en';

const en = {
  'group.dither': 'DITHER',
  'group.tone': 'TONE',
  'group.output': 'OUTPUT',
  'group.text': 'TEXT',

  'param.palette.label': 'Palette',
  'param.algorithm.label': 'Algorithm',
  'param.scale.label': 'Pixel',
  'param.scale.hint': 'Shrinks before dithering: 1 keeps full detail, 8 gives chunky 8-bit blocks',
  'param.strength.label': 'Strength',
  'param.strength.hint': 'How much of the error (or of the ordered noise) gets applied',
  'param.bias.label': 'Threshold',
  'param.bias.hint': 'Moves the cut-off point: negative darkens, positive lightens',
  'param.noise.label': 'Grain',
  'param.noise.hint': 'Random noise before the threshold: breaks up patterns that look too regular',
  'param.serpentine.label': 'Serpentine',
  'param.serpentine.hint': 'Alternating scan direction row by row: removes diagonal streaks',
  'param.brightness.label': 'Brightness',
  'param.contrast.label': 'Contrast',
  'param.gamma.label': 'Gamma',
  'param.saturation.label': 'Saturation',
  'param.sharpen.label': 'Sharpen',
  'param.sharpen.hint': 'Unsharp mask: brings back the fine detail that dithering eats',
  'param.invert.label': 'Invert',
  'param.aspect.label': 'Aspect',
  'param.aspect.hint': 'Frames the result to a fixed ratio, cropping or adding bars',
  'param.aspect.value.source': 'As the photo',
  'param.aspect.value.1:1': '1:1',
  'param.aspect.value.5:4': '5:4',
  'param.aspect.value.4:3': '4:3',
  'param.aspect.value.3:2': '3:2',
  'param.aspect.value.16:10': '16:10',
  'param.aspect.value.16:9': '16:9',
  'param.aspect.value.21:9': '21:9',
  'param.aspect.value.4:5': '4:5',
  'param.aspect.value.9:16': '9:16',
  'param.fit.label': 'Fit',
  'param.fit.hint': 'What to do with whatever does not fit the ratio',
  'param.fit.value.crop': 'Crop',
  'param.fit.value.pad': 'Bars',
  'param.megapixels.label': 'Megapixels',
  'param.megapixels.hint': 'Output resolution: lower it to coarsen the photo on purpose',
  'param.upscale.label': 'Upscale',
  'param.upscale.hint': 'Blows the result back up to its former size with hard pixels',

  'palette.bw': '1-bit B/W',
  'palette.gray4': 'Grays 4',
  'palette.gray8': 'Grays 8',
  'palette.gray16': 'Grays 16',
  'palette.gameboy': 'Game Boy',
  'palette.gameboyPocket': 'GB Pocket',
  'palette.cgaCyan': 'CGA cyan',
  'palette.cgaGreen': 'CGA green',
  'palette.pico8': 'PICO-8',
  'palette.c64': 'C64',
  'palette.zx': 'ZX Spectrum',
  'palette.greenCrt': 'Green CRT',
  'palette.amberCrt': 'Amber CRT',
  'palette.marathon': 'Marathon',
  'palette.marathonDuo': 'Marathon duo',
  'palette.marathonTerm': 'Marathon 94',
  'palette.risograph': 'Risograph',
  'palette.blueprint': 'Blueprint',
  'palette.nes': 'NES',
  'palette.ega': 'EGA 16',
  'palette.msx': 'MSX',
  'palette.teletext': 'Teletext',
  'palette.amigaWb': 'Workbench',
  'palette.virtualBoy': 'Virtual Boy',
  'palette.bit8': '8-bit colour',
  'palette.megadrive': 'Mega Drive',
  'palette.custom': 'Custom',

  'algorithm.none': 'None (threshold)',
  'algorithm.random': 'Random noise',
  'algorithm.bayer2': 'Bayer 2x2',
  'algorithm.bayer4': 'Bayer 4x4',
  'algorithm.bayer8': 'Bayer 8x8',
  'algorithm.bayer16': 'Bayer 16x16',
  'algorithm.cluster4': 'Halftone 4x4',
  'algorithm.cluster8': 'Halftone 8x8',
  'algorithm.lines4': 'Diagonal lines',
  'algorithm.floydSteinberg': 'Floyd-Steinberg',
  'algorithm.falseFloydSteinberg': 'Floyd-Steinberg light',
  'algorithm.atkinson': 'Atkinson',
  'algorithm.jarvis': 'Jarvis-Judice-Ninke',
  'algorithm.stucki': 'Stucki',
  'algorithm.burkes': 'Burkes',
  'algorithm.sierra': 'Sierra',
  'algorithm.sierra2': 'Sierra two-row',
  'algorithm.sierraLite': 'Sierra lite',
  'algorithm.stevensonArce': 'Stevenson-Arce',

  'preset.macintosh': 'Macintosh 1984',
  'preset.giornale': 'Newsprint',
  'preset.gameboy': 'Game Boy',
  'preset.fanzine': 'Photocopied zine',
  'preset.terminale': 'Phosphor terminal',
  'preset.arcade': 'Arcade 16 colours',
  'preset.cga': 'CGA 1981',
  'preset.incisione': 'Engraving',
  'preset.nes': '8-bit console',
  'preset.megadrive': '16-bit console',
  'preset.vga': 'VGA 256 colours',
  'preset.msx': 'MSX cassette',
  'preset.workbench': 'Amiga Workbench',
  'preset.teletext': 'Teletext',
  'preset.virtualBoy': 'Virtual Boy',

  'mode.braille': 'Braille',
  'mode.halfblock': 'Half blocks',
  'mode.quadrant': 'Quadrants',
  'mode.ascii': 'ASCII',

  'ui.presets': 'Presets',
  'ui.colours': 'Colours',
  'ui.open': 'Open photo',
  'ui.noFile': 'no file chosen',
  'ui.shoot': 'Shoot',
  'ui.download': 'Download PNG',
  'ui.reset': 'Reset',
  'ui.dropTitle': 'Drag a photo here',
  'ui.dropButton': 'Choose a photo',
  'ui.dropHint': 'or paste one with Ctrl+V — the image never leaves your browser',
  'ui.noImage': 'no image loaded',
  'ui.addColour': 'Add a colour',
  'ui.removeColour': 'Remove this colour',
  'ui.copyPalette': 'Copy the selected palette in here',
  'ui.loading': 'Loading…',
  'ui.preparing': 'Preparing the PNG…',
  'ui.language': 'Language',
  'ui.view': 'View',
  'ui.viewImage': 'Image',
  'ui.copy': 'Copy',
  'ui.copied': 'Copied',
  'ui.copyFailed': 'Could not copy',
  'ui.columns': 'Columns',
  'ui.chars': 'chars',
  'ui.textHint': 'Text art of the photo. Copy it and paste it wherever you like.',
  'ui.error': 'Error: {msg}',
  'ui.notAnImage': 'That file is not an image',
  'ui.unreadable': 'Image cannot be read',
  'ui.exportFailed': 'Export failed',
  'ui.saved': 'Saved: {name}',
  'ui.cancelled': 'Save cancelled',
  'ui.tooLarge': 'The PNG is too large: lower the megapixels',

  'tui.preview': 'PREVIEW',
  'tui.controls': 'CONTROLS',
  'tui.files': 'FILES',
  'tui.keys': 'KEYS',
  'tui.theme': 'THEME',
  'tui.preset': 'PRESET',
  'tui.language': 'LANGUAGE',
  'tui.open': 'OPEN',
  'tui.save': 'SAVE',
  'tui.tooSmall': 'Window too small (needs at least 40x12)',
  'tui.noImageHint': 'no image · o to open a path · ? for the keys',
  'tui.noImageHere': 'No image here. Press o to open a path.',
  'tui.sample': 'Sample image. Press o to open your own.',
  'tui.openHint': 'Path to an image or a folder',
  'tui.saveHint': 'Destination file (.png or .jpg) — processed at full resolution',
  'tui.confirm': 'enter confirms · esc cancels',
  'tui.onlyPngJpg': 'Only .png or .jpg',
  'tui.noImageLoaded': 'No image loaded',
  'tui.emptyFolder': 'Folder has no images',
  'tui.reset': 'Parameters reset',
  'tui.previewMode': 'Preview: {name}',
  'tui.previewShort': 'prev. {size}',
  'guide.off': 'Off',
  'guide.red': 'Red',
  'guide.cyan': 'Cyan',
  'guide.yellow': 'Yellow',
  'guide.magenta': 'Magenta',
  'guide.green': 'Green',
  'tui.guide': 'Framing guide',
  'tui.guideSet': 'Guide: {name}',
  'key.guide': 'Framing guide colour',
  'tui.themeSet': 'Theme: {name}',
  'tui.presetSet': 'Preset: {name}',
  'tui.languageSet': 'Language: {name}',
  'tui.jobOpen': 'Opening {name}',
  'tui.jobRead': 'Reading {name}',
  'tui.jobPreview': 'Preparing the preview',
  'tui.jobSave': 'Saving {name}',
  'tui.jobProcess': 'Processing at full resolution',
  'tui.jobWrite': 'Writing {size}',
  'tui.jobDone': 'Done',
  'tui.savedAs': 'Saved: {name} ({size})',
  'tui.saveFailed': 'Save failed: {msg}',
  'tui.loaded': '{name} · {size}',

  'key.move': 'Scroll the parameters or the files',
  'key.adjust': 'Adjust the selected value',
  'key.adjustBig': 'Adjust in steps of five',
  'key.activate': 'Activate: load the file, flip the switch',
  'key.focus': 'Move focus between controls and files',
  'key.step': 'Next and previous image',
  'key.ends': 'Jump to the top / bottom',
  'key.mode': 'Change preview mode',
  'key.theme': 'Pick the theme',
  'key.preset': 'Apply a preset',
  'key.lang': 'Pick the language',
  'key.invert': 'Invert (shortcut)',
  'key.reset': 'Reset every parameter',
  'key.openPath': 'Open a path',
  'key.save': 'Save at full resolution',
  'key.files': 'Show or hide the file list',
  'key.help': 'This screen',
  'key.quit': 'Quit',

  'bar.move': 'move',
  'bar.adjust': 'adjust',
  'bar.focus': 'focus',
  'bar.preview': 'preview',
  'bar.preset': 'preset',
  'bar.theme': 'theme',
  'bar.save': 'save',
  'bar.keys': 'keys',
  'bar.open': 'open a path',
  'bar.quit': 'quit',

  'cli.tagline': 'adjustable dithering for your photos',
  'cli.missingValue': 'Missing value for --{name}',
  'cli.wantsNumber': '--{name} wants a number, not "{value}"',
  'cli.noSuchValue': '--{name}: "{value}" does not exist. Values: {list}',
  'cli.noSuchPreset': 'Preset "{name}" does not exist. Available: {list}',
  'cli.noSuchMode': 'Mode "{name}" does not exist. Available: {list}',
  'cli.noSuchLang': 'Language "{name}" does not exist. Available: {list}',
  'cli.notFound': 'Cannot find {name}',
  'cli.onlyPngJpeg': '{name}: only PNG and JPEG are accepted',
  'cli.needPrintFile': 'Need at least one file to print',
  'cli.needProcessFile': 'Need at least one file to process',
  'cli.manyFiles': 'With more than one file use --out-dir instead of --out',
  'cli.notATty': 'Not an interactive terminal: use -o to save or --print to print',
  'cli.offSwitch': '(--no-{name} turns it off)',
  'cli.colourCount': '{n} colours',
  'cli.listPalettes': 'PALETTES',
  'cli.listAlgorithms': 'ALGORITHMS',
  'cli.listPresets': 'PRESETS',
  'cli.listThemes': 'THEMES',
  'cli.listModes': 'PREVIEWS',
};

const it = {
  'group.dither': 'DITHER',
  'group.tone': 'TONO',
  'group.output': 'OUTPUT',
  'group.text': 'TESTO',

  'param.palette.label': 'Palette',
  'param.algorithm.label': 'Algoritmo',
  'param.scale.label': 'Pixel',
  'param.scale.hint': 'Riduce prima di ditherare: 1 tiene il dettaglio pieno, 8 fa il pixelone da 8 bit',
  'param.strength.label': 'Intensità',
  'param.strength.hint': 'Quanta parte dell’errore (o del rumore ordinato) viene applicata',
  'param.bias.label': 'Soglia',
  'param.bias.hint': 'Sposta il punto di taglio: negativo scurisce, positivo schiarisce',
  'param.noise.label': 'Grana',
  'param.noise.hint': 'Rumore casuale prima della soglia: rompe le trame troppo regolari',
  'param.serpentine.label': 'Serpentina',
  'param.serpentine.hint': 'Scansione alternata riga per riga: elimina le strisciate diagonali',
  'param.brightness.label': 'Luminosità',
  'param.contrast.label': 'Contrasto',
  'param.gamma.label': 'Gamma',
  'param.saturation.label': 'Saturazione',
  'param.sharpen.label': 'Nitidezza',
  'param.sharpen.hint': 'Maschera di contrasto: recupera i dettagli fini che il dithering mangia',
  'param.invert.label': 'Inverti',
  'param.aspect.label': 'Rapporto',
  'param.aspect.hint': 'Porta il risultato a un rapporto fisso, ritagliando o aggiungendo bande',
  'param.aspect.value.source': 'Come la foto',
  'param.aspect.value.1:1': '1:1',
  'param.aspect.value.5:4': '5:4',
  'param.aspect.value.4:3': '4:3',
  'param.aspect.value.3:2': '3:2',
  'param.aspect.value.16:10': '16:10',
  'param.aspect.value.16:9': '16:9',
  'param.aspect.value.21:9': '21:9',
  'param.aspect.value.4:5': '4:5',
  'param.aspect.value.9:16': '9:16',
  'param.fit.label': 'Adatta',
  'param.fit.hint': 'Che fare di quello che nel rapporto non entra',
  'param.fit.value.crop': 'Ritaglia',
  'param.fit.value.pad': 'Bande',
  'param.megapixels.label': 'Megapixel',
  'param.megapixels.hint': 'Risoluzione del risultato: abbassala per sgranare di proposito la foto',
  'param.upscale.label': 'Ingrandisci',
  'param.upscale.hint': 'Riporta il risultato alla dimensione di prima con pixel netti',

  'palette.bw': '1-bit B/N',
  'palette.gray4': 'Grigi 4',
  'palette.gray8': 'Grigi 8',
  'palette.gray16': 'Grigi 16',
  'palette.gameboyPocket': 'GB Pocket',
  'palette.cgaCyan': 'CGA ciano',
  'palette.cgaGreen': 'CGA verde',
  'palette.greenCrt': 'CRT verde',
  'palette.amberCrt': 'CRT ambra',
  'palette.risograph': 'Risografia',
  'palette.blueprint': 'Cianografia',
  'palette.nes': 'NES',
  'palette.ega': 'EGA 16',
  'palette.msx': 'MSX',
  'palette.teletext': 'Televideo',
  'palette.amigaWb': 'Workbench',
  'palette.virtualBoy': 'Virtual Boy',
  'palette.bit8': 'Colore 8 bit',
  'palette.megadrive': 'Mega Drive',
  'palette.custom': 'Su misura',

  'algorithm.none': 'Nessuno (soglia)',
  'algorithm.random': 'Rumore casuale',
  'algorithm.cluster4': 'Retino 4x4',
  'algorithm.cluster8': 'Retino 8x8',
  'algorithm.lines4': 'Linee diagonali',
  'algorithm.falseFloydSteinberg': 'Floyd-Steinberg light',
  'algorithm.sierra2': 'Sierra 2 righe',

  'preset.giornale': 'Giornale',
  'preset.fanzine': 'Fanzine fotocopiata',
  'preset.terminale': 'Terminale a fosfori',
  'preset.arcade': 'Arcade 16 colori',
  'preset.incisione': 'Incisione',
  'preset.nes': 'Console 8 bit',
  'preset.megadrive': 'Console 16 bit',
  'preset.vga': 'VGA 256 colori',
  'preset.msx': 'MSX su cassetta',
  'preset.workbench': 'Amiga Workbench',
  'preset.teletext': 'Televideo',
  'preset.virtualBoy': 'Virtual Boy',

  'mode.halfblock': 'Mezzi blocchi',
  'mode.quadrant': 'Quadranti',

  'ui.presets': 'Preset',
  'ui.colours': 'Colori',
  'ui.open': 'Apri foto',
  'ui.noFile': 'nessun file scelto',
  'ui.shoot': 'Scatta',
  'ui.download': 'Scarica PNG',
  'ui.reset': 'Azzera',
  'ui.dropTitle': 'Trascina qui una foto',
  'ui.dropButton': 'Scegli una foto',
  'ui.dropHint': 'oppure incollala con Ctrl+V — l’immagine non lascia il tuo browser',
  'ui.noImage': 'nessuna immagine caricata',
  'ui.addColour': 'Aggiungi un colore',
  'ui.removeColour': 'Togli questo colore',
  'ui.copyPalette': 'Copia qui i colori della palette scelta',
  'ui.loading': 'Carico…',
  'ui.preparing': 'Preparo il PNG…',
  'ui.language': 'Lingua',
  'ui.view': 'Vista',
  'ui.viewImage': 'Immagine',
  'ui.copy': 'Copia',
  'ui.copied': 'Copiato',
  'ui.copyFailed': 'Non riesco a copiare',
  'ui.columns': 'Colonne',
  'ui.chars': 'car.',
  'ui.textHint': 'La foto scritta con i caratteri. Copiala e incollala dove vuoi.',
  'ui.error': 'Errore: {msg}',
  'ui.notAnImage': 'Quel file non è un’immagine',
  'ui.unreadable': 'Immagine non leggibile',
  'ui.exportFailed': 'Export fallito',
  'ui.saved': 'Salvato: {name}',
  'ui.cancelled': 'Salvataggio annullato',
  'ui.tooLarge': 'Il PNG è troppo grande: abbassa i megapixel',

  'tui.preview': 'ANTEPRIMA',
  'tui.controls': 'CONTROLLI',
  'tui.files': 'FILE',
  'tui.keys': 'TASTI',
  'tui.theme': 'TEMA',
  'tui.preset': 'PRESET',
  'tui.language': 'LINGUA',
  'tui.open': 'APRI',
  'tui.save': 'SALVA',
  'tui.tooSmall': 'Finestra troppo piccola (serve almeno 40x12)',
  'tui.noImageHint': 'nessuna immagine · o per aprire un percorso · ? per i tasti',
  'tui.noImageHere': 'Nessuna immagine qui. Premi o per aprire un percorso.',
  'tui.sample': 'Immagine di prova. Premi o per aprire la tua.',
  'tui.openHint': 'Percorso di un’immagine o di una cartella',
  'tui.saveHint': 'File di destinazione (.png o .jpg) — elaboro a piena risoluzione',
  'tui.confirm': 'invio conferma · esc annulla',
  'tui.onlyPngJpg': 'Uso solo .png o .jpg',
  'tui.noImageLoaded': 'Nessuna immagine caricata',
  'tui.emptyFolder': 'Cartella senza immagini',
  'tui.reset': 'Parametri azzerati',
  'tui.previewMode': 'Anteprima: {name}',
  'tui.previewShort': 'ant. {size}',
  'guide.off': 'Spenta',
  'guide.red': 'Rosso',
  'guide.cyan': 'Ciano',
  'guide.yellow': 'Giallo',
  'guide.magenta': 'Magenta',
  'guide.green': 'Verde',
  'tui.guide': 'Cornice',
  'tui.guideSet': 'Cornice: {name}',
  'key.guide': 'Colore della cornice',
  'tui.themeSet': 'Tema: {name}',
  'tui.presetSet': 'Preset: {name}',
  'tui.languageSet': 'Lingua: {name}',
  'tui.jobOpen': 'Apro {name}',
  'tui.jobRead': 'Leggo {name}',
  'tui.jobPreview': 'Preparo l’anteprima',
  'tui.jobSave': 'Salvo {name}',
  'tui.jobProcess': 'Elaboro a piena risoluzione',
  'tui.jobWrite': 'Scrivo {size}',
  'tui.jobDone': 'Fatto',
  'tui.savedAs': 'Salvato: {name} ({size})',
  'tui.saveFailed': 'Salvataggio fallito: {msg}',
  'tui.loaded': '{name} · {size}',

  'key.move': 'Scorri i parametri o i file',
  'key.adjust': 'Regola il valore selezionato',
  'key.adjustBig': 'Regola a passi di cinque',
  'key.activate': 'Attiva: carica il file, gira l’interruttore',
  'key.focus': 'Sposta il fuoco fra controlli e file',
  'key.step': 'Immagine successiva e precedente',
  'key.ends': 'Vai in cima / in fondo',
  'key.mode': 'Cambia modo di anteprima',
  'key.theme': 'Scegli il tema',
  'key.preset': 'Applica un preset',
  'key.lang': 'Scegli la lingua',
  'key.invert': 'Inverti (scorciatoia)',
  'key.reset': 'Azzera tutti i parametri',
  'key.openPath': 'Apri un percorso',
  'key.save': 'Salva a piena risoluzione',
  'key.files': 'Mostra o nascondi la lista dei file',
  'key.help': 'Questa schermata',
  'key.quit': 'Esci',

  'bar.move': 'scorri',
  'bar.adjust': 'regola',
  'bar.focus': 'fuoco',
  'bar.preview': 'anteprima',
  'bar.preset': 'preset',
  'bar.theme': 'tema',
  'bar.save': 'salva',
  'bar.keys': 'tasti',
  'bar.open': 'apri un percorso',
  'bar.quit': 'esci',

  'cli.tagline': 'dithering regolabile per le tue foto',
  'cli.missingValue': 'Manca il valore per --{name}',
  'cli.wantsNumber': '--{name} vuole un numero, non "{value}"',
  'cli.noSuchValue': '--{name}: "{value}" non esiste. Valori: {list}',
  'cli.noSuchPreset': 'Preset "{name}" inesistente. Disponibili: {list}',
  'cli.noSuchMode': 'Modo "{name}" inesistente. Disponibili: {list}',
  'cli.noSuchLang': 'Lingua "{name}" inesistente. Disponibili: {list}',
  'cli.notFound': 'Non trovo {name}',
  'cli.onlyPngJpeg': '{name}: accetto solo PNG e JPEG',
  'cli.needPrintFile': 'Serve almeno un file da stampare',
  'cli.needProcessFile': 'Serve almeno un file da elaborare',
  'cli.manyFiles': 'Con piu’ file usa --out-dir al posto di --out',
  'cli.notATty': 'Non sono su un terminale interattivo: usa -o per salvare o --print per stampare',
  'cli.offSwitch': '(--no-{name} per spegnerlo)',
  'cli.colourCount': '{n} colori',
  'cli.listPalettes': 'PALETTE',
  'cli.listAlgorithms': 'ALGORITMI',
  'cli.listPresets': 'PRESET',
  'cli.listThemes': 'TEMI',
  'cli.listModes': 'ANTEPRIME',
};

const es = {
  'group.dither': 'TRAMADO',
  'group.tone': 'TONO',
  'group.output': 'SALIDA',
  'group.text': 'TEXTO',

  'param.palette.label': 'Paleta',
  'param.algorithm.label': 'Algoritmo',
  'param.scale.label': 'Píxel',
  'param.scale.hint': 'Reduce antes de tramar: 1 mantiene el detalle, 8 da bloques gordos de 8 bits',
  'param.strength.label': 'Intensidad',
  'param.strength.hint': 'Qué parte del error (o del ruido ordenado) se aplica',
  'param.bias.label': 'Umbral',
  'param.bias.hint': 'Mueve el punto de corte: negativo oscurece, positivo aclara',
  'param.noise.label': 'Grano',
  'param.noise.hint': 'Ruido aleatorio antes del umbral: rompe las tramas demasiado regulares',
  'param.serpentine.label': 'Serpentina',
  'param.serpentine.hint': 'Barrido alterno fila a fila: elimina las rayas diagonales',
  'param.brightness.label': 'Brillo',
  'param.contrast.label': 'Contraste',
  'param.gamma.label': 'Gamma',
  'param.saturation.label': 'Saturación',
  'param.sharpen.label': 'Nitidez',
  'param.sharpen.hint': 'Máscara de enfoque: recupera el detalle fino que se come el tramado',
  'param.invert.label': 'Invertir',
  'param.aspect.label': 'Relación',
  'param.aspect.hint': 'Lleva el resultado a una relación fija, recortando o añadiendo bandas',
  'param.aspect.value.source': 'Como la foto',
  'param.aspect.value.1:1': '1:1',
  'param.aspect.value.5:4': '5:4',
  'param.aspect.value.4:3': '4:3',
  'param.aspect.value.3:2': '3:2',
  'param.aspect.value.16:10': '16:10',
  'param.aspect.value.16:9': '16:9',
  'param.aspect.value.21:9': '21:9',
  'param.aspect.value.4:5': '4:5',
  'param.aspect.value.9:16': '9:16',
  'param.fit.label': 'Ajuste',
  'param.fit.hint': 'Qué hacer con lo que no cabe en la relación',
  'param.fit.value.crop': 'Recortar',
  'param.fit.value.pad': 'Bandas',
  'param.megapixels.label': 'Megapíxeles',
  'param.megapixels.hint': 'Resolución del resultado: bájala para pixelar la foto a propósito',
  'param.upscale.label': 'Ampliar',
  'param.upscale.hint': 'Devuelve el resultado a su tamaño anterior con píxeles duros',

  'palette.bw': '1 bit B/N',
  'palette.gray4': 'Grises 4',
  'palette.gray8': 'Grises 8',
  'palette.gray16': 'Grises 16',
  'palette.cgaCyan': 'CGA cian',
  'palette.cgaGreen': 'CGA verde',
  'palette.greenCrt': 'CRT verde',
  'palette.amberCrt': 'CRT ámbar',
  'palette.risograph': 'Risografía',
  'palette.blueprint': 'Cianotipo',
  'palette.nes': 'NES',
  'palette.ega': 'EGA 16',
  'palette.msx': 'MSX',
  'palette.teletext': 'Teletexto',
  'palette.amigaWb': 'Workbench',
  'palette.virtualBoy': 'Virtual Boy',
  'palette.bit8': 'Color 8 bits',
  'palette.megadrive': 'Mega Drive',
  'palette.custom': 'A medida',

  'algorithm.none': 'Ninguno (umbral)',
  'algorithm.random': 'Ruido aleatorio',
  'algorithm.cluster4': 'Semitono 4x4',
  'algorithm.cluster8': 'Semitono 8x8',
  'algorithm.lines4': 'Líneas diagonales',
  'algorithm.sierra2': 'Sierra 2 filas',

  'preset.giornale': 'Prensa',
  'preset.fanzine': 'Fanzine fotocopiado',
  'preset.terminale': 'Terminal de fósforo',
  'preset.arcade': 'Arcade 16 colores',
  'preset.incisione': 'Grabado',
  'preset.nes': 'Consola 8 bits',
  'preset.megadrive': 'Consola 16 bits',
  'preset.vga': 'VGA 256 colores',
  'preset.msx': 'MSX en casete',
  'preset.workbench': 'Amiga Workbench',
  'preset.teletext': 'Teletexto',
  'preset.virtualBoy': 'Virtual Boy',

  'mode.halfblock': 'Medios bloques',
  'mode.quadrant': 'Cuadrantes',

  'ui.presets': 'Ajustes',
  'ui.colours': 'Colores',
  'ui.open': 'Abrir foto',
  'ui.noFile': 'ningún archivo elegido',
  'ui.shoot': 'Disparar',
  'ui.download': 'Descargar PNG',
  'ui.reset': 'Reiniciar',
  'ui.dropTitle': 'Arrastra aquí una foto',
  'ui.dropButton': 'Elige una foto',
  'ui.dropHint': 'o pégala con Ctrl+V — la imagen nunca sale de tu navegador',
  'ui.noImage': 'ninguna imagen cargada',
  'ui.addColour': 'Añadir un color',
  'ui.removeColour': 'Quitar este color',
  'ui.copyPalette': 'Copiar aquí la paleta elegida',
  'ui.loading': 'Cargando…',
  'ui.preparing': 'Preparando el PNG…',
  'ui.language': 'Idioma',
  'ui.view': 'Vista',
  'ui.viewImage': 'Imagen',
  'ui.copy': 'Copiar',
  'ui.copied': 'Copiado',
  'ui.copyFailed': 'No se pudo copiar',
  'ui.columns': 'Columnas',
  'ui.chars': 'car.',
  'ui.textHint': 'La foto escrita con caracteres. Cópiala y pégala donde quieras.',
  'ui.error': 'Error: {msg}',
  'ui.notAnImage': 'Ese archivo no es una imagen',
  'ui.unreadable': 'No se puede leer la imagen',
  'ui.exportFailed': 'Exportación fallida',
  'ui.saved': 'Guardado: {name}',
  'ui.cancelled': 'Guardado cancelado',
  'ui.tooLarge': 'El PNG es demasiado grande: baja los megapíxeles',

  'tui.preview': 'VISTA PREVIA',
  'tui.controls': 'CONTROLES',
  'tui.files': 'ARCHIVOS',
  'tui.keys': 'TECLAS',
  'tui.theme': 'TEMA',
  'tui.preset': 'AJUSTE',
  'tui.language': 'IDIOMA',
  'tui.open': 'ABRIR',
  'tui.save': 'GUARDAR',
  'tui.tooSmall': 'Ventana demasiado pequeña (mínimo 40x12)',
  'tui.noImageHint': 'ninguna imagen · o para abrir una ruta · ? para las teclas',
  'tui.noImageHere': 'Aquí no hay imágenes. Pulsa o para abrir una ruta.',
  'tui.sample': 'Imagen de prueba. Pulsa o para abrir la tuya.',
  'tui.openHint': 'Ruta de una imagen o de una carpeta',
  'tui.saveHint': 'Archivo de destino (.png o .jpg) — se procesa a resolución completa',
  'tui.confirm': 'intro confirma · esc cancela',
  'tui.onlyPngJpg': 'Solo .png o .jpg',
  'tui.noImageLoaded': 'Ninguna imagen cargada',
  'tui.emptyFolder': 'La carpeta no tiene imágenes',
  'tui.reset': 'Parámetros reiniciados',
  'tui.previewMode': 'Vista previa: {name}',
  'tui.previewShort': 'prev. {size}',
  'guide.off': 'Apagada',
  'guide.red': 'Rojo',
  'guide.cyan': 'Cian',
  'guide.yellow': 'Amarillo',
  'guide.magenta': 'Magenta',
  'guide.green': 'Verde',
  'tui.guide': 'Encuadre',
  'tui.guideSet': 'Encuadre: {name}',
  'key.guide': 'Color del encuadre',
  'tui.themeSet': 'Tema: {name}',
  'tui.presetSet': 'Ajuste: {name}',
  'tui.languageSet': 'Idioma: {name}',
  'tui.jobOpen': 'Abriendo {name}',
  'tui.jobRead': 'Leyendo {name}',
  'tui.jobPreview': 'Preparando la vista previa',
  'tui.jobSave': 'Guardando {name}',
  'tui.jobProcess': 'Procesando a resolución completa',
  'tui.jobWrite': 'Escribiendo {size}',
  'tui.jobDone': 'Hecho',
  'tui.savedAs': 'Guardado: {name} ({size})',
  'tui.saveFailed': 'Fallo al guardar: {msg}',
  'tui.loaded': '{name} · {size}',

  'key.move': 'Recorre los parámetros o los archivos',
  'key.adjust': 'Ajusta el valor seleccionado',
  'key.adjustBig': 'Ajusta de cinco en cinco',
  'key.activate': 'Activa: carga el archivo, cambia el interruptor',
  'key.focus': 'Mueve el foco entre controles y archivos',
  'key.step': 'Imagen siguiente y anterior',
  'key.ends': 'Ir al principio / al final',
  'key.mode': 'Cambia el modo de vista previa',
  'key.theme': 'Elige el tema',
  'key.preset': 'Aplica un ajuste',
  'key.lang': 'Elige el idioma',
  'key.invert': 'Invertir (atajo)',
  'key.reset': 'Reinicia todos los parámetros',
  'key.openPath': 'Abre una ruta',
  'key.save': 'Guarda a resolución completa',
  'key.files': 'Muestra u oculta la lista de archivos',
  'key.help': 'Esta pantalla',
  'key.quit': 'Salir',

  'bar.move': 'mover',
  'bar.adjust': 'ajustar',
  'bar.focus': 'foco',
  'bar.preview': 'vista',
  'bar.preset': 'ajuste',
  'bar.theme': 'tema',
  'bar.save': 'guardar',
  'bar.keys': 'teclas',
  'bar.open': 'abrir una ruta',
  'bar.quit': 'salir',

  'cli.tagline': 'tramado ajustable para tus fotos',
  'cli.missingValue': 'Falta el valor de --{name}',
  'cli.wantsNumber': '--{name} espera un número, no "{value}"',
  'cli.noSuchValue': '--{name}: "{value}" no existe. Valores: {list}',
  'cli.noSuchPreset': 'El ajuste "{name}" no existe. Disponibles: {list}',
  'cli.noSuchMode': 'El modo "{name}" no existe. Disponibles: {list}',
  'cli.noSuchLang': 'El idioma "{name}" no existe. Disponibles: {list}',
  'cli.notFound': 'No encuentro {name}',
  'cli.onlyPngJpeg': '{name}: solo se aceptan PNG y JPEG',
  'cli.needPrintFile': 'Hace falta al menos un archivo para imprimir',
  'cli.needProcessFile': 'Hace falta al menos un archivo para procesar',
  'cli.manyFiles': 'Con varios archivos usa --out-dir en lugar de --out',
  'cli.notATty': 'No es una terminal interactiva: usa -o para guardar o --print para imprimir',
  'cli.offSwitch': '(--no-{name} lo desactiva)',
  'cli.colourCount': '{n} colores',
  'cli.listPalettes': 'PALETAS',
  'cli.listAlgorithms': 'ALGORITMOS',
  'cli.listPresets': 'AJUSTES',
  'cli.listThemes': 'TEMAS',
  'cli.listModes': 'VISTAS PREVIAS',
};

const fr = {
  'group.dither': 'TRAMAGE',
  'group.tone': 'TONALITÉ',
  'group.output': 'SORTIE',
  'group.text': 'TEXTE',

  'param.palette.label': 'Palette',
  'param.algorithm.label': 'Algorithme',
  'param.scale.label': 'Pixel',
  'param.scale.hint': 'Réduit avant de tramer : 1 garde tout le détail, 8 donne de gros blocs 8 bits',
  'param.strength.label': 'Intensité',
  'param.strength.hint': 'Quelle part de l’erreur (ou du bruit ordonné) est appliquée',
  'param.bias.label': 'Seuil',
  'param.bias.hint': 'Déplace le point de coupe : négatif assombrit, positif éclaircit',
  'param.noise.label': 'Grain',
  'param.noise.hint': 'Bruit aléatoire avant le seuil : casse les trames trop régulières',
  'param.serpentine.label': 'Serpentin',
  'param.serpentine.hint': 'Balayage alterné ligne par ligne : supprime les traînées diagonales',
  'param.brightness.label': 'Luminosité',
  'param.contrast.label': 'Contraste',
  'param.gamma.label': 'Gamma',
  'param.saturation.label': 'Saturation',
  'param.sharpen.label': 'Netteté',
  'param.sharpen.hint': 'Masque de netteté : récupère le détail fin que le tramage mange',
  'param.invert.label': 'Inverser',
  'param.aspect.label': 'Format',
  'param.aspect.hint': 'Amène le résultat à un format fixe, en rognant ou en ajoutant des bandes',
  'param.aspect.value.source': 'Comme la photo',
  'param.aspect.value.1:1': '1:1',
  'param.aspect.value.5:4': '5:4',
  'param.aspect.value.4:3': '4:3',
  'param.aspect.value.3:2': '3:2',
  'param.aspect.value.16:10': '16:10',
  'param.aspect.value.16:9': '16:9',
  'param.aspect.value.21:9': '21:9',
  'param.aspect.value.4:5': '4:5',
  'param.aspect.value.9:16': '9:16',
  'param.fit.label': 'Ajuster',
  'param.fit.hint': 'Que faire de ce qui ne rentre pas dans le format',
  'param.fit.value.crop': 'Rogner',
  'param.fit.value.pad': 'Bandes',
  'param.megapixels.label': 'Mégapixels',
  'param.megapixels.hint': 'Résolution du résultat : baissez-la pour pixeliser la photo exprès',
  'param.upscale.label': 'Agrandir',
  'param.upscale.hint': 'Ramène le résultat à sa taille d’origine avec des pixels nets',

  'palette.bw': '1 bit N/B',
  'palette.gray4': 'Gris 4',
  'palette.gray8': 'Gris 8',
  'palette.gray16': 'Gris 16',
  'palette.cgaCyan': 'CGA cyan',
  'palette.cgaGreen': 'CGA vert',
  'palette.greenCrt': 'CRT vert',
  'palette.amberCrt': 'CRT ambre',
  'palette.risograph': 'Risographie',
  'palette.blueprint': 'Cyanotype',
  'palette.nes': 'NES',
  'palette.ega': 'EGA 16',
  'palette.msx': 'MSX',
  'palette.teletext': 'Télétexte',
  'palette.amigaWb': 'Workbench',
  'palette.virtualBoy': 'Virtual Boy',
  'palette.bit8': 'Couleur 8 bits',
  'palette.megadrive': 'Mega Drive',
  'palette.custom': 'Sur mesure',

  'algorithm.none': 'Aucun (seuil)',
  'algorithm.random': 'Bruit aléatoire',
  'algorithm.cluster4': 'Similigravure 4x4',
  'algorithm.cluster8': 'Similigravure 8x8',
  'algorithm.lines4': 'Lignes diagonales',
  'algorithm.sierra2': 'Sierra 2 lignes',

  'preset.giornale': 'Presse',
  'preset.fanzine': 'Fanzine photocopié',
  'preset.terminale': 'Terminal à phosphore',
  'preset.arcade': 'Arcade 16 couleurs',
  'preset.incisione': 'Gravure',
  'preset.nes': 'Console 8 bits',
  'preset.megadrive': 'Console 16 bits',
  'preset.vga': 'VGA 256 couleurs',
  'preset.msx': 'MSX sur cassette',
  'preset.workbench': 'Amiga Workbench',
  'preset.teletext': 'Télétexte',
  'preset.virtualBoy': 'Virtual Boy',

  'mode.halfblock': 'Demi-blocs',
  'mode.quadrant': 'Quadrants',

  'ui.presets': 'Préréglages',
  'ui.colours': 'Couleurs',
  'ui.open': 'Ouvrir une photo',
  'ui.noFile': 'aucun fichier choisi',
  'ui.shoot': 'Photographier',
  'ui.download': 'Télécharger le PNG',
  'ui.reset': 'Réinitialiser',
  'ui.dropTitle': 'Déposez une photo ici',
  'ui.dropButton': 'Choisir une photo',
  'ui.dropHint': 'ou collez-la avec Ctrl+V — l’image ne quitte jamais votre navigateur',
  'ui.noImage': 'aucune image chargée',
  'ui.addColour': 'Ajouter une couleur',
  'ui.removeColour': 'Retirer cette couleur',
  'ui.copyPalette': 'Copier ici la palette choisie',
  'ui.loading': 'Chargement…',
  'ui.preparing': 'Préparation du PNG…',
  'ui.language': 'Langue',
  'ui.view': 'Vue',
  'ui.viewImage': 'Image',
  'ui.copy': 'Copier',
  'ui.copied': 'Copié',
  'ui.copyFailed': 'Copie impossible',
  'ui.columns': 'Colonnes',
  'ui.chars': 'car.',
  'ui.textHint': 'La photo écrite en caractères. Copiez-la et collez-la où vous voulez.',
  'ui.error': 'Erreur : {msg}',
  'ui.notAnImage': 'Ce fichier n’est pas une image',
  'ui.unreadable': 'Image illisible',
  'ui.exportFailed': 'Échec de l’export',
  'ui.saved': 'Enregistré : {name}',
  'ui.cancelled': 'Enregistrement annulé',
  'ui.tooLarge': 'Le PNG est trop gros : baissez les mégapixels',

  'tui.preview': 'APERÇU',
  'tui.controls': 'CONTRÔLES',
  'tui.files': 'FICHIERS',
  'tui.keys': 'TOUCHES',
  'tui.theme': 'THÈME',
  'tui.preset': 'PRÉRÉGLAGE',
  'tui.language': 'LANGUE',
  'tui.open': 'OUVRIR',
  'tui.save': 'ENREGISTRER',
  'tui.tooSmall': 'Fenêtre trop petite (40x12 minimum)',
  'tui.noImageHint': 'aucune image · o pour ouvrir un chemin · ? pour les touches',
  'tui.noImageHere': 'Aucune image ici. Appuyez sur o pour ouvrir un chemin.',
  'tui.sample': 'Image d’essai. Appuyez sur o pour ouvrir la vôtre.',
  'tui.openHint': 'Chemin d’une image ou d’un dossier',
  'tui.saveHint': 'Fichier de destination (.png ou .jpg) — traité en pleine résolution',
  'tui.confirm': 'entrée valide · échap annule',
  'tui.onlyPngJpg': 'Uniquement .png ou .jpg',
  'tui.noImageLoaded': 'Aucune image chargée',
  'tui.emptyFolder': 'Le dossier ne contient pas d’images',
  'tui.reset': 'Paramètres réinitialisés',
  'tui.previewMode': 'Aperçu : {name}',
  'tui.previewShort': 'aper. {size}',
  'guide.off': 'Éteint',
  'guide.red': 'Rouge',
  'guide.cyan': 'Cyan',
  'guide.yellow': 'Jaune',
  'guide.magenta': 'Magenta',
  'guide.green': 'Vert',
  'tui.guide': 'Cadre',
  'tui.guideSet': 'Cadre : {name}',
  'key.guide': 'Couleur du cadre',
  'tui.themeSet': 'Thème : {name}',
  'tui.presetSet': 'Préréglage : {name}',
  'tui.languageSet': 'Langue : {name}',
  'tui.jobOpen': 'Ouverture de {name}',
  'tui.jobRead': 'Lecture de {name}',
  'tui.jobPreview': 'Préparation de l’aperçu',
  'tui.jobSave': 'Enregistrement de {name}',
  'tui.jobProcess': 'Traitement en pleine résolution',
  'tui.jobWrite': 'Écriture de {size}',
  'tui.jobDone': 'Terminé',
  'tui.savedAs': 'Enregistré : {name} ({size})',
  'tui.saveFailed': 'Échec de l’enregistrement : {msg}',
  'tui.loaded': '{name} · {size}',

  'key.move': 'Parcourir les paramètres ou les fichiers',
  'key.adjust': 'Régler la valeur sélectionnée',
  'key.adjustBig': 'Régler par pas de cinq',
  'key.activate': 'Activer : charger le fichier, basculer l’interrupteur',
  'key.focus': 'Déplacer le focus entre contrôles et fichiers',
  'key.step': 'Image suivante et précédente',
  'key.ends': 'Aller au début / à la fin',
  'key.mode': 'Changer de mode d’aperçu',
  'key.theme': 'Choisir le thème',
  'key.preset': 'Appliquer un préréglage',
  'key.lang': 'Choisir la langue',
  'key.invert': 'Inverser (raccourci)',
  'key.reset': 'Réinitialiser tous les paramètres',
  'key.openPath': 'Ouvrir un chemin',
  'key.save': 'Enregistrer en pleine résolution',
  'key.files': 'Afficher ou masquer la liste des fichiers',
  'key.help': 'Cet écran',
  'key.quit': 'Quitter',

  'bar.move': 'parcourir',
  'bar.adjust': 'régler',
  'bar.focus': 'focus',
  'bar.preview': 'aperçu',
  'bar.preset': 'préréglage',
  'bar.theme': 'thème',
  'bar.save': 'enreg.',
  'bar.keys': 'touches',
  'bar.open': 'ouvrir un chemin',
  'bar.quit': 'quitter',

  'cli.tagline': 'tramage réglable pour vos photos',
  'cli.missingValue': 'Valeur manquante pour --{name}',
  'cli.wantsNumber': '--{name} attend un nombre, pas « {value} »',
  'cli.noSuchValue': '--{name} : « {value} » n’existe pas. Valeurs : {list}',
  'cli.noSuchPreset': 'Le préréglage « {name} » n’existe pas. Disponibles : {list}',
  'cli.noSuchMode': 'Le mode « {name} » n’existe pas. Disponibles : {list}',
  'cli.noSuchLang': 'La langue « {name} » n’existe pas. Disponibles : {list}',
  'cli.notFound': 'Introuvable : {name}',
  'cli.onlyPngJpeg': '{name} : seuls PNG et JPEG sont acceptés',
  'cli.needPrintFile': 'Il faut au moins un fichier à afficher',
  'cli.needProcessFile': 'Il faut au moins un fichier à traiter',
  'cli.manyFiles': 'Avec plusieurs fichiers, utilisez --out-dir au lieu de --out',
  'cli.notATty': 'Pas un terminal interactif : utilisez -o pour enregistrer ou --print pour afficher',
  'cli.offSwitch': '(--no-{name} le désactive)',
  'cli.colourCount': '{n} couleurs',
  'cli.listPalettes': 'PALETTES',
  'cli.listAlgorithms': 'ALGORITHMES',
  'cli.listPresets': 'PRÉRÉGLAGES',
  'cli.listThemes': 'THÈMES',
  'cli.listModes': 'APERÇUS',
};

const de = {
  'group.dither': 'DITHERING',
  'group.tone': 'TONWERT',
  'group.output': 'AUSGABE',
  'group.text': 'TEXT',

  'param.palette.label': 'Palette',
  'param.algorithm.label': 'Algorithmus',
  'param.scale.label': 'Pixel',
  'param.scale.hint': 'Verkleinert vor dem Dithern: 1 behält alle Details, 8 gibt grobe 8-Bit-Blöcke',
  'param.strength.label': 'Stärke',
  'param.strength.hint': 'Wie viel des Fehlers (oder des geordneten Rauschens) angewendet wird',
  'param.bias.label': 'Schwelle',
  'param.bias.hint': 'Verschiebt den Schnittpunkt: negativ dunkelt ab, positiv hellt auf',
  'param.noise.label': 'Körnung',
  'param.noise.hint': 'Zufälliges Rauschen vor der Schwelle: bricht zu regelmäßige Muster auf',
  'param.serpentine.label': 'Serpentine',
  'param.serpentine.hint': 'Zeilenweise wechselnde Laufrichtung: beseitigt diagonale Streifen',
  'param.brightness.label': 'Helligkeit',
  'param.contrast.label': 'Kontrast',
  'param.gamma.label': 'Gamma',
  'param.saturation.label': 'Sättigung',
  'param.sharpen.label': 'Schärfe',
  'param.sharpen.hint': 'Unscharfmaskierung: holt die feinen Details zurück, die das Dithering frisst',
  'param.invert.label': 'Umkehren',
  'param.aspect.label': 'Format',
  'param.aspect.hint': 'Bringt das Ergebnis auf ein festes Format, durch Beschnitt oder Balken',
  'param.aspect.value.source': 'Wie das Foto',
  'param.aspect.value.1:1': '1:1',
  'param.aspect.value.5:4': '5:4',
  'param.aspect.value.4:3': '4:3',
  'param.aspect.value.3:2': '3:2',
  'param.aspect.value.16:10': '16:10',
  'param.aspect.value.16:9': '16:9',
  'param.aspect.value.21:9': '21:9',
  'param.aspect.value.4:5': '4:5',
  'param.aspect.value.9:16': '9:16',
  'param.fit.label': 'Anpassen',
  'param.fit.hint': 'Was mit dem geschieht, was nicht ins Format passt',
  'param.fit.value.crop': 'Beschneiden',
  'param.fit.value.pad': 'Balken',
  'param.megapixels.label': 'Megapixel',
  'param.megapixels.hint': 'Auflösung des Ergebnisses: absenken, um das Foto absichtlich zu vergröbern',
  'param.upscale.label': 'Vergrößern',
  'param.upscale.hint': 'Bringt das Ergebnis mit harten Pixeln auf die alte Größe zurück',

  'palette.bw': '1 Bit S/W',
  'palette.gray4': 'Grau 4',
  'palette.gray8': 'Grau 8',
  'palette.gray16': 'Grau 16',
  'palette.cgaCyan': 'CGA Cyan',
  'palette.cgaGreen': 'CGA Grün',
  'palette.greenCrt': 'CRT grün',
  'palette.amberCrt': 'CRT bernstein',
  'palette.risograph': 'Risografie',
  'palette.blueprint': 'Blaupause',
  'palette.nes': 'NES',
  'palette.ega': 'EGA 16',
  'palette.msx': 'MSX',
  'palette.teletext': 'Videotext',
  'palette.amigaWb': 'Workbench',
  'palette.virtualBoy': 'Virtual Boy',
  'palette.bit8': '8-Bit-Farbe',
  'palette.megadrive': 'Mega Drive',
  'palette.custom': 'Eigene',

  'algorithm.none': 'Keiner (Schwelle)',
  'algorithm.random': 'Zufallsrauschen',
  'algorithm.cluster4': 'Raster 4x4',
  'algorithm.cluster8': 'Raster 8x8',
  'algorithm.lines4': 'Diagonale Linien',
  'algorithm.sierra2': 'Sierra 2 Zeilen',

  'preset.giornale': 'Zeitungsdruck',
  'preset.fanzine': 'Kopiertes Fanzine',
  'preset.terminale': 'Phosphor-Terminal',
  'preset.arcade': 'Arcade 16 Farben',
  'preset.incisione': 'Kupferstich',
  'preset.nes': '8-Bit-Konsole',
  'preset.megadrive': '16-Bit-Konsole',
  'preset.vga': 'VGA 256 Farben',
  'preset.msx': 'MSX-Kassette',
  'preset.workbench': 'Amiga Workbench',
  'preset.teletext': 'Videotext',
  'preset.virtualBoy': 'Virtual Boy',

  'mode.halfblock': 'Halbblöcke',
  'mode.quadrant': 'Quadranten',

  'ui.presets': 'Vorlagen',
  'ui.colours': 'Farben',
  'ui.open': 'Foto öffnen',
  'ui.noFile': 'keine Datei gewählt',
  'ui.shoot': 'Aufnehmen',
  'ui.download': 'PNG laden',
  'ui.reset': 'Zurücksetzen',
  'ui.dropTitle': 'Foto hierher ziehen',
  'ui.dropButton': 'Foto auswählen',
  'ui.dropHint': 'oder mit Strg+V einfügen — das Bild verlässt deinen Browser nie',
  'ui.noImage': 'kein Bild geladen',
  'ui.addColour': 'Farbe hinzufügen',
  'ui.removeColour': 'Diese Farbe entfernen',
  'ui.copyPalette': 'Gewählte Palette hierher kopieren',
  'ui.loading': 'Lade…',
  'ui.preparing': 'Bereite das PNG vor…',
  'ui.language': 'Sprache',
  'ui.view': 'Ansicht',
  'ui.viewImage': 'Bild',
  'ui.copy': 'Kopieren',
  'ui.copied': 'Kopiert',
  'ui.copyFailed': 'Kopieren fehlgeschlagen',
  'ui.columns': 'Spalten',
  'ui.chars': 'Z.',
  'ui.textHint': 'Das Foto in Zeichen geschrieben. Kopieren und einfügen, wo du willst.',
  'ui.error': 'Fehler: {msg}',
  'ui.notAnImage': 'Diese Datei ist kein Bild',
  'ui.unreadable': 'Bild nicht lesbar',
  'ui.exportFailed': 'Export fehlgeschlagen',
  'ui.saved': 'Gespeichert: {name}',
  'ui.cancelled': 'Speichern abgebrochen',
  'ui.tooLarge': 'Das PNG ist zu groß: Megapixel verringern',

  'tui.preview': 'VORSCHAU',
  'tui.controls': 'REGLER',
  'tui.files': 'DATEIEN',
  'tui.keys': 'TASTEN',
  'tui.theme': 'THEMA',
  'tui.preset': 'VORLAGE',
  'tui.language': 'SPRACHE',
  'tui.open': 'ÖFFNEN',
  'tui.save': 'SPEICHERN',
  'tui.tooSmall': 'Fenster zu klein (mindestens 40x12)',
  'tui.noImageHint': 'kein Bild · o öffnet einen Pfad · ? zeigt die Tasten',
  'tui.noImageHere': 'Hier ist kein Bild. Drücke o, um einen Pfad zu öffnen.',
  'tui.sample': 'Beispielbild. Mit o dein eigenes öffnen.',
  'tui.openHint': 'Pfad zu einem Bild oder einem Ordner',
  'tui.saveHint': 'Zieldatei (.png oder .jpg) — wird in voller Auflösung verarbeitet',
  'tui.confirm': 'Eingabe bestätigt · Esc bricht ab',
  'tui.onlyPngJpg': 'Nur .png oder .jpg',
  'tui.noImageLoaded': 'Kein Bild geladen',
  'tui.emptyFolder': 'Ordner enthält keine Bilder',
  'tui.reset': 'Parameter zurückgesetzt',
  'tui.previewMode': 'Vorschau: {name}',
  'tui.previewShort': 'vors. {size}',
  'guide.off': 'Aus',
  'guide.red': 'Rot',
  'guide.cyan': 'Cyan',
  'guide.yellow': 'Gelb',
  'guide.magenta': 'Magenta',
  'guide.green': 'Grün',
  'tui.guide': 'Rahmen',
  'tui.guideSet': 'Rahmen: {name}',
  'key.guide': 'Farbe des Rahmens',
  'tui.themeSet': 'Thema: {name}',
  'tui.presetSet': 'Vorlage: {name}',
  'tui.languageSet': 'Sprache: {name}',
  'tui.jobOpen': 'Öffne {name}',
  'tui.jobRead': 'Lese {name}',
  'tui.jobPreview': 'Bereite die Vorschau vor',
  'tui.jobSave': 'Speichere {name}',
  'tui.jobProcess': 'Verarbeite in voller Auflösung',
  'tui.jobWrite': 'Schreibe {size}',
  'tui.jobDone': 'Fertig',
  'tui.savedAs': 'Gespeichert: {name} ({size})',
  'tui.saveFailed': 'Speichern fehlgeschlagen: {msg}',
  'tui.loaded': '{name} · {size}',

  'key.move': 'Durch Parameter oder Dateien blättern',
  'key.adjust': 'Gewählten Wert verstellen',
  'key.adjustBig': 'In Fünferschritten verstellen',
  'key.activate': 'Auslösen: Datei laden, Schalter umlegen',
  'key.focus': 'Fokus zwischen Reglern und Dateien wechseln',
  'key.step': 'Nächstes und vorheriges Bild',
  'key.ends': 'An den Anfang / ans Ende springen',
  'key.mode': 'Vorschaumodus wechseln',
  'key.theme': 'Thema wählen',
  'key.preset': 'Vorlage anwenden',
  'key.lang': 'Sprache wählen',
  'key.invert': 'Umkehren (Kürzel)',
  'key.reset': 'Alle Parameter zurücksetzen',
  'key.openPath': 'Einen Pfad öffnen',
  'key.save': 'In voller Auflösung speichern',
  'key.files': 'Dateiliste ein- oder ausblenden',
  'key.help': 'Dieser Bildschirm',
  'key.quit': 'Beenden',

  'bar.move': 'blättern',
  'bar.adjust': 'regeln',
  'bar.focus': 'Fokus',
  'bar.preview': 'Vorschau',
  'bar.preset': 'Vorlage',
  'bar.theme': 'Thema',
  'bar.save': 'sichern',
  'bar.keys': 'Tasten',
  'bar.open': 'Pfad öffnen',
  'bar.quit': 'beenden',

  'cli.tagline': 'einstellbares Dithering für deine Fotos',
  'cli.missingValue': 'Wert für --{name} fehlt',
  'cli.wantsNumber': '--{name} erwartet eine Zahl, nicht „{value}“',
  'cli.noSuchValue': '--{name}: „{value}“ gibt es nicht. Werte: {list}',
  'cli.noSuchPreset': 'Vorlage „{name}“ gibt es nicht. Verfügbar: {list}',
  'cli.noSuchMode': 'Modus „{name}“ gibt es nicht. Verfügbar: {list}',
  'cli.noSuchLang': 'Sprache „{name}“ gibt es nicht. Verfügbar: {list}',
  'cli.notFound': '{name} nicht gefunden',
  'cli.onlyPngJpeg': '{name}: nur PNG und JPEG werden akzeptiert',
  'cli.needPrintFile': 'Mindestens eine Datei zum Ausgeben nötig',
  'cli.needProcessFile': 'Mindestens eine Datei zum Verarbeiten nötig',
  'cli.manyFiles': 'Bei mehreren Dateien --out-dir statt --out verwenden',
  'cli.notATty': 'Kein interaktives Terminal: -o zum Speichern oder --print zur Ausgabe',
  'cli.offSwitch': '(--no-{name} schaltet es aus)',
  'cli.colourCount': '{n} Farben',
  'cli.listPalettes': 'PALETTEN',
  'cli.listAlgorithms': 'ALGORITHMEN',
  'cli.listPresets': 'VORLAGEN',
  'cli.listThemes': 'THEMEN',
  'cli.listModes': 'VORSCHAUEN',
};

const DIZIONARI = { en, it, es, fr, de };

/** La lingua e' valida se la conosciamo; se no si ricade sull'inglese. */
function normalizeLocale(locale) {
  if (!locale) return DEFAULT_LOCALE;
  const corto = String(locale).toLowerCase().split(/[-_]/)[0];
  return LOCALES.includes(corto) ? corto : DEFAULT_LOCALE;
}

/**
 * Lingua da usare quando nessuno ne ha chiesta una.
 * Nel browser si guarda cosa preferisce chi legge; altrove, inglese.
 */
function detectLocale(preferite) {
  const elenco = preferite
    || (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language]))
    || [];
  for (const l of elenco) {
    const corto = String(l || '').toLowerCase().split(/[-_]/)[0];
    if (LOCALES.includes(corto)) return corto;
  }
  return DEFAULT_LOCALE;
}

/**
 * Costruisce la funzione di traduzione per una lingua.
 *
 * `t('ui.copy')` restituisce la stringa; `t('ui.saved', { name: 'x.png' })`
 * sostituisce i segnaposto fra graffe. Una chiave che non esiste torna com'e',
 * cosi' un refuso si vede subito invece di sparire in una stringa vuota.
 */
function createTranslator(locale) {
  const lingua = normalizeLocale(locale);
  const dizionario = DIZIONARI[lingua];
  const t = (key, valori) => {
    const testo = (dizionario && dizionario[key]) ?? en[key] ?? key;
    if (!valori) return testo;
    return testo.replace(/\{(\w+)\}/g, (intero, nome) => (
      valori[nome] === undefined ? intero : String(valori[nome])
    ));
  };
  t.locale = lingua;
  return t;
}

/** Tutte le chiavi conosciute: la usano i test per scovare buchi e refusi. */
function allKeys() {
  return Object.keys(en);
}



/** Vero se la chiave esiste nel riferimento inglese. Serve ai suggerimenti,
 *  che non tutti i parametri hanno. */
function hasKey(key) {
  return en[key] !== undefined;
}

  return { DEFAULT_LOCALE, DICTIONARIES: DIZIONARI, LOCALES, LOCALE_NAMES, allKeys, createTranslator, detectLocale, hasKey, normalizeLocale };
})();

const __m_src_core_textart_js = (() => {
  const { luma, resampleBox, applyAdjustments, sharpen } = __m_src_core_adjust_js;
  const { ditherImage } = __m_src_core_dither_js;
  const { paletteInfo } = __m_src_core_palettes_js;
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





/** Dal buio al pieno. Pensata per fondo scuro: piu' denso = piu' chiaro. */
const ASCII_RAMP = ' .·:;+=xX$&@█';

const TEXT_MODES = ['ascii', 'braille'];

/**
 * Quanti pixel entrano in una cella, e quanto va allargata l'immagine perche'
 * a schermo torni con le proporzioni giuste: una cella di testo e' larga uno
 * e alta circa due.
 */
const TEXT_CELLS = {
  ascii: { cx: 1, cy: 1, ratio: 2 },
  braille: { cx: 2, cy: 4, ratio: 1 },
};

/** Il carattere della rampa per una luminanza 0-255. */
function asciiChar(l) {
  const ultimo = ASCII_RAMP.length - 1;
  return ASCII_RAMP[Math.max(0, Math.min(ultimo, Math.round((l / 255) * ultimo)))];
}

/**
 * Soglia adattiva: la meta' fra il pixel piu' scuro e il piu' chiaro.
 * Su un'immagine gia' ditherata a due tinte cade esattamente in mezzo.
 */
function brailleThreshold(img) {
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
function brailleCell(img, x, y, threshold) {
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
function textTarget(srcWidth, srcHeight, cols, mode) {
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
function fitForText(img, cols, mode) {
  const t = textTarget(img.width, img.height, cols, mode);
  return resampleBox(img, t.width, t.height);
}

/**
 * L'immagine come testo semplice, senza colori: pronta da copiare e
 * incollare. L'immagine deve gia' avere le misure date da textTarget.
 */
function toText(img, mode = 'ascii') {
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
function imageToText(source, options = {}) {
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

  return { ASCII_RAMP, TEXT_CELLS, TEXT_MODES, asciiChar, brailleCell, brailleThreshold, fitForText, imageToText, textTarget, toText };
})();

const __m_src_core_options_js = (() => {
  const { ALGORITHMS } = __m_src_core_dither_js;
  const { PALETTE_KEYS, isCustomPalette } = __m_src_core_palettes_js;
  const { createTranslator, hasKey } = __m_src_core_i18n_js;
/**
 * Schema dei parametri, definito una volta sola.
 * Sia il widget web sia la TUI costruiscono i propri controlli iterando
 * questa lista: aggiungere un parametro qui lo fa comparire in entrambi.
 */





/** @typedef {'enum'|'range'|'bool'} ParamType */

const PARAMS = [
  {
    key: 'palette',
    group: 'dither',
    type: 'enum',
    values: PALETTE_KEYS,
    default: 'bw',
  },
  {
    key: 'algorithm',
    group: 'dither',
    type: 'enum',
    values: ALGORITHMS,
    default: 'floydSteinberg',
  },
  {
    key: 'scale',
    group: 'dither',
    type: 'range',
    min: 1,
    max: 16,
    step: 1,
    default: 1,
    unit: 'x',
  },
  {
    key: 'strength',
    group: 'dither',
    type: 'range',
    min: 0,
    max: 200,
    step: 5,
    default: 100,
    unit: '%',
  },
  {
    key: 'bias',
    group: 'dither',
    type: 'range',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
  },
  {
    key: 'noise',
    group: 'dither',
    type: 'range',
    min: 0,
    max: 100,
    step: 1,
    default: 0,
    unit: '%',
  },
  {
    key: 'serpentine',
    group: 'dither',
    type: 'bool',
    default: true,
  },

  {
    key: 'brightness',
    group: 'tone',
    type: 'range',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
  },
  {
    key: 'contrast',
    group: 'tone',
    type: 'range',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
  },
  {
    key: 'gamma',
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
    group: 'tone',
    type: 'range',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
  },
  {
    key: 'sharpen',
    group: 'tone',
    type: 'range',
    min: 0,
    max: 200,
    step: 5,
    default: 0,
    unit: '%',
  },
  {
    key: 'invert',
    group: 'tone',
    type: 'bool',
    default: false,
  },

  {
    key: 'aspect',
    group: 'output',
    type: 'enum',
    // I rapporti che la gente chiede davvero, dal quadrato del social al
    // cinemascope, piu' i due verticali. 'source' lascia la foto com'e' ed
    // e' il default: nessuno vuole che un programma di dithering gli
    // ritagli la fotografia senza averlo chiesto.
    values: ['source', '1:1', '5:4', '4:3', '3:2', '16:10', '16:9', '21:9', '4:5', '9:16'],
    default: 'source',
  },
  {
    key: 'fit',
    group: 'output',
    type: 'enum',
    values: ['crop', 'pad'],
    default: 'crop',
  },
  {
    key: 'megapixels',
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
  },
  {
    key: 'upscale',
    group: 'output',
    type: 'bool',
    default: true,
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

/**
 * Etichette tradotte.
 *
 * I dati qui sopra non portano piu' testo: le scritte arrivano tutte da
 * i18n.js, cosi' una stringa si traduce una volta sola e nessuna interfaccia
 * puo' restare indietro rispetto alle altre. Ogni funzione vuole il
 * traduttore della lingua scelta; senza, si parla inglese.
 */
const inglese = createTranslator('en');

function groupLabel(group, t = inglese) {
  return t(`group.${group}`);
}

function paramLabel(param, t = inglese) {
  return t(`param.${param.key}.label`);
}

/** Il suggerimento e' facoltativo: non tutti i parametri ne hanno uno. */
function paramHint(param, t = inglese) {
  const key = `param.${param.key}.hint`;
  return hasKey(key) ? t(key) : null;
}

/**
 * Il rapporto largh/alt chiesto, o null per 'source'.
 *
 * Si legge dal nome invece di tenere una tabella: '16:9' dice gia' tutto, e
 * una tabella sarebbe una seconda lista da tenere allineata a `values`.
 */
function aspectRatio(value) {
  const m = /^(\d+):(\d+)$/.exec(String(value));
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return h > 0 && w > 0 ? w / h : null;
}

function paletteLabel(key, t = inglese) {
  return t(`palette.${key}`);
}

function algorithmLabel(key, t = inglese) {
  return t(`algorithm.${key}`);
}

function presetLabel(key, t = inglese) {
  return t(`preset.${key}`);
}

/** L'etichetta di un valore di un parametro a elenco. */
function enumLabel(param, value, t = inglese) {
  if (param.key === 'palette') return paletteLabel(value, t);
  if (param.key === 'algorithm') return algorithmLabel(value, t);
  // Gli altri elenchi si traducono per convenzione, param.<chiave>.value.<v>.
  // Chi non ha una voce resta com'e': i rapporti come '16:9' sono gia' la
  // loro etichetta in ogni lingua, e tradurli sarebbe solo un modo di
  // sbagliarli.
  const key = `param.${param.key}.value.${value}`;
  return hasKey(key) ? t(key) : String(value);
}

const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.key, p.default]));

/** Preset pronti: la stessa lista alimenta il menu web e il picker della TUI. */
const PRESETS = {
  macintosh: {
    options: { palette: 'bw', algorithm: 'atkinson', contrast: 15, sharpen: 40 },
  },
  giornale: {
    options: { palette: 'bw', algorithm: 'cluster8', scale: 2, contrast: 20 },
  },
  gameboy: {
    options: { palette: 'gameboy', algorithm: 'bayer4', scale: 4, contrast: 10 },
  },
  fanzine: {
    options: { palette: 'bw', algorithm: 'bayer8', contrast: 45, sharpen: 80, noise: 8 },
  },
  terminale: {
    options: { palette: 'greenCrt', algorithm: 'bayer4', scale: 2, contrast: 25 },
  },
  arcade: {
    options: { palette: 'pico8', algorithm: 'floydSteinberg', scale: 3, saturation: 25 },
  },
  cga: {
    options: { palette: 'cgaCyan', algorithm: 'bayer4', scale: 3, saturation: 20 },
  },
  incisione: {
    options: { palette: 'bw', algorithm: 'lines4', contrast: 30, sharpen: 60 },
  },

  // ------------------------------------------------- console e computer
  //
  // Ogni epoca la fanno tre cose insieme: quanti colori c'erano, quanto
  // erano grossi i pixel e che trama usava il dithering. La tavolozza da
  // sola non basta: senza il pixelone e la trama giusta una foto a 55
  // colori sembra solo una foto sbiadita, non un gioco.

  // NES: pochi colori molto saturi e pixel grossi. La matrice di Bayer e'
  // storicamente giusta, il rumore a diffusione su quello schermo non
  // c'era.
  nes: {
    options: {
      palette: 'nes', algorithm: 'bayer4', scale: 3,
      contrast: 15, saturation: 20,
    },
  },

  // Mega Drive: gli stessi 512 colori dell'hardware, pixel medi e una
  // trama fitta. Il Mega Drive il dithering lo usava eccome, per far
  // finta di avere sfumature che non poteva permettersi.
  // Il pixel grosso conta quanto la tavolozza: 512 colori a piena
  // risoluzione somigliano troppo alla foto, e l'epoca non si riconosce.
  // A quattro sono i 320x224 di allora, e il retino nel muro si vede.
  megadrive: {
    options: {
      palette: 'megadrive', algorithm: 'bayer8', scale: 4,
      saturation: 25, contrast: 15,
    },
  },

  // VGA 256 colori: il colore a 8 bit vero, con la diffusione dell'errore
  // che i visualizzatori di immagini DOS facevano davvero. Il pixel doppio
  // non e' un vezzo: a 256 colori e piena risoluzione il risultato somiglia
  // troppo alla foto di partenza, e il preset sembra non fare niente.
  vga: {
    options: { palette: 'bit8', algorithm: 'floydSteinberg', scale: 2 },
  },

  // MSX: quindici colori e pixel enormi, come i giochi su cassetta.
  msx: {
    options: {
      palette: 'msx', algorithm: 'bayer2', scale: 4, contrast: 20, saturation: 15,
    },
  },

  // Amiga Workbench: quattro colori e il retino a punti grossi. Non e' un
  // gioco, e' la scrivania, ed e' altrettanto riconoscibile.
  workbench: {
    options: {
      palette: 'amigaWb', algorithm: 'cluster4', scale: 2, contrast: 25,
    },
  },

  // Teletext: otto colori puri e blocchi grossissimi, come le pagine del
  // Televideo.
  teletext: {
    options: {
      palette: 'teletext', algorithm: 'bayer2', scale: 4,
      contrast: 20, saturation: 40,
    },
  },

  // Virtual Boy: rosso e nero, e nient'altro.
  virtualBoy: {
    options: {
      palette: 'virtualBoy', algorithm: 'bayer4', scale: 2, contrast: 25,
    },
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

/**
 * L'ultimo gradino dei megapixel che serva davvero a qualcosa.
 *
 * La riduzione non ingrandisce mai: chiedere piu' megapixel di quanti la
 * foto ne abbia lascia le cose come stanno. Senza questo taglio meta'
 * della corsa del cursore e' morta - su una foto da 0.76 MP i dodici
 * gradini da 1 MP in su davano tutti lo stesso identico file - e chi lo
 * trascina crede che il comando sia rotto.
 *
 * Restituisce l'indice del primo gradino che raggiunge o supera la misura
 * della foto: quello e' "piena risoluzione", oltre non c'e' niente.
 */
function usefulStepCeiling(param, sourceMegapixels) {
  const steps = paramSteps(param);
  if (!steps || !Number.isFinite(sourceMegapixels) || sourceMegapixels <= 0) {
    return steps ? steps.length - 1 : 0;
  }
  const i = steps.findIndex((v) => v >= sourceMegapixels);
  return i < 0 ? steps.length - 1 : i;
}

/**
 * I megapixel che si otterranno davvero, che non possono superare quelli
 * della foto di partenza. E' il numero da mostrare accanto al cursore:
 * scrivere "8 MP" sotto una foto da 0.76 sarebbe una bugia.
 */
function effectiveMegapixels(sourceWidth, sourceHeight, requested) {
  const propri = (sourceWidth * sourceHeight) / 1e6;
  if (!Number.isFinite(propri) || propri <= 0) return requested;
  return Math.min(requested, propri);
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
function formatValue(param, value, t = inglese) {
  if (param.type === 'bool') return value ? 'ON' : 'OFF';
  if (param.type === 'enum') {
    if (isCustomPalette(value)) return t('palette.custom');
    return enumLabel(param, value, t);
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

  return { DEFAULTS, PARAMS, PARAM_BY_KEY, PRESETS, algorithmLabel, applyPreset, aspectRatio, effectiveMegapixels, enumLabel, formatValue, groupLabel, normalizeOptions, paletteLabel, paramHint, paramLabel, paramSteps, presetLabel, stepBy, stepIndex, usefulStepCeiling };
})();

const __m_src_core_process_js = (() => {
  const { applyAdjustments, sharpen, downscaleByFactor, upscaleByFactor, resampleBox, cloneImage, cropToAspect, padToAspect, cropFrame, padFrame, luma } = __m_src_core_adjust_js;
  const { buildQuantizer, ditherImage } = __m_src_core_dither_js;
  const { paletteInfo } = __m_src_core_palettes_js;
  const { normalizeOptions, aspectRatio } = __m_src_core_options_js;
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
function exportSize(width, height, rawOptions = {}) {
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
function targetSize(width, height, megapixels) {
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

  return { exportSize, processImage, targetSize };
})();

const __m_src_core_index_js = Object.assign({}, __m_src_core_i18n_js, __m_src_core_palettes_js, __m_src_core_matrices_js, __m_src_core_adjust_js, __m_src_core_dither_js, __m_src_core_textart_js, __m_src_core_options_js, __m_src_core_process_js);

const __m_src_web_ditherbox_js = (() => {
  const { PARAMS, PRESETS, DEFAULTS, PALETTES, normalizeOptions, formatValue, applyPreset, paramSteps, stepIndex, usefulStepCeiling, effectiveMegapixels, groupLabel, paramLabel, paramHint, presetLabel, paletteLabel, enumLabel, processImage, targetSize, resampleBox, fitWithin, paletteInfo, rgbToHex, stringifyPalette, isCustomPalette, imageToText, TEXT_MODES, createTranslator, detectLocale, normalizeLocale, LOCALES, LOCALE_NAMES } = __m_src_core_index_js;
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
      img.onerror = () => reject(new Error('unreadable'));
      img.src = url;
    });
    return img;
  } finally {
    if (source instanceof Blob) URL.revokeObjectURL(url);
  }
}

/**
 * Il nome da mostrare nel campo in cima.
 *
 * Da un File si legge; da un URL si prende l'ultimo pezzo del percorso,
 * se no una foto precaricata comparirebbe come "nessun file scelto"
 * mentre la si sta guardando.
 */
function nomeDellaSorgente(source) {
  if (source instanceof File) return source.name;
  if (typeof source !== 'string') return null;
  try {
    const percorso = new URL(source, document.baseURI).pathname;
    return decodeURIComponent(percorso.split('/').pop()) || null;
  } catch {
    return source.split(/[?#]/)[0].split('/').pop() || null;
  }
}

/**
 * Scrive negli appunti. L'API moderna esiste solo in contesto sicuro
 * (https o localhost); altrove si ripiega sulla selezione di un campo
 * nascosto, che e' brutta ma funziona da vent'anni.
 */
async function scriviNegliAppunti(testo) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(testo);
      return true;
    }
  } catch { /* si prova il ripiego */ }

  try {
    const area = document.createElement('textarea');
    area.value = testo;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    const esito = document.execCommand('copy');
    area.remove();
    return esito;
  } catch {
    return false;
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
   * @param {'dark'|'light'} [config.theme]  impone lo schema invece di
   *   seguire le preferenze del sistema: serve ai siti che vivono di un
   *   solo schema e non devono ribaltarsi addosso al visitatore.
   * @param {string} [config.lang]  lingua dell'interfaccia (en, it, es, fr,
   *   de). Senza indicazione si guarda quella del browser, e se non e' fra
   *   queste si parla inglese.
   * @param {boolean} [config.languagePicker=true] mostra il selettore.
   */
  constructor(target, config = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) throw new Error(`DitherBox: elemento non trovato (${target})`);

    this.root = root;
    this.config = {
      previewMaxSize: 900,
      presets: true,
      languagePicker: true,
      downloadName: 'ditherbox.png',
      ...config,
    };
    this.locale = config.lang ? normalizeLocale(config.lang) : detectLocale();
    this.t = createTranslator(this.locale);
    this.view = 'image';           // image | ascii | braille
    this.textCols = 100;
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
    if (config.src) {
      // Una foto precaricata e' una comodita', non qualcosa che chi guarda
      // ha chiesto: se non arriva (percorso sbagliato, oppure la pagina
      // aperta da disco invece che da un server, dove il browser blocca la
      // richiesta) si resta sul riquadro vuoto invece di aprire la giornata
      // con un errore rosso. `load` ha gia' segnalato il guasto per conto suo.
      this.load(config.src).catch(() => {
        this.#status(this.t('ui.noImage'));
      });
    }
  }

  // ---------------------------------------------------------------- API

  /** Carica un File, un Blob o un URL. */
  async load(source, name) {
    const t = this.t;
    this.#status(t('ui.loading'));
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
      this.sourceName = name || nomeDellaSorgente(source);
      this.root.classList.add('is-loaded');
      if (this.fileName) this.fileName.textContent = this.sourceName || t('ui.noFile');
      // Il limite utile dei megapixel dipende dalla foto: cambiata la foto,
      // vanno rifatti i conti sul cursore.
      this.#syncControls();
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

  /** Cambia la lingua dell'interfaccia e ridisegna i controlli. */
  setLocale(locale) {
    const nuova = normalizeLocale(locale);
    if (nuova === this.locale) return;
    this.locale = nuova;
    this.t = createTranslator(nuova);
    // I controlli portano il testo dentro: si ricostruiscono invece di
    // rincorrere ogni etichetta. Lo stato sta tutto in this.options.
    this.controls.clear();
    this.#build();
    this.render();
    this.#emit('change', this.getOptions());
  }

  getLocale() {
    return this.locale;
  }

  /** Passa fra immagine, ASCII e braille. */
  setView(view) {
    this.view = ['ascii', 'braille'].includes(view) ? view : 'image';
    this.#syncView();
    this.render();
  }

  getView() {
    return this.view;
  }

  /** Il testo della vista corrente, anche senza cambiare vista. */
  toText(mode = this.view === 'image' ? 'ascii' : this.view) {
    if (!this.source) throw new Error(this.t('ui.noImage'));
    return imageToText(this.source, { ...this.options, mode, cols: this.textCols });
  }

  /**
   * Copia negli appunti il testo della vista.
   *
   * `navigator.clipboard` non c'e' fuori dai contesti sicuri e in qualche
   * browser vecchio: in quel caso si ripiega sulla vecchia selezione di un
   * campo nascosto, che funziona ovunque.
   */
  async copyText() {
    let testo;
    try {
      testo = this.toText();
    } catch (err) {
      this.#fail(err);
      return false;
    }
    const riuscito = await scriviNegliAppunti(testo);
    this.#flashCopy(riuscito);
    return riuscito;
  }

  /** Torna ai valori di partenza. */
  reset() {
    this.set({ ...DEFAULTS, ...(this.config.options || {}) });
  }

  /** Ricalcola l anteprima. Debounced: gli slider sparano decine di eventi. */
  render() {
    if (!this.source) return;
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
    if (!this.source) throw new Error(this.t('ui.noImage'));
    const { image } = processImage(this.source, this.options);
    return this.#toCanvas(image);
  }

  /** @returns {Promise<Blob>} il PNG a piena risoluzione. */
  toBlob(type = 'image/png', quality) {
    const canvas = this.renderFull();
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error(this.t('ui.exportFailed')))),
        type,
        quality,
      );
    });
  }

  /** Scarica il risultato come PNG. */
  async download(filename) {
    this.#status(this.t('ui.preparing'));
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
    if (this.config.theme) this.root.removeAttribute('data-theme');
  }

  // ------------------------------------------------------- costruzione UI

  #build() {
    const root = this.root;
    root.classList.add('dbx');
    if (this.config.theme) root.setAttribute('data-theme', this.config.theme);
    root.replaceChildren();

    root.append(this.#buildStage(), this.#buildPanel());
    this.#wireDropZone();
    this.#syncControls();
    this.#syncView();
  }

  #buildStage() {
    const t = this.t;
    const stage = el('div', 'dbx__stage');

    // Barra delle viste: immagine, oppure la stessa foto scritta coi
    // caratteri. Sta sopra il contenuto invece che sovrapposta, cosi' non
    // copre mai un angolo dell'immagine.
    stage.appendChild(this.#buildViewBar());

    const area = el('div', 'dbx__area');
    this.canvas = el('canvas', 'dbx__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.textPane = el('pre', 'dbx__text', { tabindex: '0', 'aria-label': t('ui.textHint') });
    this.textPane.hidden = true;
    area.append(this.canvas, this.textPane);

    const drop = el('div', 'dbx__drop');
    const invito = el('button', 'dbx__drop-button', {
      type: 'button', text: t('ui.dropButton'),
    });
    invito.addEventListener('click', () => this.fileInput.click());
    drop.append(
      this.#cameraIcon(),
      el('p', 'dbx__drop-title', { text: t('ui.dropTitle') }),
      invito,
      el('p', 'dbx__drop-sub', { text: t('ui.dropHint') }),
    );
    area.appendChild(drop);
    stage.appendChild(area);

    this.statusEl = el('div', 'dbx__status', { role: 'status', 'aria-live': 'polite' });
    stage.appendChild(this.statusEl);
    return stage;
  }

  /** Le tre viste, piu' i comandi che servono solo a quelle testuali. */
  #buildViewBar() {
    const t = this.t;
    const bar = el('div', 'dbx__viewbar');

    this.viewButtons = new Map();
    const viste = [
      ['image', t('ui.viewImage')],
      ['ascii', t('mode.ascii')],
      ['braille', t('mode.braille')],
    ];
    const gruppo = el('div', 'dbx__views', { role: 'tablist', 'aria-label': t('ui.view') });
    for (const [chiave, etichetta] of viste) {
      const b = el('button', 'dbx__view', {
        type: 'button', role: 'tab', text: etichetta,
      });
      b.addEventListener('click', () => this.setView(chiave));
      gruppo.appendChild(b);
      this.viewButtons.set(chiave, b);
    }
    bar.appendChild(gruppo);

    // Comandi della vista testo: quante colonne, e il pulsante per copiare.
    this.textTools = el('div', 'dbx__texttools');

    const etichettaCol = el('label', 'dbx__viewlabel', { text: t('ui.columns') });
    this.colsInput = el('input', 'dbx__cols', {
      type: 'range', min: 20, max: 200, step: 4, value: String(this.textCols),
    });
    this.colsValue = el('output', 'dbx__viewvalue', { text: String(this.textCols) });
    this.colsInput.addEventListener('input', () => {
      this.textCols = Number(this.colsInput.value);
      this.colsValue.textContent = String(this.textCols);
      this.render();
    });
    etichettaCol.appendChild(this.colsInput);

    this.copyButton = el('button', 'dbx__button dbx__button--copy', {
      type: 'button', text: t('ui.copy'),
    });
    this.copyButton.addEventListener('click', () => this.copyText());

    this.textTools.append(etichettaCol, this.colsValue, this.copyButton);
    bar.appendChild(this.textTools);
    return bar;
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
    const t = this.t;
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
    this.fileName = el('span', 'dbx__file-name', { text: t('ui.noFile') });
    field.append(
      this.fileInput,
      el('span', 'dbx__file-label', { text: t('ui.open') }),
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
      type: 'button', text: t('ui.shoot'), title: t('ui.shoot'),
    });
    shoot.addEventListener('click', () => this.cameraInput.click());
    bar.append(shoot, this.cameraInput);

    if (this.config.languagePicker) {
      const scelta = el('select', 'dbx__lang', { 'aria-label': t('ui.language'), title: t('ui.language') });
      for (const l of LOCALES) {
        scelta.appendChild(el('option', null, { value: l, text: LOCALE_NAMES[l] }));
      }
      scelta.value = this.locale;
      scelta.addEventListener('change', () => this.setLocale(scelta.value));
      bar.appendChild(scelta);
    }

    return bar;
  }

  #buildScroller() {
    const t = this.t;
    const scroller = el('div', 'dbx__scroll');

    if (this.config.presets) {
      scroller.appendChild(this.#buildSection(t('ui.presets'), this.#buildPresetChips()));
    }
    scroller.appendChild(this.#buildSection(t('ui.colours'), this.#buildPaletteChips()));

    const groups = new Map();
    for (const param of PARAMS) {
      // La palette ha gia' il suo selettore a campioni qui sopra.
      if (param.key === 'palette') continue;
      if (!groups.has(param.group)) {
        const body = el('div', 'dbx__controls');
        groups.set(param.group, body);
        scroller.appendChild(this.#buildSection(groupLabel(param.group, t), body));
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
    const t = this.t;
    const bar = el('div', 'dbx__chips');
    for (const key of Object.keys(PRESETS)) {
      const b = el('button', 'dbx__chip', { type: 'button', text: presetLabel(key, t) });
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
    const t = this.t;
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
      aggiungi(key, paletteLabel(key, t), entry.colors);
    }

    // Voce personalizzata: si aggiorna insieme all'editor qui sotto.
    this.customButton = aggiungi('__custom__', t('palette.custom'), this.customColors);
    this.customButton.addEventListener('click', () => {
      this.set({ palette: stringifyPalette(this.customColors) });
    });

    wrap.appendChild(this.#buildCustomEditor());
    return wrap;
  }

  /** Editor della palette personalizzata: una fila di selettori colore. */
  #buildCustomEditor() {
    const t = this.t;
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
            type: 'button', text: '×', title: t('ui.removeColour'),
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
      type: 'button', text: '+', title: t('ui.addColour'),
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
      type: 'button', text: '⧉', title: t('ui.copyPalette'),
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
    const t = this.t;
    const id = `dbx-${param.key}-${Math.random().toString(36).slice(2, 7)}`;
    const wrap = el('div', `dbx__control dbx__control--${param.type}`);
    const label = el('label', 'dbx__label', { for: id, text: paramLabel(param, t) });
    const hint = paramHint(param, t);
    if (hint) label.title = hint;
    wrap.appendChild(label);

    let input;
    let value = null;

    if (param.type === 'enum') {
      input = el('select', 'dbx__select', { id });
      for (const v of param.values) {
        input.appendChild(el('option', null, { value: v, text: enumLabel(param, v, t) }));
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

    if (hint) input.title = hint;
    wrap.appendChild(input);
    if (value) wrap.appendChild(value);

    this.controls.set(param.key, { param, input, value });
    return wrap;
  }

  #buildActions() {
    const t = this.t;
    const actions = el('div', 'dbx__actions');

    const save = el('button', 'dbx__button dbx__button--primary', {
      type: 'button', text: t('ui.download'),
    });
    save.addEventListener('click', () => this.download().catch((e) => this.#fail(e)));

    const reset = el('button', 'dbx__button dbx__button--ghost', {
      type: 'button', text: t('ui.reset'),
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
          this.#fail(new Error(this.t('ui.notAnImage')));
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
      if (param.type === 'bool') {
        input.checked = Boolean(v);
      } else if (param.type === 'range') {
        input.value = stepIndex(param, v);
      } else {
        input.value = v;
      }

      // I megapixel sono l'unico comando il cui limite utile dipende dalla
      // foto caricata: chiederne piu' di quanti ne ha non fa niente. Il
      // cursore si accorcia fino al primo gradino che copre la foto, cosi'
      // ogni posizione cambia davvero qualcosa, e il numero accanto dice
      // quello che si otterra' e non quello che si e' chiesto.
      if (key === 'megapixels' && this.source) {
        const propri = (this.source.width * this.source.height) / 1e6;
        const tetto = usefulStepCeiling(param, propri);
        input.max = String(tetto);
        if (Number(input.value) > tetto) input.value = String(tetto);
        if (value) {
          value.textContent = formatValue(
            param, effectiveMegapixels(this.source.width, this.source.height, v), this.t,
          );
        }
        continue;
      }

      if (value) value.textContent = formatValue(param, v, this.t);
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
    if (this.view !== 'image') return this.#drawText();
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

  /** Rende la foto come testo e la mette nel riquadro, con la misura del
   *  carattere calcolata perche' le colonne ci stiano tutte. */
  #drawText() {
    const started = performance.now();
    const testo = imageToText(this.source, {
      ...this.options, mode: this.view, cols: this.textCols,
    });
    this.textPane.textContent = testo;
    this.#fitText();

    const righe = testo.split('\n').length;
    const ms = Math.round(performance.now() - started);
    this.#status(`${this.textCols}×${righe} · ${testo.length} ${this.t('ui.chars')} · ${ms} ms`);
  }

  /** La larghezza di un carattere non e' nota a priori: la si misura una
   *  volta e da li' si ricava la dimensione che fa entrare le colonne. */
  #fitText() {
    const pane = this.textPane;
    const utile = pane.clientWidth - 16;
    if (utile <= 0) return;
    pane.style.fontSize = '20px';
    const prima = pane.scrollWidth;
    const perCarattere = prima / this.textCols / 20;
    pane.style.fontSize = '';
    if (!perCarattere) return;
    const dimensione = Math.max(3, Math.min(16, utile / this.textCols / perCarattere));
    pane.style.fontSize = `${dimensione.toFixed(2)}px`;
  }

  /** Accende la vista scelta e spegne le altre. */
  #syncView() {
    const testuale = this.view !== 'image';
    if (this.canvas) this.canvas.hidden = testuale;
    if (this.textPane) this.textPane.hidden = !testuale;
    if (this.textTools) this.textTools.hidden = !testuale;
    if (this.viewButtons) {
      for (const [chiave, b] of this.viewButtons) {
        const attiva = chiave === this.view;
        b.classList.toggle('is-active', attiva);
        b.setAttribute('aria-selected', String(attiva));
      }
    }
  }

  /** Conferma visiva sul pulsante, senza aprire finestre. */
  #flashCopy(riuscito) {
    if (!this.copyButton) return;
    const t = this.t;
    this.copyButton.textContent = t(riuscito ? 'ui.copied' : 'ui.copyFailed');
    this.copyButton.classList.toggle('is-done', riuscito);
    clearTimeout(this._copyTimer);
    this._copyTimer = setTimeout(() => {
      this.copyButton.textContent = t('ui.copy');
      this.copyButton.classList.remove('is-done');
    }, 1600);
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
    this.#status(this.t('ui.error', { msg: err.message }));
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
 * piu' data-src, data-lang e data-theme, che opzioni non sono.
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
    boxes.push(new DitherBox(node, {
      options,
      src: node.dataset.src || undefined,
      lang: node.dataset.lang || undefined,
      // Se l'attributo c'e' gia' nell'HTML lo legge direttamente il foglio
      // di stile; qui serve solo perche' il widget sappia di averlo.
      theme: node.dataset.theme || undefined,
    }));
  }
  return boxes;
}




  return { DEFAULTS, DitherBox, PALETTES, PARAMS, PRESETS, autoInit, ditherToCanvas, processImage };
})();

global.DitherBox = Object.assign(__m_src_web_ditherbox_js.DitherBox, {
  ALGORITHMS: __m_src_core_index_js.ALGORITHMS,
  ASCII_RAMP: __m_src_core_index_js.ASCII_RAMP,
  DEFAULTS: __m_src_core_index_js.DEFAULTS,
  DEFAULT_LOCALE: __m_src_core_index_js.DEFAULT_LOCALE,
  DICTIONARIES: __m_src_core_index_js.DICTIONARIES,
  DIFFUSION_ALGORITHMS: __m_src_core_index_js.DIFFUSION_ALGORITHMS,
  DIFFUSION_KERNELS: __m_src_core_index_js.DIFFUSION_KERNELS,
  LOCALES: __m_src_core_index_js.LOCALES,
  LOCALE_NAMES: __m_src_core_index_js.LOCALE_NAMES,
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
  TEXT_CELLS: __m_src_core_index_js.TEXT_CELLS,
  TEXT_MODES: __m_src_core_index_js.TEXT_MODES,
  algorithmLabel: __m_src_core_index_js.algorithmLabel,
  allKeys: __m_src_core_index_js.allKeys,
  applyAdjustments: __m_src_core_index_js.applyAdjustments,
  applyPreset: __m_src_core_index_js.applyPreset,
  asciiChar: __m_src_core_index_js.asciiChar,
  aspectRatio: __m_src_core_index_js.aspectRatio,
  bayer: __m_src_core_index_js.bayer,
  bayerMatrix: __m_src_core_index_js.bayerMatrix,
  bitDepthPalette: __m_src_core_index_js.bitDepthPalette,
  brailleCell: __m_src_core_index_js.brailleCell,
  brailleThreshold: __m_src_core_index_js.brailleThreshold,
  buildQuantizer: __m_src_core_index_js.buildQuantizer,
  cloneImage: __m_src_core_index_js.cloneImage,
  createImage: __m_src_core_index_js.createImage,
  createTranslator: __m_src_core_index_js.createTranslator,
  cropFrame: __m_src_core_index_js.cropFrame,
  cropToAspect: __m_src_core_index_js.cropToAspect,
  detectLocale: __m_src_core_index_js.detectLocale,
  ditherImage: __m_src_core_index_js.ditherImage,
  downscaleByFactor: __m_src_core_index_js.downscaleByFactor,
  effectiveMegapixels: __m_src_core_index_js.effectiveMegapixels,
  enumLabel: __m_src_core_index_js.enumLabel,
  exportSize: __m_src_core_index_js.exportSize,
  fitForText: __m_src_core_index_js.fitForText,
  fitWithin: __m_src_core_index_js.fitWithin,
  formatValue: __m_src_core_index_js.formatValue,
  grayRamp: __m_src_core_index_js.grayRamp,
  groupLabel: __m_src_core_index_js.groupLabel,
  hasKey: __m_src_core_index_js.hasKey,
  hexToRgb: __m_src_core_index_js.hexToRgb,
  imageToText: __m_src_core_index_js.imageToText,
  isCustomPalette: __m_src_core_index_js.isCustomPalette,
  luma: __m_src_core_index_js.luma,
  lumaHistogram: __m_src_core_index_js.lumaHistogram,
  normalizeLocale: __m_src_core_index_js.normalizeLocale,
  normalizeOptions: __m_src_core_index_js.normalizeOptions,
  padFrame: __m_src_core_index_js.padFrame,
  padToAspect: __m_src_core_index_js.padToAspect,
  paletteInfo: __m_src_core_index_js.paletteInfo,
  paletteLabel: __m_src_core_index_js.paletteLabel,
  paramHint: __m_src_core_index_js.paramHint,
  paramLabel: __m_src_core_index_js.paramLabel,
  paramSteps: __m_src_core_index_js.paramSteps,
  parseCustomPalette: __m_src_core_index_js.parseCustomPalette,
  presetLabel: __m_src_core_index_js.presetLabel,
  processImage: __m_src_core_index_js.processImage,
  resampleBox: __m_src_core_index_js.resampleBox,
  resolvePalette: __m_src_core_index_js.resolvePalette,
  rgbToHex: __m_src_core_index_js.rgbToHex,
  sharpen: __m_src_core_index_js.sharpen,
  stepBy: __m_src_core_index_js.stepBy,
  stepIndex: __m_src_core_index_js.stepIndex,
  stringifyPalette: __m_src_core_index_js.stringifyPalette,
  targetSize: __m_src_core_index_js.targetSize,
  textTarget: __m_src_core_index_js.textTarget,
  toText: __m_src_core_index_js.toText,
  upscaleByFactor: __m_src_core_index_js.upscaleByFactor,
  usefulStepCeiling: __m_src_core_index_js.usefulStepCeiling,
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
