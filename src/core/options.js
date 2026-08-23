/**
 * Schema dei parametri, definito una volta sola.
 * Sia il widget web sia la TUI costruiscono i propri controlli iterando
 * questa lista: aggiungere un parametro qui lo fa comparire in entrambi.
 */

import { ALGORITHMS, ALGORITHM_LABELS } from './dither.js';
import { PALETTES, PALETTE_KEYS } from './palettes.js';

/** @typedef {'enum'|'range'|'bool'} ParamType */

export const PARAMS = [
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
    label: 'Intensita',
    group: 'dither',
    type: 'range',
    min: 0,
    max: 200,
    step: 5,
    default: 100,
    unit: '%',
    hint: 'Quanta parte dell errore (o del rumore ordinato) viene applicata',
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
    label: 'Luminosita',
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
    key: 'maxSize',
    label: 'Lato max',
    group: 'output',
    type: 'range',
    min: 64,
    max: 4096,
    step: 64,
    default: 1024,
    unit: 'px',
    hint: 'Le foto da fotocamera vengono prima ridotte a questo lato massimo',
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

export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

export const GROUP_LABELS = {
  dither: 'DITHER',
  tone: 'TONO',
  output: 'OUTPUT',
};

export const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.key, p.default]));

/** Preset pronti: la stessa lista alimenta il menu web e il picker della TUI. */
export const PRESETS = {
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

/**
 * Riempie i valori mancanti coi default e riporta ogni parametro nel
 * suo intervallo. Nessuna eccezione per un valore fuori scala: viene
 * semplicemente tagliato, cosi' la UI non puo' mai mettere il motore in crisi.
 */
export function normalizeOptions(input = {}) {
  const out = { ...DEFAULTS, ...input };
  for (const p of PARAMS) {
    const v = out[p.key];
    if (p.type === 'range') {
      const n = Number(v);
      out[p.key] = Number.isFinite(n) ? clamp(n, p.min, p.max) : p.default;
    } else if (p.type === 'bool') {
      out[p.key] = Boolean(v);
    } else if (p.type === 'enum') {
      // Una palette custom arriva come array di colori: va lasciata passare.
      if (p.key === 'palette' && Array.isArray(v)) continue;
      if (!p.values.includes(v)) out[p.key] = p.default;
    }
  }
  return out;
}

/** Testo del valore di un parametro, usato identico da web e terminale. */
export function formatValue(param, value) {
  if (param.type === 'bool') return value ? 'ON' : 'OFF';
  if (param.type === 'enum') return (param.labels && param.labels[value]) || String(value);
  const n = Number(value);
  const text = param.decimals ? n.toFixed(param.decimals) : String(Math.round(n));
  return param.unit ? `${text}${param.unit}` : text;
}

/** Applica un preset sopra i default, restituendo opzioni complete. */
export function applyPreset(name, base = DEFAULTS) {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Preset sconosciuto: ${name}`);
  return normalizeOptions({ ...base, ...preset.options });
}
