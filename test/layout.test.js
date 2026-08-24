import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGINA = pathToFileURL(join(ROOT, 'examples', 'index.html')).href;

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
    const page = await browser.newPage({ viewportSize: { width: 1280, height: 900 } });
    const errori = [];
    page.on('pageerror', (e) => errori.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
    await page.goto(PAGINA, { waitUntil: 'networkidle' });
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
