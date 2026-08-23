/**
 * Tavolozze colori.
 * Ogni palette e' un array di terne [r, g, b] (0-255).
 * L'ordine conta solo per la leggibilita': il quantizzatore cerca sempre
 * il colore piu' vicino in distanza euclidea pesata sulla percezione.
 */

const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

/** Costruisce una scala di grigi con `levels` livelli equispaziati. */
export function grayRamp(levels) {
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

export const PALETTES = {
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
};

export const PALETTE_KEYS = Object.keys(PALETTES);

/**
 * Risolve l'opzione `palette` in un array di colori.
 * Accetta la chiave di una palette predefinita oppure un array custom
 * di stringhe esadecimali / terne gia' pronte.
 */
export function resolvePalette(palette, inkPaper) {
  if (Array.isArray(palette)) {
    return palette.map((c) => (typeof c === 'string' ? hex(c) : c.slice(0, 3)));
  }
  if (palette === 'custom' && inkPaper) {
    return [inkPaper.ink, inkPaper.paper].map((c) =>
      typeof c === 'string' ? hex(c) : c.slice(0, 3),
    );
  }
  const entry = PALETTES[palette];
  if (!entry) throw new Error(`Palette sconosciuta: ${palette}`);
  return entry.colors;
}

export { hex as hexToRgb };

/** Converte una terna in stringa esadecimale, per la UI. */
export function rgbToHex([r, g, b]) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Come `resolvePalette`, ma restituisce anche se la palette e' una rampa
 * di luminanza (nel qual caso conviene quantizzare sul canale luma).
 */
export function paletteInfo(palette, inkPaper) {
  const colors = resolvePalette(palette, inkPaper);
  let ramp;
  if (typeof palette === 'string' && PALETTES[palette]) ramp = !!PALETTES[palette].ramp;
  else ramp = colors.length <= 2; // custom a due tinte: trattala come rampa
  return { colors, ramp };
}
