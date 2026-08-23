/**
 * Punto di ingresso della riga di comando.
 *
 * Senza opzioni di uscita parte l'interfaccia a schermo intero; con -o
 * lavora in silenzio ed e' usabile in uno script.
 */

import { resolve, basename, extname, join, dirname } from 'node:path';
import { statSync, mkdirSync } from 'node:fs';

import {
  PARAMS, PRESETS, PALETTES, ALGORITHM_LABELS, ALGORITHMS,
  DEFAULTS, normalizeOptions, applyPreset, processImage, resampleBox,
} from '../core/index.js';
import { loadImage, saveImage, listImages, isSupported } from './imageio.js';
import { cellTarget, renderImage, MODES, MODE_KEYS } from './preview.js';
import { loadThemes, loadConfig, DEFAULT_THEME } from './theme.js';
import { DitherTui } from './tui.js';

const VERSION = '0.1.0';

/** camelCase -> kebab-case, per i nomi delle opzioni. */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * Analizza gli argomenti. Ogni parametro del motore diventa
 * automaticamente un'opzione, cosi' i due non possono divergere.
 */
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  const paramNames = new Set(PARAMS.map((p) => kebab(p.key)));
  const boolParams = new Set(PARAMS.filter((p) => p.type === 'bool').map((p) => kebab(p.key)));
  const knownBooleans = new Set([...boolParams, 'help', 'version', 'print', 'list', 'quiet']);

  const aliases = {
    o: 'out', d: 'out-dir', p: 'preset', m: 'mode', t: 'theme',
    h: 'help', v: 'version', q: 'quiet',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      positional.push(arg);
      continue;
    }

    let name;
    let inlineValue;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      if (eq >= 0) inlineValue = arg.slice(eq + 1);
    } else {
      name = aliases[arg.slice(1)] || arg.slice(1);
    }

    // --no-serpentine e simili spengono un interruttore.
    if (name.startsWith('no-') && knownBooleans.has(name.slice(3))) {
      flags[name.slice(3)] = false;
      continue;
    }
    if (knownBooleans.has(name)) {
      flags[name] = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }
    const value = inlineValue !== undefined ? inlineValue : argv[++i];
    if (value === undefined) throw new Error(`Manca il valore per --${name}`);
    flags[name] = value;
  }

  return { flags, positional, paramNames };
}

/** Estrae dalle opzioni della riga di comando quelle che sono parametri del motore. */
function optionsFromFlags(flags) {
  const out = {};
  for (const param of PARAMS) {
    const key = kebab(param.key);
    if (flags[key] === undefined) continue;
    const raw = flags[key];
    if (param.type === 'range') {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`--${key} vuole un numero, non "${raw}"`);
      out[param.key] = n;
    } else if (param.type === 'bool') {
      out[param.key] = raw === true || raw === 'true' || raw === '1';
    } else {
      if (!param.values.includes(raw)) {
        throw new Error(`--${key}: "${raw}" non esiste. Valori: ${param.values.join(', ')}`);
      }
      out[param.key] = raw;
    }
  }
  return out;
}

export function helpText() {
  const paramLines = PARAMS.map((p) => {
    const name = `--${kebab(p.key)}`;
    const spec = p.type === 'range'
      ? `<${p.min}..${p.max}>`
      : p.type === 'bool' ? '' : '<nome>';
    return `  ${`${name} ${spec}`.padEnd(26)}${p.label}${p.type === 'bool' ? ` (--no-${kebab(p.key)} per spegnerlo)` : ''}`;
  }).join('\n');

  return `ditherbox ${VERSION} — dithering regolabile per le tue foto

USO
  ditherbox [immagine|cartella]              apre l'interfaccia a schermo intero
  ditherbox foto.jpg -o esito.png [opzioni]  elabora e salva, senza interfaccia
  ditherbox *.jpg --out-dir ./esiti          elabora in blocco
  ditherbox foto.jpg --print                 stampa il risultato nel terminale

OPZIONI GENERALI
  -o, --out <file>        file di destinazione (.png o .jpg)
  -d, --out-dir <cart.>   cartella di destinazione per l'elaborazione in blocco
  -p, --preset <nome>     applica un preset prima delle altre opzioni
  -m, --mode <nome>       modo di anteprima: ${MODE_KEYS.join(', ')}
  -t, --theme <nome>      tema dell'interfaccia
      --print             stampa nel terminale invece di aprire l'interfaccia
      --list              elenca palette, algoritmi, preset e temi
  -q, --quiet             nessun messaggio sullo standard output
  -h, --help              questa schermata
  -v, --version           versione

PARAMETRI DI ELABORAZIONE
${paramLines}

CONFIGURAZIONE
  ~/.config/ditherbox/config.toml     valori di partenza e tema
  ~/.config/ditherbox/themes/*.toml   temi personali (stesso schema di cliamp)

ESEMPI
  ditherbox ~/Foto                                  sfoglia una cartella
  ditherbox ritratto.jpg -p macintosh -o out.png    il classico Mac del 1984
  ditherbox foto.jpg --palette gameboy --scale 4 -o gb.png
  ditherbox foto.jpg --algorithm bayer8 --contrast 40 --print
`;
}

