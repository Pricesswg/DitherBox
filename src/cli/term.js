/**
 * Primitive di terminale: colori a 24 bit, schermo alternativo, modalita'
 * raw, lettura tasti e disegno a frame. Nessuna dipendenza esterna.
 */

export const ESC = '\x1b';
export const CSI = `${ESC}[`;

export const cursor = {
  hide: `${CSI}?25l`,
  show: `${CSI}?25h`,
  home: `${CSI}H`,
  to: (row, col) => `${CSI}${row};${col}H`,
};

export const screen = {
  altOn: `${CSI}?1049h`,
  altOff: `${CSI}?1049l`,
  clear: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  clearToEnd: `${CSI}0J`,
  clearLineToEnd: `${CSI}0K`,
};

export const RESET = `${CSI}0m`;
export const BOLD = `${CSI}1m`;
export const DIM = `${CSI}2m`;
export const REVERSE = `${CSI}7m`;

/** Colore di primo piano a 24 bit da terna [r,g,b]. */
export const fg = ([r, g, b]) => `${CSI}38;2;${r | 0};${g | 0};${b | 0}m`;
/** Colore di sfondo a 24 bit. */
export const bg = ([r, g, b]) => `${CSI}48;2;${r | 0};${g | 0};${b | 0}m`;

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** Lunghezza visibile di una stringa, ignorando le sequenze di controllo. */
export function visibleLength(s) {
  return [...s.replace(ANSI_RE, '')].length;
}

/** Taglia a `width` colonne visibili, preservando le sequenze di colore. */
export function truncate(s, width) {
  if (visibleLength(s) <= width) return s;
  let out = '';
  let seen = 0;
  let i = 0;
  while (i < s.length && seen < width) {
    if (s[i] === '\x1b') {
      const m = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(s.slice(i));
      if (m) {
        out += m[0];
        i += m[0].length;
        continue;
      }
    }
    out += s[i];
    seen++;
    i++;
  }
  return out;
}

/** Riempie a destra fino a `width` colonne visibili. */
export function pad(s, width) {
  const len = visibleLength(s);
  return len >= width ? truncate(s, width) : s + ' '.repeat(width - len);
}

/** Riempie a sinistra. */
export function padStart(s, width) {
  const len = visibleLength(s);
  return len >= width ? truncate(s, width) : ' '.repeat(width - len) + s;
}

/** Centra su `width` colonne. */
export function center(s, width) {
  const len = visibleLength(s);
  if (len >= width) return truncate(s, width);
  const left = Math.floor((width - len) / 2);
  return ' '.repeat(left) + s + ' '.repeat(width - len - left);
}

export const BOX = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  tlR: '╭', trR: '╮', blR: '╰', brR: '╯',
};

/**
 * Disegna la cornice di un pannello e restituisce le righe.
 * Il titolo va incastonato nel bordo alto, come fa cliamp.
 *
 * @param {string[]} lines contenuto gia' formattato alla larghezza interna
 */
export function panel({ title = '', lines, width, height, color, titleColor, rounded = true }) {
  const inner = width - 2;
  const c = color || '';
  const tc = titleColor || color || '';
  const B = rounded
    ? { tl: BOX.tlR, tr: BOX.trR, bl: BOX.blR, br: BOX.brR }
    : { tl: BOX.tl, tr: BOX.tr, bl: BOX.bl, br: BOX.br };

  // Il titolo va accorciato prima di finire nel bordo: un nome di file
  // lungo, altrimenti, spinge l'angolo destro fuori dal pannello.
  const room = Math.max(0, inner - 4);
  const label = title ? ` ${truncate(title, room)} ` : '';
  const labelLen = Math.min(visibleLength(label), inner - 1);
  const dashes = Math.max(0, inner - labelLen - 1);
  const top = `${c}${B.tl}${BOX.h}${RESET}${tc}${label}${RESET}${c}${BOX.h.repeat(dashes)}${B.tr}${RESET}`;

  const body = [];
  const bodyHeight = height - 2;
  for (let i = 0; i < bodyHeight; i++) {
    const content = lines[i] === undefined ? '' : lines[i];
    body.push(`${c}${BOX.v}${RESET}${pad(content, inner)}${c}${BOX.v}${RESET}`);
  }

  const bottom = `${c}${B.bl}${BOX.h.repeat(inner)}${B.br}${RESET}`;
  return [top, ...body, bottom];
}

/**
 * Affianca due blocchi di righe. I blocchi devono avere gia' la loro
 * larghezza; le altezze vengono pareggiate col piu' alto.
 */
