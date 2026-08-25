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
export function grayRamp(levels) {
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
export function bitDepthPalette(rb, gb, bb) {
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

export const PALETTES = {
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

export const PALETTE_KEYS = Object.keys(PALETTES);

const HEX_RE = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Vero se la stringa e' un elenco di colori esadecimali separati da virgola,
 * cioe' una palette scritta a mano: "#0a0c10,#c2fe0b".
 *
 * E' il formato che usiamo ovunque per le palette personalizzate: sta in un
 * attributo data-*, in una riga di config.toml e in un argomento della riga
 * di comando senza bisogno di trattamenti diversi.
 */
export function isCustomPalette(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 && parts.every((p) => HEX_RE.test(p));
}

/** Trasforma un elenco di colori in stringa: l'inverso di isCustomPalette. */
export function stringifyPalette(colors) {
  return colors.map((c) => (typeof c === 'string' ? c : rgbToHex(c))).join(',');
}

/** Legge una stringa "#aabbcc,#ddeeff" in un elenco di terne. */
export function parseCustomPalette(value) {
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
export function resolvePalette(palette) {
  if (Array.isArray(palette)) {
    return palette.map((c) => (typeof c === 'string' ? hex(c) : c.slice(0, 3)));
  }
  if (isCustomPalette(palette)) return parseCustomPalette(palette);
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
export function paletteInfo(palette) {
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
