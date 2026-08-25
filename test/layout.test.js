import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join, extname, normalize } from 'node:path';

import { loadImage } from '../src/cli/imageio.js';
import { PARAMS } from '../src/core/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * La pagina di esempio viene servita su HTTP e non aperta da disco.
 *
 * Non e' pignoleria: la pagina carica una foto di prova, e da un'origine
 * file:// il browser blocca quella richiesta per la politica sulle origini
 * incrociate. Su file:// il collaudo vedrebbe un errore che nessun utente
 * vero incontrera' mai, perche' il widget in un sito sta su http.
 */
const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

let servitore = null;
async function serviRadice() {
  if (servitore) return servitore;
  const server = createServer((req, res) => {
    // Il percorso resta dentro la radice del progetto qualunque cosa arrivi.
    const chiesto = decodeURIComponent((req.url || '/').split('?')[0]);
    // Il browser la chiede sempre e la pagina non ce l'ha: senza questa
    // riga ogni prova finirebbe con un 404 nella lista degli errori.
    if (chiesto === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const file = join(ROOT, normalize(chiesto).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('no');
      return;
    }
    res.writeHead(200, { 'content-type': TIPI[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address();
  servitore = { server, base: `http://127.0.0.1:${port}` };
  return servitore;
}

test.after(() => { if (servitore) servitore.server.close(); });

// La pagina di esempio carica dist/, non src/: senza ricostruire il pacchetto
// questi controlli guarderebbero una versione vecchia del widget e
// passerebbero anche con i sorgenti rotti.
let costruzione = null;
function costruisci() {
  costruzione ||= promisify(execFile)(process.execPath, [join(ROOT, 'scripts', 'build.js')], { cwd: ROOT });
  return costruzione;
}

/**
 * Questi controlli girano in un browser vero perche' il difetto che devono
 * intercettare e' di impaginazione, e nessuna verifica sul solo DOM lo
 * vedrebbe: in un contenitore flex che scorre i figli restano comprimibili,
 * quindi con il contenuto piu' alto della finestra le sezioni si schiacciano
 * e i controlli sbordano fuori dai loro riquadri.
 *
 * Se Chromium non c'e', i test si saltano invece di far fallire la suite.
 */
async function apri() {
  await costruisci();
  let chromium;
  let launchChromium;
  try {
    ({ chromium } = await import('playwright'));
    ({ launchChromium } = await import('../scripts/find-chromium.js'));
  } catch {
    return null;
  }
  const browser = await launchChromium(chromium);
  if (!browser) return null;
  try {
    const { base } = await serviRadice();
    // La lingua si dichiara, non si eredita. Il widget la sceglie da
    // `navigator.language`, e senza fissarla questi confronti su testo
    // inglese passavano su una macchina in inglese e fallivano su una in
    // italiano. E' lo stesso difetto che teneva fermo `npm run release`
    // in test/cli.test.js, e qui e' rimasto nascosto piu' a lungo perche'
    // senza browser questi test saltano invece di fallire.
    const page = await browser.newPage({
      viewportSize: { width: 1280, height: 900 },
      locale: 'en-US',
    });
    const errori = [];
    page.on('pageerror', (e) => errori.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
    await page.goto(`${base}/examples/index.html`, { waitUntil: 'networkidle' });
    return { browser, page, errori };
  } catch {
    return null;
  }
}

/** Carica una foto sintetica nel primo widget della pagina. */
async function caricaFoto(page, w = 900, h = 1200) {
  await page.evaluate(async ([larghezza, altezza]) => {
    const c = document.createElement('canvas');
    c.width = larghezza;
    c.height = altezza;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, larghezza, altezza);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, larghezza, altezza);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await window.__boxes[0].load(new File([blob], 'prova.png', { type: 'image/png' }));
  }, [w, h]);
  await page.waitForTimeout(250);
}

test('impaginazione del widget nel browser', async (t) => {
  const sessione = await apri();
  if (!sessione) return t.skip('Chromium non disponibile');
  const { browser, page, errori } = sessione;
  t.after(() => browser.close());

  await caricaFoto(page);

  const misure = await page.evaluate(() => {
    const box = document.querySelector('.dbx');
    const r = (sel) => box.querySelector(sel).getBoundingClientRect();
    const scroll = box.querySelector('.dbx__scroll');
    const figli = [...scroll.children];
    const gap = parseFloat(getComputedStyle(scroll).rowGap) || 0;
    const padding = parseFloat(getComputedStyle(scroll).paddingTop) * 2;
    return {
      radice: box.getBoundingClientRect(),
      palco: r('.dbx__stage'),
      pannello: r('.dbx__panel'),
      sorgente: r('.dbx__source'),
      azioni: r('.dbx__actions'),
      canvas: r('.dbx__canvas'),
      sommaFigli: figli.reduce((a, n) => a + n.getBoundingClientRect().height, 0)
        + gap * (figli.length - 1) + padding,
      scrollHeight: scroll.scrollHeight,
      // Ogni sezione deve contenere davvero i propri figli.
      sezioniStrette: figli.filter((n) => n.scrollHeight > Math.ceil(n.getBoundingClientRect().height) + 1).length,
      larghiFuori: [...box.querySelectorAll('*')].filter((n) => {
        const b = n.getBoundingClientRect();
        const c = box.getBoundingClientRect();
        return b.width > 0 && (b.right > c.right + 1 || b.left < c.left - 1);
      }).length,
    };
  });

  assert.deepEqual(errori, [], 'la pagina non deve produrre errori');

  // Le due colonne devono combaciare in alto e in basso.
  assert.ok(Math.abs(misure.palco.top - misure.pannello.top) < 1, 'colonne disallineate in alto');
  assert.ok(Math.abs(misure.palco.bottom - misure.pannello.bottom) < 1, 'colonne disallineate in basso');

  // Nessuna sezione deve essere schiacciata sul proprio contenuto.
  assert.equal(misure.sezioniStrette, 0, 'una sezione e piu corta del suo contenuto');
  assert.ok(
    Math.abs(misure.sommaFigli - misure.scrollHeight) < 2,
    `le sezioni non tornano: ${misure.sommaFigli.toFixed(0)} contro ${misure.scrollHeight}`,
  );

  // Niente deve uscire lateralmente dal riquadro.
  assert.equal(misure.larghiFuori, 0, 'qualcosa sborda a destra o a sinistra');

  // Il campo per aprire la foto e i pulsanti restano dentro il pannello:
  // e' il difetto per cui il pulsante c'era ma nessuno lo trovava.
  assert.ok(misure.sorgente.top >= misure.pannello.top - 1, 'la barra sorgente esce in alto');
  assert.ok(misure.azioni.bottom <= misure.pannello.bottom + 1, 'le azioni escono in basso');
  assert.ok(misure.azioni.top > misure.sorgente.bottom, 'sorgente e azioni si sovrappongono');

  // L'anteprima deve stare nel palco.
  assert.ok(misure.canvas.width <= misure.palco.width + 1, 'il canvas sborda dal palco');
  assert.ok(misure.canvas.height <= misure.palco.height + 1, 'il canvas sborda dal palco');
});

test('il campo per aprire la foto e sempre raggiungibile', async (t) => {
  const sessione = await apri();
  if (!sessione) return t.skip('Chromium non disponibile');
  const { browser, page } = sessione;
  t.after(() => browser.close());

  const stato = await page.evaluate(() => {
    const box = document.querySelector('.dbx');
    const input = box.querySelector('.dbx__file-input');
    const label = input.closest('label');
    const scroll = box.querySelector('.dbx__scroll');
    const prima = label.getBoundingClientRect().top;
    scroll.scrollTop = scroll.scrollHeight;   // scorre i parametri fino in fondo
    return {
      dentroUnaLabel: Boolean(label),
      accettaImmagini: input.accept,
      // Scorrendo i parametri il campo non si deve muovere di un pixel.
      fermoDopoScorrimento: Math.abs(label.getBoundingClientRect().top - prima) < 1,
      visibile: label.getBoundingClientRect().height > 0,
    };
  });

  assert.ok(stato.dentroUnaLabel, 'l input file deve stare dentro una label');
  assert.equal(stato.accettaImmagini, 'image/*');
  assert.ok(stato.visibile, 'il campo non e visibile');
  assert.ok(stato.fermoDopoScorrimento, 'il campo scorre via insieme ai parametri');
});

test('i megapixel cambiano davvero la misura dell anteprima', async (t) => {
  const sessione = await apri();
  if (!sessione) return t.skip('Chromium non disponibile');
  const { browser, page } = sessione;
  t.after(() => browser.close());

  await caricaFoto(page, 1200, 900);

  const misura = async (megapixels) => page.evaluate(async (mp) => {
    window.__boxes[0].set({ megapixels: mp });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.querySelector('.dbx__canvas');
    return { w: c.width, h: c.height, stato: document.querySelector('.dbx__status').textContent };
  }, megapixels);

  const piccola = await misura(0.01);
  const grande = await misura(2);

  assert.ok(piccola.w < grande.w, `${piccola.w} non e piu piccola di ${grande.w}`);
  // Il rapporto fra le due deve seguire la radice del rapporto fra i megapixel.
  assert.ok(piccola.w <= 130, `a 0.01 MP l anteprima e ancora ${piccola.w}px`);
  assert.match(piccola.stato, /1200×900 → \d+×\d+/, 'lo stato deve dire da quanto a quanto');
  assert.ok(Math.abs(piccola.w / piccola.h - 1200 / 900) < 0.05, 'proporzioni perse');
});

test('scegliere una palette la segna come attiva', async (t) => {
  const sessione = await apri();
  if (!sessione) return t.skip('Chromium non disponibile');
  const { browser, page } = sessione;
  t.after(() => browser.close());
  await caricaFoto(page, 400, 300);

  const esito = await page.evaluate(async () => {
    const box = document.querySelector('.dbx');
    const pastiglie = [...box.querySelectorAll('.dbx__palette')];
    const marathon = pastiglie.find((b) => b.textContent.trim() === 'Marathon');
    marathon.click();
    await new Promise((r) => requestAnimationFrame(r));
    const attive = pastiglie.filter((b) => b.classList.contains('is-active'));
    // Ora una palette su misura: deve accendersi la voce "Su misura".
    window.__boxes[0].set({ palette: '#0a0c10,#c2fe0b' });
    const attiveDopo = pastiglie.filter((b) => b.classList.contains('is-active'));
    return {
      palette: window.__boxes[0].getOptions().palette,
      quanteAttive: attive.length,
      nomeAttiva: attive[0] && attive[0].textContent.trim(),
      nomeDopo: attiveDopo[0] && attiveDopo[0].textContent.trim(),
      quantePastiglie: pastiglie.length,
    };
  });

  assert.equal(esito.quanteAttive, 1, 'ne deve risultare attiva una sola');
  assert.equal(esito.nomeAttiva, 'Marathon');
  assert.equal(esito.nomeDopo, 'Custom', 'una palette scritta a mano accende "Custom"');
  assert.ok(esito.quantePastiglie >= 19, `solo ${esito.quantePastiglie} tavolozze`);
});

test('data-lang e il selettore cambiano lingua a tutto il widget', async (t) => {
  const sessione = await apri();
  if (!sessione) return t.skip('Chromium non disponibile');
  const { browser, page, errori } = sessione;
  t.after(() => browser.close());
  await caricaFoto(page, 400, 300);

  const esito = await page.evaluate(async () => {
    const attesa = () => new Promise((r) => requestAnimationFrame(r));
    const box = document.querySelector('.dbx');
    const etichette = () => [...box.querySelectorAll('.dbx__label')]
      .slice(0, 3).map((e) => e.textContent.trim());
    const out = { en: etichette() };

    // Il selettore: quello che ha in mano chi guarda la pagina.
    const sel = box.querySelector('.dbx__lang');
    out.lingue = [...sel.options].map((o) => o.value);
    sel.value = 'fr';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await attesa();
    out.fr = etichette();
    out.copiaFr = box.querySelector('.dbx__button--copy')?.textContent.trim() ?? null;

    // Cambiare lingua non deve azzerare la vista scelta ne' i parametri.
    window.__boxes[0].setView('ascii');
    await attesa();
    window.__boxes[0].setLocale('de');
    await attesa();
    out.de = etichette();
    out.vistaDopo = window.__boxes[0].getView();

    // E un widget montato da data-lang deve nascere gia' nella sua lingua.
    const nodo = document.createElement('div');
    nodo.setAttribute('data-ditherbox', '');
    nodo.dataset.lang = 'es';
    document.body.appendChild(nodo);
    const [nuovo] = window.DitherBox.autoInit();
    await attesa();
    out.daAttributo = nuovo.getLocale();
    out.etichetteAttributo = [...nodo.querySelectorAll('.dbx__label')]
      .slice(0, 3).map((e) => e.textContent.trim());
    return out;
  });

  assert.deepEqual(esito.lingue, ['en', 'it', 'es', 'fr', 'de']);
  assert.deepEqual(esito.en, ['Algorithm', 'Pixel', 'Strength']);
  assert.deepEqual(esito.fr, ['Algorithme', 'Pixel', 'Intensité']);
  assert.equal(esito.copiaFr, 'Copier');
  assert.deepEqual(esito.de, ['Algorithmus', 'Pixel', 'Stärke']);
  assert.equal(esito.vistaDopo, 'ascii', 'cambiare lingua ha perso la vista');
  assert.equal(esito.daAttributo, 'es');
  assert.deepEqual(esito.etichetteAttributo, ['Algoritmo', 'Píxel', 'Intensidad']);
  assert.deepEqual(errori, []);
});

test('la pagina parte con la foto di prova gia caricata', async (t) => {
  const sessione = await apri();
  if (!sessione) return t.skip('Chromium non disponibile');
  const { browser, page, errori } = sessione;
  t.after(() => browser.close());

  // Nessuna foto viene caricata qui: si guarda com'e' la pagina appena aperta.
  const esito = await page.evaluate(() => {
    const box = document.querySelector('.dbx');
    const b = window.__boxes[0];
    return {
      caricata: box.classList.contains('is-loaded'),
      misure: b.source ? [b.source.width, b.source.height] : null,
      nome: box.querySelector('.dbx__file-name')?.textContent.trim() ?? null,
      // Anche il secondo widget, quello montato da data-src.
      secondaCaricata: window.__boxes[1]?.source ? true : false,
    };
  });

  assert.ok(esito.caricata, 'il widget non risulta caricato');
  // Le misure si leggono dal file invece di scriverle qui: la foto di prova
  // si puo' sostituire senza che questo controllo vada rifatto.
  const vera = await loadImage(join(ROOT, 'examples', 'sample.jpg'));
  assert.deepEqual(
    esito.misure, [vera.width, vera.height],
    'la foto caricata non e quella di examples/sample.jpg',
  );
  assert.match(esito.nome || '', /sample\.jpg/);
  assert.ok(esito.secondaCaricata, 'data-src non ha caricato niente');
  assert.deepEqual(errori, []);
});

test('il cursore dei megapixel si ferma alla misura della foto', async (t) => {
  const sessione = await apri();
  if (!sessione) return t.skip('Chromium non disponibile');
  const { browser, page, errori } = sessione;
  t.after(() => browser.close());

  const esito = await page.evaluate(async () => {
    const attesa = () => new Promise((r) => requestAnimationFrame(r));
    const b = window.__boxes[0];

    const carica = async (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      await b.load(new File([blob], 'p.png', { type: 'image/png' }));
      await attesa();
    };

    const slider = () => [...document.querySelectorAll('.dbx__range')]
      .find((i) => /megapixels/i.test(i.id));
    const etichetta = () => document.querySelector(`output[for="${slider().id}"]`)?.textContent.trim();

    // Ogni posizione del cursore deve dare una misura diversa dalla
    // precedente: se ce ne sono due uguali, quel tratto di corsa e' morto.
    const misureDistinte = async () => {
      const s = slider();
      const viste = [];
      for (let i = 0; i <= Number(s.max); i++) {
        s.value = String(i);
        s.dispatchEvent(new Event('input', { bubbles: true }));
        await attesa();
        const blob = await b.toBlob();
        const bmp = await createImageBitmap(blob);
        viste.push(`${bmp.width}x${bmp.height}`);
        bmp.close();
      }
      return viste;
    };

    // Foto piccola: meta' dei gradini era inerte.
    await carica(760, 1000);
    const piccola = {
      max: Number(slider().max),
      etichettaInCima: (() => {
        const s = slider();
        s.value = s.max;
        s.dispatchEvent(new Event('input', { bubbles: true }));
        return etichetta();
      })(),
      misure: await misureDistinte(),
    };

    // Foto grande: il cursore deve riaprirsi.
    await carica(4000, 3000);
    const grande = { max: Number(slider().max) };

    return { piccola, grande };
  });

  const { piccola, grande } = esito;

  // Nessuna misura ripetuta: ogni posizione del cursore fa qualcosa.
  const doppioni = piccola.misure.filter((v, i) => piccola.misure.indexOf(v) !== i);
  assert.deepEqual(doppioni, [], `posizioni che non cambiano niente: ${doppioni.join(', ')}`);

  // In cima il numero e quello della foto, non quello chiesto.
  assert.match(piccola.etichettaInCima || '', /0\.76 MP/, 'in cima deve dire i megapixel veri della foto');

  // Una foto piu' grande riapre la corsa.
  assert.ok(grande.max > piccola.max, `il tetto non si e alzato: ${piccola.max} -> ${grande.max}`);
  assert.deepEqual(errori, []);
});

/**
 * La regola del progetto dice che un parametro dichiarato una volta compare
 * in tutte e tre le interfacce da solo. Nel terminale si vede subito; nel
 * widget nessuno se ne accorge finche' qualcuno non apre la pagina, e questi
 * test per molto tempo sono saltati. Qui il conto si fa davvero.
 */
test('il widget costruisce un controllo per ogni parametro dichiarato', async (t) => {
  const sessione = await apri();
  if (!sessione) return t.skip('Chromium non disponibile');
  const { browser, page } = sessione;
  t.after(() => browser.close());

  const mancanti = await page.evaluate((chiavi) => chiavi.filter(
    (k) => !document.querySelector(`.dbx [data-param="${k}"]`),
  ), PARAMS.map((p) => p.key));

  assert.deepEqual(mancanti, [], `parametri senza controllo nel widget: ${mancanti}`);
});

test('inquadratura e ritaglio funzionano anche nel widget', async (t) => {
  const sessione = await apri();
  if (!sessione) return t.skip('Chromium non disponibile');
  const { browser, page } = sessione;
  t.after(() => browser.close());

  await caricaFoto(page, 1200, 900);

  const misura = async (opzioni) => page.evaluate(async (o) => {
    window.__boxes[0].set(o);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.querySelector('.dbx__canvas');
    return { w: c.width, h: c.height };
  }, opzioni);

  const intera = await misura({ aspect: 'source', fit: 'crop', zoom: 100, megapixels: 2 });
  assert.ok(Math.abs(intera.w / intera.h - 1200 / 900) < 0.05, 'di partenza deve essere 4:3');

  const quadrata = await misura({ aspect: '1:1' });
  assert.ok(Math.abs(quadrata.w / quadrata.h - 1) < 0.05,
    `1:1 non ha inquadrato: ${quadrata.w}x${quadrata.h}`);

  const conBande = await misura({ aspect: '1:1', fit: 'pad' });
  assert.ok(Math.abs(conBande.w / conBande.h - 1) < 0.05,
    `le bande non hanno inquadrato: ${conBande.w}x${conBande.h}`);
  assert.ok(conBande.w > quadrata.w, 'con le bande il fotogramma non si accorcia');

  const stretta = await misura({ aspect: '1:1', fit: 'crop', zoom: 50 });
  assert.ok(stretta.w < quadrata.w, `lo zoom non ha rimpicciolito: ${stretta.w}`);
});
