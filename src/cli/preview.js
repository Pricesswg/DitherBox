/**
 * Disegno dell'immagine dentro il terminale.
 *
 * Quattro modalita', dalla piu' dettagliata alla piu' nostalgica. La cosa
 * importante e' che una cella di terminale non e' quadrata: e' larga uno e
 * alta due. Ogni modalita' dichiara quanti pixel ci mette dentro, e da li'
 * si ricava il fattore di correzione delle proporzioni.
 */

import { resampleBox, luma } from '../core/adjust.js';
import { asciiChar, brailleThreshold, brailleCell } from '../core/textart.js';
import { fg, bg, RESET } from './term.js';

/**
 * cx, cy = pixel per cella in orizzontale e verticale.
 * ratio  = quanto va allungata l'immagine in larghezza perche' il risultato
 *          a schermo abbia le proporzioni giuste (cella alta il doppio).
 */
export const MODES = {
  braille: { cx: 2, cy: 4, ratio: 1 },
  halfblock: { cx: 1, cy: 2, ratio: 1 },
  quadrant: { cx: 2, cy: 2, ratio: 2 },
  ascii: { cx: 1, cy: 1, ratio: 2 },
};

/** Il nome leggibile di un modo, nella lingua scelta. */
export function modeLabel(mode, t) {
  return t ? t(`mode.${mode}`) : mode;
}

export const MODE_KEYS = Object.keys(MODES);

/**
 * I colori della cornice di inquadratura.
 *
 * Saturi, e presi da qui invece che dal tema: un colore del tema si
 * confonderebbe proprio con le immagini che quel tema serve meglio, ed e'
 * il caso in cui una guida serve di piu'. Rosso di default perche' e'
 * quello che nessuna tavolozza di queste ha in versione accesa.
 */
export const GUIDES = {
  red: [255, 45, 45],
  cyan: [0, 229, 255],
  yellow: [255, 226, 0],
  magenta: [255, 45, 240],
  green: [64, 255, 100],
};

export const GUIDE_KEYS = ['off', ...Object.keys(GUIDES)];

/** Il nome leggibile di un colore di guida, nella lingua scelta. */
export function guideLabel(key, t) {
  return t ? t(`guide.${key}`) : key;
}

/**
 * La cornice da sovrapporre alla griglia, come funzione (colonna, riga).
 *
 * Si disegna a celle intere e non a pixel: in braille e in ASCII il colore
 * di un pixel non arriva a schermo, e una cornice che si vede in due modi
 * su quattro non e' una cornice. Cosi' invece e' una riga di caratteri di
 * cornice, nitida e del colore giusto in tutti e quattro.
 */
export function makeGuide(rect, mode, colour) {
  const m = MODES[mode] || MODES.halfblock;
  const x0 = Math.floor(rect.x / m.cx);
  const y0 = Math.floor(rect.y / m.cy);
  const x1 = Math.max(x0, Math.ceil((rect.x + rect.width) / m.cx) - 1);
  const y1 = Math.max(y0, Math.ceil((rect.y + rect.height) / m.cy) - 1);
  const tinta = fg(colour);

  return (cx, cy) => {
    if (cx < x0 || cx > x1 || cy < y0 || cy > y1) return null;
    const bordoX = cx === x0 || cx === x1;
    const bordoY = cy === y0 || cy === y1;
    if (!bordoX && !bordoY) return null;
    if (bordoX && bordoY) {
      const ch = cy === y0 ? (cx === x0 ? '\u250c' : '\u2510') : (cx === x0 ? '\u2514' : '\u2518');
      return tinta + ch;
    }
    return tinta + (bordoY ? '\u2500' : '\u2502');
  };
}

/**
 * Spegne quello che sta fuori dal rettangolo, in place.
 *
 * Serve solo al ritaglio, dove fuori c'e' quello che si sta buttando via.
 * Con le bande no: quelle sono nel file davvero, e spegnerle direbbe una
 * bugia su cosa si sta salvando.
 */
export function dimOutside(img, rect, factor = 0.4) {
  for (let y = 0; y < img.height; y++) {
    const dentroY = y >= rect.y && y < rect.y + rect.height;
    for (let x = 0; x < img.width; x++) {
      if (dentroY && x >= rect.x && x < rect.x + rect.width) continue;
      const i = (y * img.width + x) * 4;
      img.data[i] *= factor;
      img.data[i + 1] *= factor;
      img.data[i + 2] *= factor;
    }
  }
  return img;
}

/** Blocchi a quadranti, indicizzati da 4 bit: alto-sx, alto-dx, basso-sx, basso-dx. */
const QUADRANTS = [
  ' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛',
  '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█',
];

/**
 * Quanti pixel serve avere per riempire `cols` x `rows` celle in questa
 * modalita', mantenendo le proporzioni dell'originale.
 *
 * La TUI ci porta l'immagine gia' ditherata alla risoluzione d'uscita, non
 * la dithera a questa misura. Ditherare qui darebbe una trama grossa una
 * cella dove nel file e' grossa un pixel, e l'anteprima prometterebbe un
 * effetto che il file non ha.
 */
export function cellTarget(srcWidth, srcHeight, cols, rows, mode) {
  const m = MODES[mode] || MODES.halfblock;
  const maxW = Math.max(m.cx, cols * m.cx);
  const maxH = Math.max(m.cy, rows * m.cy);
  const targetAspect = (srcWidth / srcHeight) * m.ratio;

  let w = Math.min(maxW, Math.round(maxH * targetAspect));
  let h = Math.round(w / targetAspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h * targetAspect);
  }
  return { width: Math.max(1, w), height: Math.max(1, h) };
}