export function joinHorizontal(blocks, widths, gap = 0) {
  const height = Math.max(...blocks.map((b) => b.length));
  const out = [];
  for (let i = 0; i < height; i++) {
    let line = '';
    for (let b = 0; b < blocks.length; b++) {
      if (b > 0) line += ' '.repeat(gap);
      line += pad(blocks[b][i] || '', widths[b]);
    }
    out.push(line);
  }
  return out;
}

/**
 * Barra a gradini in stile equalizzatore.
 * @param {number} ratio 0..1
 */
export function bar(ratio, width, filledChar = '█', emptyChar = '░') {
  // Un rapporto non finito (una divisione per zero a monte) deve dare una
  // barra vuota, non una stringa vuota che manderebbe fuori misura la riga.
  const safe = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  const filled = Math.round(safe * width);
  return filledChar.repeat(filled) + emptyChar.repeat(Math.max(0, width - filled));
}

/** Livelli verticali a ottavi, per il visualizzatore. */
export const BLOCKS_V = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

// ------------------------------------------------------------- input

/**
 * Traduce i byte dello stdin in nomi di tasto.
 * Restituisce { name, ctrl, shift, raw }.
 */
export function parseKey(data) {
  const s = data.toString('utf8');

  const simple = {
    '\r': 'enter', '\n': 'enter', '\t': 'tab', '\x7f': 'backspace',
    '\x08': 'backspace', ' ': 'space', '\x1b': 'escape',
  };
  if (simple[s]) return { name: simple[s], ctrl: false, shift: false, raw: s };

  // Ctrl+lettera occupa i codici 1..26.
  if (s.length === 1) {
    const code = s.charCodeAt(0);
    if (code < 27 && code > 0) {
      return { name: String.fromCharCode(code + 96), ctrl: true, shift: false, raw: s };
    }
    return { name: s, ctrl: false, shift: s !== s.toLowerCase(), raw: s };
  }

  const seq = {
    '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\x1b[D': 'left',
    '\x1bOA': 'up', '\x1bOB': 'down', '\x1bOC': 'right', '\x1bOD': 'left',
    '\x1b[H': 'home', '\x1b[F': 'end', '\x1b[1~': 'home', '\x1b[4~': 'end',
    '\x1b[5~': 'pageup', '\x1b[6~': 'pagedown', '\x1b[3~': 'delete',
    '\x1b[Z': 'shifttab',
  };
  if (seq[s]) return { name: seq[s], ctrl: false, shift: s === '\x1b[Z', raw: s };

  // Frecce con modificatori: ESC [ 1 ; <mod> <lettera>
  const mod = /^\x1b\[1;(\d)([ABCD])$/.exec(s);
  if (mod) {
    const names = { A: 'up', B: 'down', C: 'right', D: 'left' };
    const m = Number(mod[1]) - 1;
    return { name: names[mod[2]], shift: !!(m & 1), ctrl: !!(m & 4), raw: s };
  }

  return { name: s, ctrl: false, shift: false, raw: s };
}

/**
 * Gestore dello schermo: tiene l'ultimo frame e riscrive solo le righe
 * cambiate, cosi' non si vede sfarfallio anche su ssh lento.
 */
export class Screen {
  constructor(out = process.stdout) {
    this.out = out;
    this.previous = [];
    this.active = false;
  }

  get width() { return this.out.columns || 80; }
  get height() { return this.out.rows || 24; }

  enter() {
    if (this.active) return;
    this.active = true;
    this.out.write(screen.altOn + cursor.hide + screen.clear + cursor.home);
    this.previous = [];
  }

  leave() {
    if (!this.active) return;
    this.active = false;
    this.out.write(RESET + screen.altOff + cursor.show);
  }

  /** Forza il ridisegno completo al prossimo frame (dopo un resize). */
  invalidate() {
    this.previous = [];
    if (this.active) this.out.write(screen.clear);
  }

  /** @param {string[]} lines il frame completo, una stringa per riga. */
  draw(lines) {
    const h = this.height;
    let buf = '';
    for (let i = 0; i < h; i++) {
      const line = i < lines.length ? truncate(lines[i], this.width) : '';
      if (this.previous[i] === line) continue;
      buf += cursor.to(i + 1, 1) + line + RESET + screen.clearLineToEnd;
      this.previous[i] = line;
    }
    if (this.previous.length > h) this.previous.length = h;
    if (buf) this.out.write(buf);
  }
}
