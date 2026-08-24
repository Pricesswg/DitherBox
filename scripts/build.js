#!/usr/bin/env node
/**
 * Impacchetta i moduli in un unico file da includere con un <script> secco,
 * per chi non usa un bundler.
 *
 * Con Astro (o qualunque cosa capisca gli ES module) questo file non serve:
 * si importa direttamente src/web/ditherbox.js. Serve solo per la pagina
 * HTML scritta a mano.
 *
 * Non e' un bundler generico: conosce l'elenco dei moduli e il loro ordine.
 * Ogni modulo finisce dentro una funzione, cosi' due file possono avere
 * variabili interne con lo stesso nome senza pestarsi i piedi.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** In ordine di dipendenza: ogni modulo importa solo da quelli sopra di lui. */
const MODULES = [
  'src/core/palettes.js',
  'src/core/matrices.js',
  'src/core/adjust.js',
  'src/core/dither.js',
  'src/core/i18n.js',
  'src/core/textart.js',
  'src/core/options.js',
  'src/core/process.js',
  'src/core/index.js',
  'src/web/ditherbox.js',
];

const varName = (path) => `__m_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;

/** Toglie le istruzioni di import e annota cosa importava da dove. */
function stripImports(source, path) {
  const imports = [];
  const cleaned = source.replace(
    /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm,
    (match, clause, from) => {
      if (!from.startsWith('.')) {
        throw new Error(`${path}: import esterno non impacchettabile (${from})`);
      }
      const target = resolve(dirname(join(ROOT, path)), from).slice(ROOT.length + 1);
      // Un import verso un file che non e' nell'elenco produrrebbe un
      // riferimento a una variabile mai definita, e il guasto salterebbe
      // fuori solo aprendo la pagina. Meglio fermarsi qui.
      if (!MODULES.includes(target)) {
        throw new Error(
          `${path}: importa ${target}, che non e' fra i moduli impacchettati. `
          + 'Aggiungilo a MODULES in scripts/build.js, dopo le sue dipendenze.',
        );
      }
      imports.push({ clause: clause.trim(), target });
      return '';
    },
  );
  return { cleaned, imports };
}

/**
 * Ricava la mappa "nome esportato -> nome locale".
 * I nomi esportati li chiediamo a Node importando il modulo davvero, cosi'
 * non dobbiamo fidarci di un'analisi del testo; le rinomine (export { a as b })
 * le leggiamo invece dal sorgente, perche' quelle Node non le racconta.
 */
async function exportMap(path, source) {
  const ns = await import(pathToFileURL(join(ROOT, path)).href);
  const names = Object.keys(ns).filter((n) => n !== 'default');
  const renames = {};
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}\s*;?[ \t]*$/gm)) {
    for (const part of m[1].split(',')) {
      const as = part.trim().match(/^([\w$]+)\s+as\s+([\w$]+)$/);
      if (as) renames[as[2]] = as[1];
    }
  }
  return names.map((name) => [name, renames[name] || name]);
}

/** Rimuove le parole chiave `export` lasciando le dichiarazioni. */
function stripExports(source) {
  return source
    .replace(/^export\s*\{[^}]*\}\s*;?[ \t]*$/gm, '')
    .replace(/^export\s+default\s+[\w$]+\s*;?[ \t]*$/gm, '')
    .replace(/^export\s+\*\s+from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^export\s+(?=(const|let|var|function|async|class)\b)/gm, '');
}

async function build() {
  const chunks = [];
  const publicNames = new Set();

  for (const path of MODULES) {
    const source = await readFile(join(ROOT, path), 'utf8');

    // File barile (solo `export * from`): non ha corpo suo, e' l'unione
    // dei moduli che ri-esporta.
    const reexports = [...source.matchAll(/^export\s+\*\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm)];
    if (reexports.length) {
      const parts = reexports.map((m) => {
        const target = resolve(dirname(join(ROOT, path)), m[1]).slice(ROOT.length + 1);
        // Stessa verifica del ramo degli import: un `export * from` verso un
        // file assente dall'elenco produce un riferimento a nulla, e il
        // guasto si vede solo aprendo la pagina.
        if (!MODULES.includes(target)) {
          throw new Error(
            `${path}: ri-esporta ${target}, che non e' fra i moduli impacchettati. `
            + 'Aggiungilo a MODULES in scripts/build.js, dopo le sue dipendenze.',
          );
        }
        return varName(target);
      });
      chunks.push(`const ${varName(path)} = Object.assign({}, ${parts.join(', ')});`);
      for (const [out] of await exportMap(path, source)) {
        publicNames.add(`${out}: ${varName(path)}.${out}`);
      }
      continue;
    }

    const { cleaned, imports } = stripImports(source, path);
    const exports = await exportMap(path, source);

    const bindings = imports
      .map(({ clause, target }) => {
        const named = clause.replace(/^\{|\}$/g, '').trim();
        if (!named) return '';
        // `import { a as b }` diventa `const { a: b } = modulo;`
        const list = named.split(',')
          .map((s) => s.trim().replace(/\s+as\s+/, ': '))
          .filter(Boolean)
          .join(', ');
        return `  const { ${list} } = ${varName(target)};`;
      })
      .filter(Boolean)
      .join('\n');

    const returned = exports.map(([out, local]) => (out === local ? out : `${out}: ${local}`)).join(', ');
    chunks.push(
      `const ${varName(path)} = (() => {\n${bindings}\n${stripExports(cleaned)}\n`
      + `  return { ${returned} };\n})();`,
    );
    if (path === 'src/web/ditherbox.js') {
      for (const [out] of exports) publicNames.add(`${out}: ${varName(path)}.${out}`);
    }
  }

  const banner = `/* DitherBox — build singolo file. Generato da scripts/build.js: non modificarlo a mano. */`;
  const out = `${banner}\n(function (global) {\n'use strict';\n\n`
    + `${chunks.join('\n\n')}\n\n`
    + `global.DitherBox = Object.assign(${varName('src/web/ditherbox.js')}.DitherBox, {\n  ${[...publicNames].join(',\n  ')}\n});\n`
    + `})(typeof globalThis !== 'undefined' ? globalThis : this);\n`;

  await mkdir(destinazione, { recursive: true });
  await writeFile(join(destinazione, 'ditherbox.global.js'), out);
  await writeFile(
    join(destinazione, 'ditherbox.css'),
    await readFile(join(ROOT, 'src/web/ditherbox.css'), 'utf8'),
  );

  const kb = (out.length / 1024).toFixed(1);
  process.stdout.write(`${join(destinazione, 'ditherbox.global.js')}  ${kb} kB\n`);
}

/**
 * Destinazione: dist/ salvo diversa indicazione. Serve ai test, che
 * costruiscono in una cartella temporanea per confrontarla con quella
 * committata senza sovrascriverla - se no il controllo di allineamento si
 * ripara da solo e smette di dire la verita'.
 */
const indice = process.argv.indexOf('--out');
const destinazione = indice > 0 && process.argv[indice + 1]
  ? resolve(process.argv[indice + 1])
  : join(ROOT, 'dist');

await build();
