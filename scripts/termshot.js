#!/usr/bin/env node
/**
 * Fotografa l'interfaccia da terminale e ne salva un PNG.
 *
 *   npm run termshot -- docs/tui.png foto.jpg
 *   node scripts/termshot.js docs/tui.png foto.jpg 100 32 braille en simonitto \
 *     '{"algorithm":"atkinson"}' red
 *
 * Il motivo per cui esiste: nel README l'interfaccia era incollata come
 * blocco di testo, e su GitHub i glifi braille finivano in un font di
 * ripiego con avanzamento diverso: le colonne si sfalsavano e la cornice
 * sembrava rotta. Una schermata vera non ha questo problema, perche' il
 * font lo scegliamo noi e ce lo portiamo dentro l'immagine.
 *
 * Serve un font monospaziato che copra sia i mezzi blocchi sia il
 * braille: DejaVu Sans Mono li ha tutti e sta praticamente ovunque.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

import { DitherTui } from '../src/cli/tui.js';
import { loadImage } from '../src/cli/imageio.js';
import { launchChromium } from './find-chromium.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const [
  out = 'tui.png', foto, larghezza = '100', altezza = '32',
  modo = 'halfblock', lingua = 'en', tema = 'simonitto', opzioni,
  cornice,
] = process.argv.slice(2);

const COLS = Number(larghezza);
const ROWS = Number(altezza);
const FONT = 'DejaVu Sans Mono';
/*
 * Geometria della cella.
 *
 * In un terminale i blocchi e le cornici sono disegnati per riempire la
 * cella esatta, e infatti si toccano. In una pagina HTML no: misurando
 * DejaVu Sans Mono, '█' dipinge 1.08 em di altezza dentro una scatola
 * di riga alta 1.17 em, e resta scoperta una fessura di 0.09 em per
 * riga. Il risultato e' un'anteprima a strisce e una cornice tratteggiata.
 *
 * Quindi: interlinea pari all'altezza davvero dipinta, e le righe alzate
 * di quel tanto che serve perche' il dipinto parta dal bordo di sopra.
 * Mezzo pixel di sovrapposizione chiude le giunzioni.
 */
const CORPO = 25;                                  // font-size in px
const DIPINTO = 1.08;                              // altezza dipinta di '█'
const SCATOLA = 1.17;                              // ascendente + discendente
const CELLA = Math.round(CORPO * DIPINTO);         // interlinea in px
const ALZATA = (CELLA - SCATOLA * CORPO) / 2 + 0.09 * CORPO + 0.5;
const SCALA = 2;                                   // densita' doppia

// ------------------------------------------------------- il frame ANSI

/** Costruisce la TUI su uno schermo finto e ne prende un frame. */
async function frameAnsi() {
  const tui = new DitherTui({
    mode: modo, lang: lingua, theme: tema,
    options: opzioni ? JSON.parse(opzioni) : undefined,
    guide: cornice,
  });
  tui.running = true;
  const righe = [];
  tui.screen = {
    width: COLS, height: ROWS,
    draw(lines) { righe.length = 0; righe.push(...lines); },
    enter() {}, leave() {}, invalidate() {},
  };

  if (foto) {
    const img = await loadImage(resolve(foto));
    tui.source = { width: img.width, height: img.height, data: img.data };
    tui.imagePath = resolve(foto);
    tui.sourceInfo = { format: img.format.toUpperCase(), bytes: '' };
    tui.files = [resolve(foto)];
    tui.fileIndex = 0;
  }
  tui.toast = null;
  tui.render();
  return { righe: [...righe], tema: tui.theme };
}

// ------------------------------------------------------- da ANSI a HTML

const scappa = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const esadecimale = (c) => (Array.isArray(c)
  ? `#${c.map((v) => (v | 0).toString(16).padStart(2, '0')).join('')}`
  : c);

/**
 * Spezza una riga ANSI in celle, una per carattere, con il loro stile.
 *
 * Riconosce solo quello che la TUI produce davvero: colore di primo
 * piano e di sfondo a 24 bit, grassetto, attenuato, invertito e
 * azzeramento. Il video invertito si rende scambiando i due colori,
 * come farebbe il terminale.
 */
