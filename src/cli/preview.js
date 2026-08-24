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

/** Blocchi a quadranti, indicizzati da 4 bit: alto-sx, alto-dx, basso-sx, basso-dx. */
const QUADRANTS = [
  ' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛',
  '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█',
];

/**
 * Quanti pixel serve avere per riempire `cols` x `rows` celle in questa
 * modalita', mantenendo le proporzioni dell'originale.
 *
 * La TUI usa questa misura per ditherare *direttamente* alla risoluzione
 * del terminale. Se invece si dithera grande e poi si rimpicciolisce, la
 * media dei pixel richiude i puntini in grigi e la trama sparisce: si
 * vedrebbe una foto sfocata al posto del dithering.
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
export function renderImage(img, mode, theme) {
  switch (mode) {
    case 'braille': return renderBraille(img);
    case 'quadrant': return renderQuadrant(img);
    case 'ascii': return renderAscii(img, theme);
    case 'halfblock':
    default: return renderHalfblock(img);
  }
}

/** Scorciatoia: ricampiona a misura di griglia e poi rende. */
export function renderFitted(img, cols, rows, mode, theme) {
  return renderImage(fitToCells(img, cols, rows, mode), mode, theme);
}

/** Mezzi blocchi: due pixel per cella, entrambi a colore pieno. E' il piu' fedele. */
function renderHalfblock(img) {
  const lines = [];
  for (let y = 0; y < img.height; y += 2) {
    let line = '';
    let lastTop = null;
    let lastBottom = null;
    for (let x = 0; x < img.width; x++) {
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
function renderBraille(img) {
  const soglia = brailleThreshold(img);
  const lines = [];
  for (let y = 0; y < img.height; y += 4) {
    let line = '';
    let lastColor = null;
    for (let x = 0; x < img.width; x += 2) {
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
function renderQuadrant(img) {
  const lines = [];
  for (let y = 0; y < img.height; y += 2) {
    let line = '';
    for (let x = 0; x < img.width; x += 2) {
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
function renderAscii(img, theme) {
  const color = theme ? fg(theme.bright_fg) : '';
  const lines = [];
  for (let y = 0; y < img.height; y++) {
    let line = color;
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      line += asciiChar(luma(img.data[i], img.data[i + 1], img.data[i + 2]));
    }
    lines.push(line + RESET);
  }
  return lines;
}