function listText() {
  const section = (title, rows) => `${title}\n${rows.map((r) => `  ${r}`).join('\n')}\n`;
  return [
    section('PALETTE', Object.entries(PALETTES).map(
      ([k, v]) => `${k.padEnd(16)}${v.label} (${v.colors.length} colori)`,
    )),
    section('ALGORITMI', ALGORITHMS.map((a) => `${a.padEnd(22)}${ALGORITHM_LABELS[a]}`)),
    section('PRESET', Object.entries(PRESETS).map(([k, v]) => `${k.padEnd(16)}${v.label}`)),
    section('TEMI', Object.keys(loadThemes())),
    section('ANTEPRIME', MODE_KEYS.map((k) => `${k.padEnd(16)}${MODES[k].label}`)),
  ].join('\n');
}

/** Espande una cartella nella lista delle immagini che contiene. */
async function expandInputs(paths) {
  const out = [];
  for (const p of paths) {
    const full = resolve(p);
    let st;
    try {
      st = statSync(full);
    } catch {
      throw new Error(`Non trovo ${p}`);
    }
    if (st.isDirectory()) out.push(...(await listImages(full)));
    else if (isSupported(full)) out.push(full);
    else throw new Error(`${basename(p)}: accetto solo PNG e JPEG`);
  }
  return out;
}

/** Nome del file di uscita quando non e' stato indicato esplicitamente. */
function defaultOutName(inputPath, options, outDir) {
  const base = basename(inputPath, extname(inputPath));
  const name = `${base}-${options.palette}-${options.algorithm}.png`;
  return join(outDir || dirname(inputPath), name);
}

/** Stampa il risultato direttamente nel terminale. */
async function printToTerminal(path, options, mode, themeName) {
  const themes = loadThemes();
  const theme = themes[themeName] || themes[DEFAULT_THEME];
  const cols = Math.max(20, (process.stdout.columns || 80) - 2);
  const rows = Math.max(10, (process.stdout.rows || 24) - 4);

  const img = await loadImage(path);
  const target = cellTarget(img.width, img.height, cols, rows, mode);
  const small = resampleBox(img, target.width, target.height);
  const { image } = processImage(small, { ...options, maxSize: 4096, upscale: false });
  process.stdout.write(`${renderImage(image, mode, theme).join('\n')}\n`);
}

export async function run(argv = process.argv.slice(2)) {
  const { flags, positional } = parseArgs(argv);

  if (flags.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (flags.list) {
    process.stdout.write(listText());
    return 0;
  }

  const config = loadConfig();
  let base = { ...DEFAULTS };
  for (const param of PARAMS) {
    if (config[param.key] !== undefined) base[param.key] = config[param.key];
  }
  if (flags.preset) {
    if (!PRESETS[flags.preset]) {
      throw new Error(`Preset "${flags.preset}" inesistente. Disponibili: ${Object.keys(PRESETS).join(', ')}`);
    }
    base = applyPreset(flags.preset, base);
  }
  const options = normalizeOptions({ ...base, ...optionsFromFlags(flags) });

  const mode = flags.mode || config.mode || 'braille';
  if (!MODES[mode]) throw new Error(`Modo "${mode}" inesistente. Disponibili: ${MODE_KEYS.join(', ')}`);
  const theme = flags.theme || config.theme || DEFAULT_THEME;

  const inputs = positional.length ? await expandInputs(positional) : [];
  const log = (msg) => { if (!flags.quiet) process.stdout.write(`${msg}\n`); };

  // --- stampa nel terminale ---------------------------------------
  if (flags.print) {
    if (!inputs.length) throw new Error('Serve almeno un file da stampare');
    for (const path of inputs) {
      if (inputs.length > 1) log(`\n${basename(path)}`);
      await printToTerminal(path, options, mode, theme);
    }
    return 0;
  }

  // --- elaborazione senza interfaccia ------------------------------
  if (flags.out || flags['out-dir']) {
    if (!inputs.length) throw new Error('Serve almeno un file da elaborare');
    if (flags.out && inputs.length > 1) {
      throw new Error('Con più file usa --out-dir al posto di --out');
    }
    if (flags['out-dir']) mkdirSync(resolve(flags['out-dir']), { recursive: true });

    for (const path of inputs) {
      const img = await loadImage(path);
      const { image } = processImage(img, options);
      const dest = flags.out
        ? resolve(flags.out)
        : defaultOutName(path, options, resolve(flags['out-dir']));
      await saveImage(dest, image);
      log(`${basename(path)} → ${dest}  (${image.width}×${image.height})`);
    }
    return 0;
  }

  // --- interfaccia a schermo intero --------------------------------
  if (!process.stdout.isTTY) {
    throw new Error("Non sono su un terminale interattivo: usa -o per salvare o --print per stampare");
  }

  const tui = new DitherTui({
    options,
    mode,
    theme,
    dir: inputs.length ? dirname(inputs[0]) : process.cwd(),
  });
  await tui.start(inputs[0]);
  return 0;
}