function celle(riga, sfondo) {
  const fuori = [];
  let davanti = null;
  let dietro = null;
  let bold = false;
  let dim = false;
  let reverse = false;

  const aggiungi = (testo) => {
    for (const ch of testo) {
      let f = davanti || 'inherit';
      let b = dietro || sfondo;
      if (reverse) [f, b] = [b, f === 'inherit' ? '#ffffff' : f];
      fuori.push({ ch, f, b, bold, dim });
    }
  };

  const re = /\x1b\[([0-9;]*)m/g;
  let ultimo = 0;
  let m;
  while ((m = re.exec(riga)) !== null) {
    aggiungi(riga.slice(ultimo, m.index));
    ultimo = m.index + m[0].length;
    const parti = m[1].split(';').map(Number);
    if (parti[0] === 38 && parti[1] === 2) {
      davanti = esadecimale([parti[2], parti[3], parti[4]]);
    } else if (parti[0] === 48 && parti[1] === 2) {
      dietro = esadecimale([parti[2], parti[3], parti[4]]);
    } else {
      for (const p of parti) {
        if (p === 0) { davanti = null; dietro = null; bold = false; dim = false; reverse = false; }
        else if (p === 1) bold = true;
        else if (p === 2) dim = true;
        else if (p === 7) reverse = true;
      }
    }
  }
  aggiungi(riga.slice(ultimo));
  return fuori;
}

const BRAILLE = (ch) => ch >= '⠀' && ch <= '⣿';

/**
 * Una riga di celle diventa HTML a larghezza fissa.
 *
 * Qui sta il punto delicato di tutto lo script. In un terminale ogni
 * cella e' larga uguale per definizione; in una pagina no, e i glifi
 * braille di DejaVu Sans Mono sono larghi il 21% piu' delle lettere.
 * Incollati e basta, sfalsano ogni riga che li contiene: e' esattamente
 * il difetto che rendeva storta la schermata nel README.
 *
 * Quindi ogni tratto ha una larghezza dichiarata in celle, e i caratteri
 * braille vanno uno per cella, ristretti fin dentro la propria. Cosi' le
 * colonne restano colonne, nessun glifo viene tagliato, e il disegno
 * resta centrato dove la TUI l'ha centrato.
 */
function rigaHtml(celleRiga) {
  let html = '';
  let i = 0;
  while (i < celleRiga.length) {
    const c = celleRiga[i];
    const br = BRAILLE(c.ch);
    let j = i;
    let testo = '';
    while (j < celleRiga.length) {
      const d = celleRiga[j];
      if (d.f !== c.f || d.b !== c.b || d.bold !== c.bold || d.dim !== c.dim) break;
      if (BRAILLE(d.ch) !== br) break;
      testo += d.ch;
      j++;
    }
    const comune = [
      `color:${c.f}`,
      `background:${c.b}`,
      c.bold ? 'font-weight:700' : '',
      c.dim ? 'opacity:.65' : '',
    ].filter(Boolean).join(';');

    if (br) {
      // Un glifo per cella: strizzato dentro la sua, non dentro il tratto,
      // se no il disegno scivola a sinistra dello spazio che occupa.
      for (const ch of testo) {
        html += `<span class="br" style="${comune};width:var(--cella)">${scappa(ch)}</span>`;
      }
    } else {
      const stile = `${comune};width:calc(var(--cella) * ${j - i})`;
      html += `<span style="${stile}">${scappa(testo)}</span>`;
    }
    i = j;
  }
  return html || '&nbsp;';
}

function pagina(righe, tema) {
  const sfondo = esadecimale(tema.bg);
  const testo = esadecimale(tema.bright_fg);
  const corpo = righe
    .map((r) => `<div>${rigaHtml(celle(r, sfondo))}</div>`)
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; background: ${sfondo}; }
  #term {
    display: inline-block;
    padding: 12px 14px;
    background: ${sfondo};
    color: ${testo};
    font: 400 ${CORPO}px/${CELLA}px "${FONT}", monospace;
    white-space: pre;
    /* Zero crenatura e legature: le colonne devono restare colonne. */
    font-variant-ligatures: none;
    font-kerning: none;
    text-rendering: geometricPrecision;
  }
  #term div { height: ${CELLA}px; }
  #term span {
    display: inline-block;
    height: ${CELLA + 1}px;
    vertical-align: top;
    overflow: hidden;
    transform-origin: left top;
    transform: translateY(${-ALZATA}px);
  }
  #term span.br {
    transform: translateY(${-ALZATA}px) scaleX(var(--stretta));
  }
</style><div id="term">${corpo}</div>`;
}

/**
 * Misura sul posto la larghezza di una cella e quanto vanno strette le
 * celle braille. Misurare invece che indovinare: se un giorno il font
 * cambia, lo script continua a funzionare da solo.
 */
async function misura(page) {
  return page.evaluate(({ nome, corpo }) => {
    const prova = document.createElement('span');
    prova.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:400 ${corpo}px "${nome}",monospace`;
    document.body.appendChild(prova);
    const largo = (t) => { prova.textContent = t; return prova.getBoundingClientRect().width / t.length; };
    const latina = largo('MMMMMMMMMM');
    const braille = largo('⣿'.repeat(10));
    prova.remove();
    return { cella: latina, stretta: latina / braille };
  }, { nome: FONT, corpo: CORPO });
}

// ------------------------------------------------------------- scatto

const { righe, tema: colori } = await frameAnsi();

const browser = await launchChromium(chromium);
if (!browser) {
  process.stderr.write('Nessun Chromium utilizzabile: installalo o imposta CHROMIUM_PATH\n');
  process.exit(1);
}

const page = await browser.newPage({ deviceScaleFactor: SCALA });
await page.setContent(pagina(righe, colori), { waitUntil: 'load' });

const { cella, stretta } = await misura(page);
await page.evaluate(({ c, s: k }) => {
  const r = document.documentElement.style;
  r.setProperty('--cella', `${c}px`);
  r.setProperty('--stretta', String(k));
}, { c: cella, s: stretta });

// Se il font non c'e', le colonne si sfalsano e la schermata e' da
// buttare: meglio fermarsi qui che pubblicare l'immagine rotta.
const disponibile = await page.evaluate((nome) => document.fonts.check(`16px "${nome}"`), FONT);
if (!disponibile) {
  process.stderr.write(`Manca il font "${FONT}": senza, le colonne si sfalsano.\n`);
  await browser.close();
  process.exit(1);
}

const destinazione = resolve(ROOT, out);
await page.locator('#term').screenshot({ path: destinazione });
await browser.close();
process.stdout.write(`${destinazione}\n`);
