/**
 * Temi della TUI.
 *
 * Stesso schema a sei colori usato da cliamp, cosi' chi ha gia' un tema
 * scritto per quello lo puo' copiare qui dentro e funziona:
 *
 *   bg        sfondo (facoltativo: se manca, resta quello del terminale)
 *   accent    titoli, valori, elemento selezionato
 *   bright_fg testo principale
 *   fg        testo attenuato, bordi, aiuti
 *   green     stato ok, banda bassa del visualizzatore
 *   yellow    avvisi, banda media
 *   red       errori, banda alta
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

const KEYS = ['accent', 'bright_fg', 'fg', 'green', 'yellow', 'red'];

const RAW_THEMES = {
  // I colori di alessandrosimonitto.it: fondo quasi nero, ambra come
  // accento, e il verde e il rosso che il sito usa gia' per gli stati.
  simonitto: {
    bg: '#0d0d0d', accent: '#ffc000', bright_fg: '#ffffff', fg: '#777777',
    green: '#00e87a', yellow: '#e8a000', red: '#f87171',
  },
  winamp: {
    bg: '#232323', accent: '#1de11d', bright_fg: '#d4d4c8', fg: '#78786e',
    green: '#1de11d', yellow: '#ffd21e', red: '#ff4b1f',
  },
  gruvbox: {
    bg: '#282828', accent: '#83a598', bright_fg: '#ebdbb2', fg: '#a89984',
    green: '#b8bb26', yellow: '#fabd2f', red: '#fb4934',
  },
  dracula: {
    bg: '#282a36', accent: '#bd93f9', bright_fg: '#f8f8f2', fg: '#6272a4',
    green: '#50fa7b', yellow: '#f1fa8c', red: '#ff5555',
  },
  nord: {
    bg: '#2e3440', accent: '#88c0d0', bright_fg: '#eceff4', fg: '#7b88a1',
    green: '#a3be8c', yellow: '#ebcb8b', red: '#bf616a',
  },
  catppuccin: {
    bg: '#1e1e2e', accent: '#cba6f7', bright_fg: '#cdd6f4', fg: '#9399b2',
    green: '#a6e3a1', yellow: '#f9e2af', red: '#f38ba8',
  },
  'tokyo-night': {
    bg: '#1a1b26', accent: '#7aa2f7', bright_fg: '#c0caf5', fg: '#565f89',
    green: '#9ece6a', yellow: '#e0af68', red: '#f7768e',
  },
  everforest: {
    bg: '#2d353b', accent: '#a7c080', bright_fg: '#d3c6aa', fg: '#859289',
    green: '#a7c080', yellow: '#dbbc7f', red: '#e67e80',
  },
  ember: {
    bg: '#1c1410', accent: '#ff8c42', bright_fg: '#f5e6d3', fg: '#8a7462',
    green: '#a3b86c', yellow: '#ffc857', red: '#e5484d',
  },
  'matte-black': {
    bg: '#121212', accent: '#cfcfcf', bright_fg: '#e8e8e8', fg: '#6b6b6b',
    green: '#9a9a9a', yellow: '#bdbdbd', red: '#ffffff',
  },
  hackerman: {
    bg: '#000000', accent: '#00ff41', bright_fg: '#00ff41', fg: '#008f11',
    green: '#00ff41', yellow: '#9dff00', red: '#ff0043',
  },
  vantablack: {
    bg: '#000000', accent: '#ffffff', bright_fg: '#e0e0e0', fg: '#4a4a4a',
    green: '#9e9e9e', yellow: '#c4c4c4', red: '#ffffff',
  },
  // Nessuno sfondo: eredita quello del terminale, utile con sfondi trasparenti.
  terminale: {
    accent: '#5fd7a7', bright_fg: '#e4e4e4', fg: '#8a8a8a',
    green: '#5faf5f', yellow: '#d7af5f', red: '#d75f5f',
  },
};

/** Converte una definizione esadecimale in terne pronte per gli escape ANSI. */
function compile(name, raw) {
  const out = { name };
  for (const k of KEYS) out[k] = hex(raw[k]);
  out.bg = raw.bg ? hex(raw.bg) : null;
  return out;
}

/** Un tema e' valido solo se ha tutti e sei i colori in esadecimale. */
function isValid(raw) {
  return KEYS.every((k) => typeof raw[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw[k]))
    && (raw.bg === undefined || /^#[0-9a-fA-F]{6}$/.test(raw.bg));
}

/**
 * Lettore TOML minimo: solo `chiave = "valore"` e commenti con #.
 * E' tutto quello che serve per temi e configurazione, e ci evita
 * di tirarsi dietro un parser completo per dodici righe di file.
 */
export function parseSimpleToml(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const m = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    const rest = m[2].trim();

    // Le stringhe si leggono per prime: un # dentro le virgolette e' un
    // carattere qualsiasi, non l'inizio di un commento (i colori esadecimali
    // cascherebbero tutti in questa trappola).
    const quoted = /^(["'])((?:\\.|(?!\1).)*)\1/.exec(rest);
    if (quoted) {
      out[m[1]] = quoted[2];
      continue;
    }

    const value = rest.split('#')[0].trim();
    if (!value) continue;
    if (value === 'true') out[m[1]] = true;
    else if (value === 'false') out[m[1]] = false;
    else if (/^-?\d+(\.\d+)?$/.test(value)) out[m[1]] = Number(value);
    else out[m[1]] = value;
  }
  return out;
}

export function configDir() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'ditherbox');
}

/**
 * Tutti i temi disponibili: quelli inclusi piu' i .toml dell'utente in
 * ~/.config/ditherbox/themes/. Un file con lo stesso nome ha la precedenza.
 */
export function loadThemes() {
  const themes = {};
  for (const [name, raw] of Object.entries(RAW_THEMES)) themes[name] = compile(name, raw);

  const dir = join(configDir(), 'themes');
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.toml')) continue;
      const name = file.slice(0, -5);
      try {
        const raw = parseSimpleToml(readFileSync(join(dir, file), 'utf8'));
        // Un tema malformato viene ignorato in silenzio: meglio perdere
        // il tema che impedire l'avvio dell'applicazione.
        if (isValid(raw)) themes[name] = compile(name, raw);
      } catch { /* file illeggibile: si passa oltre */ }
    }
  }
  return themes;
}

/** Legge ~/.config/ditherbox/config.toml, se c'e'. */
export function loadConfig() {
  const file = join(configDir(), 'config.toml');
  if (!existsSync(file)) return {};
  try {
    return parseSimpleToml(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export const DEFAULT_THEME = 'simonitto';
export { KEYS as THEME_KEYS };
