/**
 * Punto di ingresso della riga di comando.
 *
 * Senza opzioni di uscita parte l'interfaccia a schermo intero; con -o
 * lavora in silenzio ed e' usabile in uno script.
 */

import { resolve, basename, extname, join, dirname } from 'node:path';
import { statSync, mkdirSync } from 'node:fs';

import {
  PARAMS, PRESETS, PALETTES, ALGORITHMS,
  DEFAULTS, normalizeOptions, applyPreset, processImage, resampleBox,
  isCustomPalette,
  paramLabel, paletteLabel, algorithmLabel, presetLabel,
  createTranslator, detectLocale, LOCALES,
} from '../core/index.js';
import { loadImage, saveImage, listImages, isSupported } from './imageio.js';
import { cellTarget, renderImage, modeLabel, MODES, MODE_KEYS } from './preview.js';
import { loadThemes, loadConfig, DEFAULT_THEME } from './theme.js';
import { DitherTui } from './tui.js';
import { VERSION } from './version.js';



/**
 * Traduttore predefinito per le funzioni che non ne ricevono uno.
 * `parseArgs` puo' essere chiamata prima ancora di sapere che lingua
 * vuole chi la usa, quindi deve avere sempre qualcosa sottomano.
 */
const inglese = createTranslator('en');

/** camelCase -> kebab-case, per i nomi delle opzioni. */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** "it_IT.UTF-8" -> "it": la radice di un codice di lingua. */
const shortLocale = (s) => String(s).toLowerCase().split(/[-_.]/)[0];

/**
 * Analizza gli argomenti. Ogni parametro del motore diventa
 * automaticamente un'opzione, cosi' i due non possono divergere.
 */
export function parseArgs(argv, t = inglese) {
  const flags = {};
  const positional = [];
  const paramNames = new Set(PARAMS.map((p) => kebab(p.key)));
  const boolParams = new Set(PARAMS.filter((p) => p.type === 'bool').map((p) => kebab(p.key)));
  const knownBooleans = new Set([...boolParams, 'help', 'version', 'print', 'list', 'quiet']);

  const aliases = {
    o: 'out', d: 'out-dir', p: 'preset', m: 'mode', t: 'theme',
    l: 'lang', h: 'help', v: 'version', q: 'quiet',
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
    if (value === undefined) throw new Error(t('cli.missingValue', { name }));
    flags[name] = value;
  }

  return { flags, positional, paramNames };
}

/** Estrae dalle opzioni della riga di comando quelle che sono parametri del motore. */
function optionsFromFlags(flags, t = inglese) {
  const out = {};
  for (const param of PARAMS) {
    const key = kebab(param.key);
    if (flags[key] === undefined) continue;
    const raw = flags[key];
    if (param.type === 'range' || param.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(t('cli.wantsNumber', { name: key, value: raw }));
      out[param.key] = n;
    } else if (param.type === 'bool') {
      out[param.key] = raw === true || raw === 'true' || raw === '1';
    } else {
      // Una palette scritta a mano ("#0a0c10,#c2fe0b") non e' un nome
      // dell'elenco ma e' perfettamente valida.
      if (param.key === 'palette' && isCustomPalette(raw)) {
        out[param.key] = raw;
        continue;
      }
      if (!param.values.includes(raw)) {
        throw new Error(t('cli.noSuchValue', {
          name: key, value: raw, list: param.values.join(', '),
        }));
      }
      out[param.key] = raw;
    }
  }
  return out;
}

/**
 * La schermata di aiuto.
 *
 * Il testo di riferimento resta in inglese: descrive opzioni che si
 * scrivono in inglese, e mescolare le due lingue in una tabella di
 * comandi non aiuta nessuno. Quello che invece segue la lingua scelta
 * sono le etichette dei parametri, perche' sono le stesse che si leggono
 * nell'interfaccia.
 */
export function helpText(t = inglese) {
  const paramLines = PARAMS.map((p) => {
    const name = `--${kebab(p.key)}`;
    // Un numero non e' un nome: scrivere <name> accanto a --width manderebbe
    // a cercare un elenco di valori ammessi che non esiste.
    const spec = p.type === 'range' || p.type === 'number'
      ? `<${p.min}..${p.max}>`
      : p.type === 'bool' ? '' : '<name>';
    const off = p.type === 'bool' ? ` ${t('cli.offSwitch', { name: kebab(p.key) })}` : '';
    return `  ${`${name} ${spec}`.padEnd(26)}${paramLabel(p, t)}${off}`;
  }).join('\n');

  return `ditherbox ${VERSION} — ${t('cli.tagline')}

USAGE
  ditherbox [image|folder]                   open the full-screen interface
  ditherbox photo.jpg -o out.png [options]   process and save, no interface
  ditherbox *.jpg --out-dir ./results        process in bulk
  ditherbox photo.jpg --print                print the result in the terminal

GENERAL OPTIONS
  -o, --out <file>        destination file (.png or .jpg)
  -d, --out-dir <folder>  destination folder for bulk processing
  -p, --preset <name>     apply a preset before the other options
  -m, --mode <name>       preview mode: ${MODE_KEYS.join(', ')}
  -t, --theme <name>      interface theme
  -l, --lang <code>       interface language: ${LOCALES.join(', ')}
      --print             print in the terminal instead of opening the interface
      --list              list palettes, algorithms, presets and themes
  -q, --quiet             no messages on standard output
  -h, --help              this screen
  -v, --version           version

PROCESSING PARAMETERS
${paramLines}

CONFIGURATION
  ~/.config/ditherbox/config.toml     starting values, theme and language
  ~/.config/ditherbox/themes/*.toml   personal themes, six colours each

CUSTOM PALETTES
  Instead of a name you can pass a list of colours:
    ditherbox photo.jpg --palette "#0a0c10,#c2fe0b" -o out.png
  It works everywhere: here, in config.toml and in the widget's data-palette.

EXAMPLES
  ditherbox ~/Photos                                 browse a folder
  ditherbox portrait.jpg -p macintosh -o out.png     the 1984 Mac classic
  ditherbox photo.jpg --palette gameboy --scale 4 -o gb.png
  ditherbox photo.jpg --algorithm bayer8 --contrast 40 --print
`;
}