/** Come sopra, ma ricampiona davvero. Utile per l'anteprima dell'originale. */
export function fitToCells(img, cols, rows, mode) {
  const { width, height } = cellTarget(img.width, img.height, cols, rows, mode);
  return resampleBox(img, width, height);
}

const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

const safe = (img, x, y) => px(img, Math.min(x, img.width - 1), Math.min(y, img.height - 1));

/**
 * Rende l'immagine come righe pronte da stampare, un pixel per sotto-cella,
 * senza ricampionare: l'immagine deve gia' avere la misura data da cellTarget.
 *
 * @param {object} img immagine gia' ditherata e gia' della misura giusta
 * @param {string} mode una chiave di MODES
 * @param {object} [theme] serve solo alla modalita' ascii, per il colore
 * @returns {string[]}
 */
export function renderImage(img, mode, theme, guida = null) {
  switch (mode) {
    case 'braille': return renderBraille(img, guida);
    case 'quadrant': return renderQuadrant(img, guida);
    case 'ascii': return renderAscii(img, theme, guida);
    case 'halfblock':
    default: return renderHalfblock(img, guida);
  }
}

/** Scorciatoia: ricampiona a misura di griglia e poi rende. */
export function renderFitted(img, cols, rows, mode, theme) {
  return renderImage(fitToCells(img, cols, rows, mode), mode, theme);
}

/** Mezzi blocchi: due pixel per cella, entrambi a colore pieno. E' il piu' fedele. */
function renderHalfblock(img, guida = null) {
  const lines = [];
  for (let y = 0; y < img.height; y += 2) {
    let line = '';
    let lastTop = null;
    let lastBottom = null;
    for (let x = 0; x < img.width; x++) {
      const cornice = guida && guida(x, y >> 1);
      if (cornice) {
        // La cornice cambia il colore di primo piano: il pixel dopo deve
        // riscriverlo, o eredita il rosso.
        line += cornice;
        lastTop = null;
        continue;
      }
      const top = safe(img, x, y);
      const bottom = y + 1 < img.height ? px(img, x, y + 1) : top;
      // Le sequenze di colore si riscrivono solo quando cambiano davvero:
      // su un'immagine ditherata sono lunghi tratti dello stesso colore.
      if (!lastTop || top[0] !== lastTop[0] || top[1] !== lastTop[1] || top[2] !== lastTop[2]) {
        line += fg(top);
        lastTop = top;
      }
      if (!lastBottom || bottom[0] !== lastBottom[0] || bottom[1] !== lastBottom[1]
        || bottom[2] !== lastBottom[2]) {
        line += bg(bottom);
        lastBottom = bottom;
      }
      line += '▀';
    }
    lines.push(line + RESET);
  }
  return lines;
}

/**
 * Braille: otto punti per cella, 2x4 pixel. E' la risoluzione piu' alta
 * che un terminale possa dare, ed e' perfetta per il bianco e nero.
 */
function renderBraille(img, guida = null) {
  const soglia = brailleThreshold(img);
  const lines = [];
  for (let y = 0; y < img.height; y += 4) {
    let line = '';
    let lastColor = null;
    for (let x = 0; x < img.width; x += 2) {
      const cornice = guida && guida(x >> 1, y >> 2);
      if (cornice) {
        line += cornice;
        lastColor = null;
        continue;
      }
      const { char, colour } = brailleCell(img, x, y, soglia);
      if (colour && (!lastColor || Math.abs(colour[0] - lastColor[0]) > 2
        || Math.abs(colour[1] - lastColor[1]) > 2 || Math.abs(colour[2] - lastColor[2]) > 2)) {
        line += fg(colour);
        lastColor = colour;
      }
      line += char;
    }
    lines.push(line + RESET);
  }
  return lines;
}

/**
 * Quadranti: 2x2 pixel per cella con due colori. Per ogni cella si scelgono
 * il colore piu' scuro e il piu' chiaro e si assegna ogni pixel al piu' vicino.
 */
function renderQuadrant(img, guida = null) {
  const lines = [];
  for (let y = 0; y < img.height; y += 2) {
    let line = '';
    for (let x = 0; x < img.width; x += 2) {
      const cornice = guida && guida(x >> 1, y >> 1);
      if (cornice) {
        line += cornice;
        continue;
      }
      const cells = [
        safe(img, x, y),
        safe(img, x + 1, y),
        safe(img, x, y + 1),
        safe(img, x + 1, y + 1),
      ];
      const lums = cells.map((c) => luma(c[0], c[1], c[2]));
      const darkIdx = lums.indexOf(Math.min(...lums));
      const lightIdx = lums.indexOf(Math.max(...lums));
      const dark = cells[darkIdx];
      const light = cells[lightIdx];
      const mid = (lums[darkIdx] + lums[lightIdx]) / 2;

      let bits = 0;
      for (let i = 0; i < 4; i++) if (lums[i] > mid) bits |= 1 << i;
      line += `${fg(light)}${bg(dark)}${QUADRANTS[bits]}`;
    }
    lines.push(line + RESET);
  }
  return lines;
}

/** ASCII: un carattere per pixel, scelto sulla rampa di densita'. */
function renderAscii(img, theme, guida = null) {
  const color = theme ? fg(theme.bright_fg) : '';
  const lines = [];
  for (let y = 0; y < img.height; y++) {
    let line = color;
    for (let x = 0; x < img.width; x++) {
      const cornice = guida && guida(x, y);
      if (cornice) {
        // Qui il colore si riscrive subito: la riga ne dichiara uno solo
        // all'inizio, e la cornice l'ha appena sostituito.
        line += cornice + color;
        continue;
      }
      const i = (y * img.width + x) * 4;
      line += asciiChar(luma(img.data[i], img.data[i + 1], img.data[i + 2]));
    }
    lines.push(line + RESET);
  }
  return lines;
}
