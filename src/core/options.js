/**
 * Schema dei parametri, definito una volta sola.
 * Sia il widget web sia la TUI costruiscono i propri controlli iterando
 * questa lista: aggiungere un parametro qui lo fa comparire in entrambi.
 */

import { ALGORITHMS } from './dither.js';
import { PALETTE_KEYS, isCustomPalette } from './palettes.js';
import { createTranslator, hasKey } from './i18n.js';

/** @typedef {'enum'|'range'|'bool'} ParamType */

export const PARAMS = [
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

export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

/**
 * Etichette tradotte.
 *
 * I dati qui sopra non portano piu' testo: le scritte arrivano tutte da
 * i18n.js, cosi' una stringa si traduce una volta sola e nessuna interfaccia
 * puo' restare indietro rispetto alle altre. Ogni funzione vuole il
 * traduttore della lingua scelta; senza, si parla inglese.
 */
const inglese = createTranslator('en');

export function groupLabel(group, t = inglese) {
  return t(`group.${group}`);
}

export function paramLabel(param, t = inglese) {
  return t(`param.${param.key}.label`);
}

/** Il suggerimento e' facoltativo: non tutti i parametri ne hanno uno. */
export function paramHint(param, t = inglese) {
  const key = `param.${param.key}.hint`;
  return hasKey(key) ? t(key) : null;
}

export function paletteLabel(key, t = inglese) {
  return t(`palette.${key}`);
}

export function algorithmLabel(key, t = inglese) {
  return t(`algorithm.${key}`);
}

export function presetLabel(key, t = inglese) {
  return t(`preset.${key}`);
}

/** L'etichetta di un valore di un parametro a elenco. */
export function enumLabel(param, value, t = inglese) {
  if (param.key === 'palette') return paletteLabel(value, t);
  if (param.key === 'algorithm') return algorithmLabel(value, t);
  return String(value);
}

export const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.key, p.default]));

/** Preset pronti: la stessa lista alimenta il menu web e il picker della TUI. */
export const PRESETS = {
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
export function paramSteps(param) {
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
export function stepIndex(param, value) {
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
export function stepBy(param, value, delta) {
  const steps = paramSteps(param);
  const i = clamp(stepIndex(param, value) + delta, 0, steps.length - 1);
  return steps[i];
}

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
export function formatValue(param, value, t = inglese) {
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
export function applyPreset(name, base = DEFAULTS) {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Preset sconosciuto: ${name}`);
  return normalizeOptions({ ...base, ...preset.options });
}