function listText(t = inglese) {
  const section = (title, rows) => `${title}\n${rows.map((r) => `  ${r}`).join('\n')}\n`;
  return [
    section(t('cli.listPalettes'), Object.keys(PALETTES).map(
      (k) => `${k.padEnd(16)}${paletteLabel(k, t)}`
        + ` (${t('cli.colourCount', { n: PALETTES[k].colors.length })})`,
    )),
    section(t('cli.listAlgorithms'), ALGORITHMS.map(
      (a) => `${a.padEnd(22)}${algorithmLabel(a, t)}`,
    )),
    section(t('cli.listPresets'), Object.keys(PRESETS).map(
      (k) => `${k.padEnd(16)}${presetLabel(k, t)}`,
    )),
    section(t('cli.listThemes'), Object.keys(loadThemes())),
    section(t('cli.listModes'), MODE_KEYS.map(
      (k) => `${k.padEnd(16)}${modeLabel(k, t)}`,
    )),
  ].join('\n');
}

/** Espande una cartella nella lista delle immagini che contiene. */
async function expandInputs(paths, t = inglese) {
  const out = [];
  for (const p of paths) {
    const full = resolve(p);
    let st;
    try {
      st = statSync(full);
    } catch {
      throw new Error(t('cli.notFound', { name: p }));
    }
    if (st.isDirectory()) out.push(...(await listImages(full)));
    else if (isSupported(full)) out.push(full);
    else throw new Error(t('cli.onlyPngJpeg', { name: basename(p) }));
  }
  return out;
}

/** Nome del file di uscita quando non e' stato indicato esplicitamente. */
function defaultOutName(inputPath, options, outDir) {
  const base = basename(inputPath, extname(inputPath));
  const palette = isCustomPalette(options.palette) ? 'custom' : options.palette;
  const name = `${base}-${palette}-${options.algorithm}.png`;
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
  const { image } = processImage(small, {
    ...options,
    megapixels: (small.width * small.height) / 1e6,
  });
  process.stdout.write(`${renderImage(image, mode, theme).join('\n')}\n`);
}

export async function run(argv = process.argv.slice(2)) {
  // Due passaggi: il primo serve solo a sapere in che lingua parlare,
  // il secondo rifa' il lavoro potendo gia' scrivere gli errori giusti.
  const primo = parseArgs(argv);
  const config = loadConfig();
  // Una lingua sbagliata sulla riga di comando e' un errore, non un
  // silenzioso ritorno all'inglese: se scrivo --lang pt voglio saperlo.
  if (primo.flags.lang && !LOCALES.includes(shortLocale(primo.flags.lang))) {
    throw new Error(inglese('cli.noSuchLang', {
      name: primo.flags.lang, list: LOCALES.join(', '),
    }));
  }
  const t = createTranslator(primo.flags.lang || config.lang
    || detectLocale([process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG]));
  const { flags, positional } = parseArgs(argv, t);

  if (flags.help) {
    process.stdout.write(helpText(t));
    return 0;
  }
  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (flags.list) {
    process.stdout.write(listText(t));
    return 0;
  }

  let base = { ...DEFAULTS };
  for (const param of PARAMS) {
    if (config[param.key] !== undefined) base[param.key] = config[param.key];
  }
  if (flags.preset) {
    if (!PRESETS[flags.preset]) {
      throw new Error(t('cli.noSuchPreset', {
        name: flags.preset, list: Object.keys(PRESETS).join(', '),
      }));
    }
    base = applyPreset(flags.preset, base);
  }
  const options = normalizeOptions({ ...base, ...optionsFromFlags(flags, t) });

  const mode = flags.mode || config.mode || 'halfblock';
  if (!MODES[mode]) {
    throw new Error(t('cli.noSuchMode', { name: mode, list: MODE_KEYS.join(', ') }));
  }
  const theme = flags.theme || config.theme || DEFAULT_THEME;

  const inputs = positional.length ? await expandInputs(positional, t) : [];
  const log = (msg) => { if (!flags.quiet) process.stdout.write(`${msg}\n`); };

  // --- stampa nel terminale ---------------------------------------
  if (flags.print) {
    if (!inputs.length) throw new Error(t('cli.needPrintFile'));
    for (const path of inputs) {
      if (inputs.length > 1) log(`\n${basename(path)}`);
      await printToTerminal(path, options, mode, theme);
    }
    return 0;
  }

  // --- elaborazione senza interfaccia ------------------------------
  if (flags.out || flags['out-dir']) {
    if (!inputs.length) throw new Error(t('cli.needProcessFile'));
    if (flags.out && inputs.length > 1) {
      throw new Error(t('cli.manyFiles'));
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
    throw new Error(t('cli.notATty'));
  }

  const tui = new DitherTui({
    options,
    mode,
    theme,
    lang: t.locale,
    dir: inputs.length ? dirname(inputs[0]) : process.cwd(),
  });
  await tui.start(inputs[0]);
  return 0;
}
