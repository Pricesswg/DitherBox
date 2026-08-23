/**
 * Matrici di soglia (dithering ordinato) e kernel di diffusione dell'errore.
 */

/**
 * Genera ricorsivamente una matrice di Bayer di lato `size` (potenza di 2).
 * I valori sono normalizzati in [0, 1).
 */
export function bayerMatrix(size) {
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
export function bayer(size) {
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

export const ORDERED_MATRICES = {
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
export const DIFFUSION_KERNELS = {
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
