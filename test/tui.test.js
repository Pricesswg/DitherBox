import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { DitherTui } from '../src/cli/tui.js';
import { parseKey, visibleLength } from '../src/cli/term.js';
import { loadThemes } from '../src/cli/theme.js';
import { MODE_KEYS, GUIDES } from '../src/cli/preview.js';
import { loadImage } from '../src/cli/imageio.js';
import { VERSION } from '../src/cli/version.js';
import {
  processImage, exportSize, selectionFrame, aspectRatio,
} from '../src/core/index.js';
import { tempDir, writeSample, mountTui } from './helpers.js';

const press = (tui, s) => tui._handle(parseKey(Buffer.from(s, 'binary')));
const senzaColori = (l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const testo = (frame) => frame.map(senzaColori).join('\n');

/** Nessuna riga deve superare la larghezza dichiarata dello schermo. */
function verificaMisure(frame, width, height, etichetta) {
  assert.ok(frame.length <= height, `${etichetta}: ${frame.length} righe per ${height} disponibili`);
  for (const [i, line] of frame.entries()) {
    assert.ok(
      visibleLength(line) <= width,
      `${etichetta}: riga ${i} larga ${visibleLength(line)} su ${width}`,
    );
  }
}

test('la TUI disegna un frame intero a molte misure e in ogni modo', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 900, 1200);

  for (const [w, h] of [[100, 34], [80, 24], [60, 20], [42, 14], [200, 60], [40, 12]]) {
    for (const mode of MODE_KEYS) {
      const { frame, render } = await mountTui(DitherTui, { width: w, height: h, path, mode, dir });
      verificaMisure(render(), w, h, `${w}x${h}/${mode}`);
      assert.ok(frame.length > 0);
    }
  }
});

test('sotto la misura minima avvisa invece di disegnare a caso', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 200, 200);
  const { render } = await mountTui(DitherTui, { width: 20, height: 6, path, dir });
  assert.match(testo(render()), /too small/);
});

test('senza immagine mostra un invito invece di rompersi', async () => {
  const { render } = await mountTui(DitherTui, { width: 90, height: 30 });
  const t = testo(render());
  assert.match(t, /No image loaded/);
  assert.match(t, /open a path/);
});

test('la riga di stato sta in una riga e riporta l essenziale', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'ritratto.png', 640, 480);
  const { frame, render } = await mountTui(DitherTui, { width: 100, height: 32, path, dir });
  render();

  const prima = senzaColori(frame[0]);
  assert.match(prima, /ritratto\.png/);
  assert.match(prima, /1-bit B\/W/i);
  assert.match(prima, /640×480 → \d+×\d+/);
  assert.match(prima, /prev\. \d+×\d+/);

  // Una riga sola: la seconda deve essere gia' il bordo dell'anteprima.
  assert.match(senzaColori(frame[1]), /PREVIEW/);

  // E niente istogramma ne nome del tema, che occupavano quattro righe.
  const tutto = testo(frame);
  assert.doesNotMatch(tutto, /winamp/);
  assert.doesNotMatch(tutto, /DITHERBOX/);
});

test('il riquadro dell anteprima si stringe sull immagine', async (t) => {
  const dir = tempDir(t);
  // Foto verticale su terminale largo: prima restava un riquadro largo
  // quanto lo schermo con dentro un'immagine schiacciata.
  const path = await writeSample(dir, 'alta.png', 600, 1200);
  const { frame, render } = await mountTui(DitherTui, {
    width: 140, height: 36, path, dir, mode: 'halfblock',
  });
  render();

  const righe = frame.map(senzaColori);
  const bordo = righe.find((l) => l.includes('PREVIEW'));
  const largoRiquadro = bordo.indexOf('╮') - bordo.indexOf('╭') + 1;

  // Quante colonne occupa davvero il disegno dentro il riquadro.
  const sx = bordo.indexOf('╭');
  const dx = bordo.indexOf('╮');
  let largoImmagine = 0;
  for (const riga of righe) {
    const dentro = riga.slice(sx + 1, dx);
    const primo = dentro.search(/[^\s]/);
    if (primo < 0) continue;
    const ultimo = dentro.length - 1 - [...dentro].reverse().join('').search(/[^\s]/);
    largoImmagine = Math.max(largoImmagine, ultimo - primo + 1);
  }

  assert.ok(largoImmagine > 0, 'nessuna immagine disegnata');
  assert.ok(
    largoRiquadro - largoImmagine < 20,
    `riquadro largo ${largoRiquadro} per un'immagine di ${largoImmagine}: troppo vuoto`,
  );
});

test('con una sola immagine la lista file non ruba righe all anteprima', async (t) => {
  const dir = tempDir(t);
  const uno = await writeSample(dir, 'uno.png', 600, 900);
  const soloUno = await mountTui(DitherTui, { width: 120, height: 34, path: uno, dir });
  soloUno.tui.files = [uno];
  soloUno.tui.fileIndex = 0;
  const testoUno = testo(soloUno.render());
  assert.doesNotMatch(testoUno, /FILES \d/, 'con un file solo la lista non serve');

  const due = await writeSample(dir, 'due.png', 600, 900);
  const conDue = await mountTui(DitherTui, { width: 120, height: 34, path: uno, dir });
  conDue.tui.files = [uno, due];
  conDue.tui.fileIndex = 0;
  assert.match(testo(conDue.render()), /FILES 1\/2/, 'con due file la lista deve comparire');

  // E l'anteprima deve essere piu' alta quando la lista non c'e'.
  const alto = (f) => f.filter((l) => /[⠀-⣿▀▄█░▒▓]/.test(senzaColori(l))).length;
  assert.ok(
    alto(soloUno.frame) >= alto(conDue.frame),
    'senza lista file l anteprima deve avere almeno lo stesso spazio',
  );
});

test('caricare e salvare mostrano una barra di avanzamento', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 500, 400);
  const { tui, frame, render } = await mountTui(DitherTui, { width: 100, height: 30, dir });

  // Durante il caricamento la riga di stato deve diventare la barra.
  const viste = [];
  const disegnoVero = tui.screen.draw;
  tui.screen.draw = (l) => { disegnoVero(l); viste.push(senzaColori(l[0])); };
  await tui.openImage(path);
  tui.screen.draw = disegnoVero;

  const conBarra = viste.filter((r) => /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(r) && /%/.test(r));
  assert.ok(conBarra.length >= 2, `nessuna barra durante il caricamento: ${JSON.stringify(viste)}`);
  assert.ok(conBarra.some((r) => /Reading/.test(r)), 'manca la fase di lettura');

  // A operazione finita la riga torna a raccontare l immagine.
  tui.toast = null;
  render();
  assert.doesNotMatch(senzaColori(frame[0]), /%/);
  assert.match(senzaColori(frame[0]), /foto\.png/);
});

test('i tasti muovono il cursore e cambiano i valori', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 200, 200);
  const { tui, render } = await mountTui(DitherTui, { width: 100, height: 34, path, dir });

  assert.equal(tui.options.palette, 'bw');
  press(tui, 'l');
  assert.notEqual(tui.options.palette, 'bw', 'l deve avanzare la palette');
  press(tui, 'h');
  assert.equal(tui.options.palette, 'bw', 'h deve tornare indietro');

  // Scende fino a "Pixel" e lo alza di uno.
  press(tui, 'j');
  press(tui, 'j');
  const prima = tui.options.scale;
  press(tui, 'l');
  assert.equal(tui.options.scale, prima + 1);
  press(tui, 'L');
  assert.equal(tui.options.scale, prima + 6, 'L deve muoversi a passi di cinque');

  render();
});

test('i valori restano dentro i limiti anche insistendo sul tasto', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 100, 100);
  const { tui } = await mountTui(DitherTui, { width: 100, height: 34, path, dir });
  press(tui, 'j'); press(tui, 'j');           // Pixel
  for (let i = 0; i < 80; i++) press(tui, 'l');
  assert.equal(tui.options.scale, 16);
  for (let i = 0; i < 80; i++) press(tui, 'h');
  assert.equal(tui.options.scale, 1);
});

test('le enum girano in tondo senza uscire dall elenco', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 100, 100);
  const { tui } = await mountTui(DitherTui, { width: 100, height: 34, path, dir });
  const valide = new Set(Object.keys((await import('../src/core/index.js')).PALETTES));
  for (let i = 0; i < 40; i++) {
    press(tui, 'h');
    assert.ok(valide.has(tui.options.palette), `palette fuori elenco: ${tui.options.palette}`);
  }
});

test('il cursore non si ferma sulle intestazioni di gruppo', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 100, 100);
  const { tui } = await mountTui(DitherTui, { width: 100, height: 34, path, dir });
  for (let i = 0; i < 40; i++) {
    assert.equal(tui.rows[tui.cursor].kind, 'param', `fermo su ${tui.rows[tui.cursor].kind}`);
    press(tui, 'j');
  }
  for (let i = 0; i < 40; i++) {
    assert.equal(tui.rows[tui.cursor].kind, 'param');
    press(tui, 'k');
  }
});

test('v gira fra i modi di anteprima, t apre e chiude i temi', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 100, 100);
  const { tui, render } = await mountTui(DitherTui, { width: 96, height: 30, path, dir });

  const visti = new Set();
  for (let i = 0; i < MODE_KEYS.length; i++) {
    visti.add(tui.previewMode);
    press(tui, 'v');
  }
  assert.deepEqual([...visti].sort(), [...MODE_KEYS].sort());

  const iniziale = tui.themeName;
  press(tui, 't');
  assert.ok(tui.overlay, 't deve aprire il selettore');
  assert.match(testo(render()), /THEME/);
  press(tui, '\x1b[B');                       // freccia giu: anteprima dal vivo
  assert.notEqual(tui.themeName, iniziale);
  press(tui, '\x1b');                         // esc: deve rimettere quello di prima
  assert.equal(tui.overlay, null);
  assert.equal(tui.themeName, iniziale);

  press(tui, 't');
  press(tui, '\x1b[B');
  press(tui, '\r');                           // invio: conferma
  assert.equal(tui.overlay, null);
  assert.notEqual(tui.themeName, iniziale);
});

test('p applica un preset e r riazzera', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 100, 100);
  const { tui } = await mountTui(DitherTui, { width: 96, height: 30, path, dir });

  press(tui, 'p');
  press(tui, '\x1b[B'); press(tui, '\x1b[B');  // scende fino a Game Boy
  press(tui, '\r');
  assert.equal(tui.options.palette, 'gameboy');
  assert.ok(tui.options.scale > 1);

  press(tui, 'r');
  assert.equal(tui.options.palette, 'bw');
  assert.equal(tui.options.scale, 1);
});

test('i? mostra i tasti e si richiude', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 100, 100);
  const { tui, render } = await mountTui(DitherTui, { width: 96, height: 30, path, dir });
  press(tui, '?');
  assert.match(testo(render()), /KEYS/);
  press(tui, '\x1b');
  assert.equal(tui.overlay, null);

  press(tui, '\x0b');                          // ctrl+k
  assert.ok(tui.overlay);
  press(tui, '\x1b');
  assert.equal(tui.overlay, null);
});

test('i inverte, ctrl+x nasconde la lista dei file', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 100, 100);
  const { tui } = await mountTui(DitherTui, { width: 100, height: 34, path, dir });
  press(tui, 'i');
  assert.equal(tui.options.invert, true);
  press(tui, 'i');
  assert.equal(tui.options.invert, false);

  const prima = tui.showFiles;
  press(tui, '\x18');
  assert.equal(tui.showFiles, !prima);
});

test('n e N scorrono le immagini della cartella', async (t) => {
  const dir = tempDir(t);
  const a = await writeSample(dir, 'a.png', 80, 80);
  const b = await writeSample(dir, 'b.png', 80, 80);
  const { tui } = await mountTui(DitherTui, { width: 100, height: 34, path: a, dir });
  tui.files = [a, b];
  tui.fileIndex = 0;

  await press(tui, 'n');
  assert.equal(tui.imagePath, b);
  await press(tui, 'N');
  assert.equal(tui.imagePath, a);

  // Da in fondo si torna in cima: la lista gira in tondo.
  tui.fileIndex = 1;
  await press(tui, 'n');
  assert.equal(tui.imagePath, a);
});

test('il campo di testo accetta scrittura, cancellazione e annullamento', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 100, 100);
  const { tui, render } = await mountTui(DitherTui, { width: 96, height: 30, path, dir });

  press(tui, 's');
  assert.ok(tui.overlay);
  assert.match(testo(render()), /SAVE/);
  for (const ch of '\x7f'.repeat(4)) press(tui, ch);   // toglie ".png"
  for (const ch of 'X.png') press(tui, ch);
  assert.match(testo(render()), /X\.png/);
  press(tui, '\x1b');
  assert.equal(tui.overlay, null);
});

test('salvare dalla TUI scrive davvero il file a piena risoluzione', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 400, 300);
  const { tui } = await mountTui(DitherTui, { width: 96, height: 30, path, dir });

  press(tui, 'p'); press(tui, '\r');                  // preset Macintosh
  press(tui, 's');
  // Svuota il percorso proposto e scrive il proprio.
  press(tui, '\x05');                                  // fine
  for (let i = 0; i < 400; i++) press(tui, '\x7f');
  for (const ch of join(dir, 'esito.png')) press(tui, ch);
  press(tui, '\r');
  await new Promise((r) => setTimeout(r, 300));

  const img = await loadImage(join(dir, 'esito.png'));
  assert.deepEqual([img.width, img.height], [400, 300], 'deve salvare a piena risoluzione');
  const colori = new Set();
  for (let i = 0; i < img.data.length; i += 4) colori.add(img.data[i]);
  assert.deepEqual([...colori].sort((a, b) => a - b), [0, 255]);
});

test('salvare con un estensione sbagliata avvisa senza scrivere', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 80, 80);
  const { tui } = await mountTui(DitherTui, { width: 96, height: 30, path, dir });
  press(tui, 's');
  press(tui, '\x05');
  for (let i = 0; i < 400; i++) press(tui, '\x7f');
  for (const ch of join(dir, 'esito.gif')) press(tui, ch);
  press(tui, '\r');
  await new Promise((r) => setTimeout(r, 200));
  assert.match(tui.toast.text, /\.png or \.jpg/);
});

test('ogni tema si disegna senza sfondare la riga', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 300, 200);
  for (const theme of Object.keys(loadThemes())) {
    const { render } = await mountTui(DitherTui, { width: 92, height: 28, path, dir, theme });
    verificaMisure(render(), 92, 28, theme);
  }
});

test('un tasto sconosciuto non fa niente e non solleva errori', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 80, 80);
  const { tui } = await mountTui(DitherTui, { width: 90, height: 28, path, dir });
  const prima = JSON.stringify(tui.options);
  for (const ch of ['z', 'Q', '@', '\x1b[200~', '~']) press(tui, ch);
  assert.equal(JSON.stringify(tui.options), prima);
});

test('ctrl+l apre il selettore di lingua e cambia l interfaccia dal vivo', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 400, 300);
  const { tui, render } = await mountTui(DitherTui, { width: 100, height: 32, path, dir });

  assert.equal(tui.locale, 'en');
  assert.match(testo(render()), /CONTROLS/);

  press(tui, '\x0c');                                  // ctrl+l
  assert.ok(tui.overlay, 'ctrl+l non apre niente');
  assert.match(testo(render()), /LANGUAGE/);
  assert.match(testo(render()), /Italiano/);

  // Scorrendo l elenco l interfaccia dietro cambia subito.
  press(tui, 'j');
  assert.equal(tui.locale, 'it');
  assert.match(testo(render()), /CONTROLLI/);

  // Esc rimette la lingua di prima.
  press(tui, '\x1b');
  assert.equal(tui.overlay, null);
  assert.equal(tui.locale, 'en');
  assert.match(testo(render()), /CONTROLS/);

  // Invio invece la conferma.
  press(tui, '\x0c');
  press(tui, 'j'); press(tui, 'j'); press(tui, 'j');    // it, es, fr
  press(tui, '\r');
  assert.equal(tui.locale, 'fr');
  assert.match(testo(render()), /APER[ÇC]U/);
  assert.match(tui.toast.text, /Fran[çc]ais/);
});

test('la TUI parte nella lingua chiesta e traduce etichette e tasti', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 400, 300);
  const { tui, render } = await mountTui(DitherTui, {
    width: 100, height: 32, path, dir, lang: 'de',
  });

  const schermo = testo(render());
  assert.match(schermo, /VORSCHAU/, 'titolo dell anteprima non tradotto');
  assert.match(schermo, /Algorithmus/, 'etichette dei parametri non tradotte');

  press(tui, '?');
  const aiuto = testo(render());
  assert.match(aiuto, /TASTEN/);
  assert.match(aiuto, /Sprache/, 'la voce della lingua manca dall aiuto');
});

/** I colori truecolor che compaiono in un frame, come stringhe "r,g,b". */
function coloriDelFrame(frame) {
  const out = new Set();
  for (const riga of frame) {
    for (const m of riga.matchAll(/\x1b\[(?:38|48);2;(\d+);(\d+);(\d+)m/g)) {
      out.add(`${m[1]},${m[2]},${m[3]}`);
    }
  }
  return out;
}

const grigiIntermedi = (frame) => [...coloriDelFrame(frame)].filter((c) => {
  const [r, g, b] = c.split(',').map(Number);
  return r === g && g === b && r > 16 && r < 239;
}).length;

/**
 * Con la tavolozza a due toni e Pixel a 1, il file salvato e' ditherato a
 * piena risoluzione: chi lo apre lo vede rimpicciolito e i punti si
 * rimediano in grigi. Ditherando invece alla griglia del terminale ogni
 * cella e' nera o bianca, e l'anteprima promette una trama che nel file
 * non si vedra' mai. E' il difetto per cui il salvataggio sembrava rotto.
 *
 * Il confronto e' fra due Pixel diversi invece che su un numero assoluto:
 * anche il tema ha i suoi grigi, e sottrarli fra loro li toglie di mezzo.
 */
test("l'anteprima mostra il file come si vedra', non la trama alla griglia", async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'grande.png', 1200, 900);
  const { tui, render } = await mountTui(
    DitherTui, { width: 100, height: 34, path, dir, mode: 'halfblock' },
  );

  const conPixel = (scale) => {
    tui.options = { ...tui.options, palette: 'bw', algorithm: 'bayer8', scale };
    tui.cache = null;
    return grigiIntermedi(render());
  };

  const fine = conPixel(1);
  const grosso = conPixel(16);
  assert.ok(
    fine > grosso + 8,
    `a Pixel 1 i grigi dovrebbero essere molti di piu': ${fine} contro ${grosso}`,
  );
});

test("l'intestazione dichiara la misura d'uscita col rapporto chiesto", async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 1000, 1000);
  const { tui, render } = await mountTui(DitherTui, { width: 120, height: 34, path, dir });

  tui.options = { ...tui.options, aspect: '16:9', fit: 'crop', megapixels: 24 };
  tui.cache = null;
  assert.match(testo(render()), /1000×563/);

  tui.options = { ...tui.options, aspect: '16:9', fit: 'pad' };
  tui.cache = null;
  assert.match(testo(render()), /1778×1000/);
});

const COLORI_GUIDA = new Set(Object.values(GUIDES).map((c) => c.join(',')));

/**
 * Le celle di cornice presenti in un frame, col loro colore.
 * Si filtra sui colori della guida perche' i caratteri di cornice li usano
 * anche i pannelli della TUI, e senza il filtro si contavano quelli.
 */
function corniceNelFrame(frame) {
  const out = [];
  for (const riga of frame) {
    for (const m of riga.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m([┌┐└┘─│])/g)) {
      const colore = `${m[1]},${m[2]},${m[3]}`;
      if (COLORI_GUIDA.has(colore)) out.push(colore);
    }
  }
  return out;
}

/**
 * La cornice serve a far vedere che cosa si perde, e per vederlo l'anteprima
 * deve mostrare la foto intera: disegnata sull'immagine gia' ritagliata
 * cadrebbe sul bordo del riquadro e non direbbe niente.
 */
test('col ritaglio la cornice compare sopra l anteprima, nel colore scelto', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 900, 900);
  const { tui, render } = await mountTui(
    DitherTui, { width: 110, height: 34, path, dir, mode: 'halfblock' },
  );

  tui.options = { ...tui.options, aspect: '16:9', fit: 'crop' };
  tui.guide = 'off';
  tui.cache = null;
  assert.deepEqual(corniceNelFrame(render()), [], 'spenta non deve disegnare niente');

  tui.guide = 'red';
  tui.cache = null;
  const rossa = corniceNelFrame(render());
  assert.ok(rossa.length > 8, `cornice assente: ${rossa.length} celle`);
  assert.ok(rossa.every((c) => c === '255,45,45'), `colori diversi dal rosso: ${[...new Set(rossa)]}`);

  tui.guide = 'cyan';
  tui.cache = null;
  assert.ok(corniceNelFrame(render()).every((c) => c === '0,229,255'), 'il ciano non ha preso');
});

test('senza un rapporto scelto non c e niente da inquadrare', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 900, 900);
  const { tui, render } = await mountTui(DitherTui, { width: 110, height: 34, path, dir });
  tui.options = { ...tui.options, aspect: 'source' };
  tui.guide = 'red';
  tui.cache = null;
  assert.deepEqual(corniceNelFrame(render()), []);
});

/**
 * Col ritaglio l'anteprima torna a mostrare la foto intera, quindi resta
 * quadrata come la sorgente; con le bande e' gia' inquadrata e la cornice
 * segna la fotografia dentro le bande, senza spegnere niente.
 */
test('la cornice si disegna in tutti i modi di anteprima', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 900, 900);
  for (const mode of MODE_KEYS) {
    for (const fit of ['crop', 'pad']) {
      const { tui, render } = await mountTui(
        DitherTui, { width: 110, height: 34, path, dir, mode },
      );
      tui.options = { ...tui.options, aspect: '16:9', fit };
      tui.guide = 'yellow';
      tui.cache = null;
      const celle = corniceNelFrame(render());
      assert.ok(celle.length > 8, `${mode}/${fit}: solo ${celle.length} celle di cornice`);
      assert.ok(celle.every((c) => c === '255,226,0'), `${mode}/${fit}: colore sbagliato`);
    }
  }
});

/** Posizione in celle di ogni tratto di cornice trovato nel frame. */
function corniceCelle(frame) {
  const out = [];
  frame.forEach((riga, y) => {
    for (const m of riga.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m([┌┐└┘─│])/g)) {
      if (!COLORI_GUIDA.has(`${m[1]},${m[2]},${m[3]}`)) continue;
      const prima = riga.slice(0, m.index).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
      out.push({ x: [...prima].length, y });
    }
  });
  return out;
}

/**
 * Le proporzioni della cornice come appaiono a schermo, dove una cella e'
 * alta il doppio di quanto e' larga.
 */
function rapportoAVista(celle) {
  const xs = celle.map((c) => c.x);
  const ys = celle.map((c) => c.y);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  return w / (h * 2);
}

/**
 * La cornice va calcolata sull'immagine d'uscita e poi portata su quella
 * mostrata, che ha proporzioni diverse: cellTarget la deforma del `ratio`
 * della modalita'. Calcolandola sulla mostrata la cornice sembrava giusta
 * in mezzi blocchi, dove ratio e' 1, e cadeva fuori dal contenuto in
 * quadranti e in ASCII, dove ratio e' 2. Un test che si limitasse a
 * contare le celle di cornice non se ne accorgerebbe.
 */
test('la cornice sta sul contenuto in ogni modo, non solo dove ratio e 1', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'wide.png', 1600, 900);

  for (const mode of MODE_KEYS) {
    // Col ritaglio la cornice segna il rapporto chiesto; con le bande segna
    // la fotografia, che ha il rapporto della sorgente.
    for (const [fit, atteso] of [['crop', 1], ['pad', 1600 / 900]]) {
      const { tui, render } = await mountTui(
        DitherTui, { width: 120, height: 40, path, dir, mode },
      );
      tui.options = { ...tui.options, aspect: '1:1', fit };
      tui.guide = 'red';
      tui.cache = null;

      const celle = corniceCelle(render());
      assert.ok(celle.length > 8, `${mode}/${fit}: cornice assente`);
      const visto = rapportoAVista(celle);
      assert.ok(
        Math.abs(visto - atteso) / atteso < 0.25,
        `${mode}/${fit}: cornice a ${visto.toFixed(2)}, atteso ${atteso.toFixed(2)}`,
      );
    }
  }
});

/**
 * Dentro l'interfaccia non si vedeva da nessuna parte quale versione stesse
 * girando. Sta in fondo a destra, ma non deve mai essere lei a far tagliare
 * i tasti: su un terminale stretto sparisce invece di rubare spazio a "quit".
 */
test('la versione si vede in fondo, e su uno schermo stretto cede il posto', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 400, 300);

  const ultima = async (width) => {
    const { render } = await mountTui(DitherTui, { width, height: 26, path, dir });
    const frame = render();
    return senzaColori(frame[frame.length - 1]);
  };

  // Abbastanza larga da tenere tutte le voci e ancora la versione: quando
  // le due cose non ci stanno insieme e' la versione a cedere, ed e' quello
  // che verifica la seconda meta' del test.
  const larga = await ultima(150);
  assert.match(larga, /ditherbox \d+\.\d+\.\d+\s*$/, 'versione assente sullo schermo largo');
  assert.ok(larga.length <= 150);

  const stretta = await ultima(60);
  assert.ok(stretta.length <= 60, `riga lunga ${stretta.length} su 60`);
  assert.doesNotMatch(stretta, /ditherbox \d/, 'la versione non deve stare stretta a forza');
});

test('la versione mostrata e quella che il programma dichiara', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 400, 300);
  const { render } = await mountTui(DitherTui, { width: 150, height: 26, path, dir });
  const frame = render();
  const riga = senzaColori(frame[frame.length - 1]);
  assert.ok(riga.includes(`ditherbox ${VERSION}`), `riga: ${riga}`);
});

/** L'ingombro della cornice nel frame, in celle. */
function riquadro(frame) {
  const celle = corniceCelle(frame);
  const xs = celle.map((c) => c.x);
  const ys = celle.map((c) => c.y);
  return {
    n: celle.length,
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs) + 1,
    h: Math.max(...ys) - Math.min(...ys) + 1,
  };
}

/**
 * I tre comandi del ritaglio devono muovere il rettangolo che si vede, non
 * solo il file che si salva: e' il rettangolo che dice all'utente dove sta
 * tagliando, e se resta fermo i cursori sono ciechi.
 */
test('zoom e le due posizioni muovono la cornice sullo schermo', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 900, 900);
  const { tui, render } = await mountTui(
    DitherTui, { width: 120, height: 40, path, dir, mode: 'halfblock' },
  );
  const con = (opzioni) => {
    tui.options = { ...tui.options, aspect: '1:1', fit: 'crop', ...opzioni };
    tui.guide = 'red';
    tui.cache = null;
    return riquadro(render());
  };

  const pieno = con({ zoom: 100 });
  const meta = con({ zoom: 50 });
  assert.ok(meta.w < pieno.w && meta.h < pieno.h,
    `lo zoom non rimpicciolisce: ${meta.w}x${meta.h} contro ${pieno.w}x${pieno.h}`);

  // Rimpicciolita la selezione c'e' margine su tutti e due gli assi.
  const aSinistra = con({ zoom: 50, alignX: 0 });
  const aDestra = con({ zoom: 50, alignX: 100 });
  assert.ok(aDestra.x > aSinistra.x, `X non si muove: ${aSinistra.x} e ${aDestra.x}`);

  const inAlto = con({ zoom: 50, alignY: 0 });
  const inBasso = con({ zoom: 50, alignY: 100 });
  assert.ok(inBasso.y > inAlto.y, `Y non si muove: ${inAlto.y} e ${inBasso.y}`);
});

/**
 * Senza rapporto la cornice compariva solo se si sceglieva un rapporto.
 * Con lo zoom un ritaglio c'e' lo stesso, e va mostrato.
 */
test('la cornice compare anche col solo zoom, senza rapporto scelto', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 900, 600);
  const { tui, render } = await mountTui(DitherTui, { width: 110, height: 34, path, dir });

  tui.options = { ...tui.options, aspect: 'source', zoom: 100 };
  tui.guide = 'red';
  tui.cache = null;
  assert.deepEqual(corniceCelle(render()), [], 'a zoom pieno non c e niente da segnare');

  tui.options = { ...tui.options, zoom: 60 };
  tui.cache = null;
  assert.ok(corniceCelle(render()).length > 8, 'col solo zoom la cornice deve comparire');
});

/**
 * Con la cornice accesa l'anteprima mostra la foto intera, e non basta
 * togliere il ritaglio dalle opzioni: cosi' il tetto dei megapixel si
 * applica alla foto intera invece che alla selezione, e la selezione esce
 * piu' piccola di quanto sara' nel file. Stessi blocchi di dithering su meno
 * pixel di soggetto vuol dire trama piu' grossa, e l'anteprima promette un
 * effetto che il file non ha. Lo scarto misurato era di 1.47x.
 *
 * L'invariante e' che la selezione dentro l'anteprima misuri quanto il file.
 */
test('la trama dentro la cornice e alla stessa scala del file', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 1868, 1078);
  const { tui } = await mountTui(DitherTui, { width: 123, height: 60, path, dir });

  const casi = [
    { aspect: '4:5', zoom: 100, alignX: 50, alignY: 50, megapixels: 0.2, scale: 2 },
    { aspect: '16:9', zoom: 60, alignX: 20, alignY: 80, megapixels: 0.5, scale: 1 },
    { aspect: '1:1', zoom: 35, alignX: 0, alignY: 100, megapixels: 0.1, scale: 4 },
    { aspect: 'source', zoom: 50, alignX: 50, alignY: 50, megapixels: 0.3, scale: 2 },
  ];

  for (const caso of casi) {
    tui.options = { ...tui.options, fit: 'crop', upscale: true, ...caso };
    tui.guide = 'red';
    tui.cache = null;
    tui.exportCache = null;

    const { sorgente, opzioni } = tui._previewJob();
    const { image } = processImage(sorgente, opzioni);
    const dentro = selectionFrame(image.width, image.height, {
      ratio: aspectRatio(caso.aspect),
      zoom: caso.zoom,
      alignX: caso.alignX,
      alignY: caso.alignY,
    });
    const file = exportSize(1868, 1078, tui.options);

    // Un paio di pixel di tolleranza: le misure sono intere e i fattori no.
    const scarto = Math.max(
      Math.abs(dentro.width - file.width), Math.abs(dentro.height - file.height),
    );
    assert.ok(
      scarto <= 2,
      `${JSON.stringify(caso)}: selezione ${dentro.width}x${dentro.height}, `
      + `file ${file.width}x${file.height}`,
    );
  }
});

/**
 * L'anteprima adattata rimpicciolisce il file, e la media dei pixel richiude
 * i punti del dithering in grigi: e' quello che si vede aprendo il file e
 * rimpicciolendolo, non quello che si vede guardandolo da vicino. A 1:1 non
 * si ricampiona, quindi in bianco e nero devono arrivare solo nero e bianco.
 */
test('a 1:1 non si media: la trama arriva intatta', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 1200, 900);
  const { tui, render } = await mountTui(
    DitherTui, { width: 100, height: 34, path, dir, mode: 'halfblock' },
  );
  tui.options = {
    ...tui.options, palette: 'bw', algorithm: 'bayer8', scale: 1, megapixels: 0.5,
  };
  tui.guide = 'off';

  tui.oneToOne = false;
  tui.cache = null;
  const adattata = grigiIntermedi(render());

  tui.oneToOne = true;
  tui.cache = null;
  const uno = grigiIntermedi(render());

  assert.ok(
    uno < adattata - 8,
    `a 1:1 i grigi dovrebbero quasi sparire: ${uno} contro ${adattata}`,
  );
});

test('il tasto 1 accende e spegne l anteprima a risoluzione vera', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 800, 600);
  const { tui, render } = await mountTui(DitherTui, { width: 100, height: 30, path, dir });
  assert.equal(tui.oneToOne, false);

  press(tui, '1');
  assert.equal(tui.oneToOne, true);
  assert.match(testo(render()), /1:1/);

  press(tui, '1');
  assert.equal(tui.oneToOne, false);
});

/** A 1:1 si vede gia' il file: non c'e' nessun fuori da segnare. */
test('a 1:1 la cornice non si disegna', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 900, 900);
  const { tui, render } = await mountTui(DitherTui, { width: 110, height: 34, path, dir });
  tui.options = { ...tui.options, aspect: '16:9', fit: 'crop' };
  tui.guide = 'red';

  tui.cache = null;
  assert.ok(corniceCelle(render()).length > 8, 'adattata: la cornice ci deve essere');

  tui.oneToOne = true;
  tui.cache = null;
  assert.deepEqual(corniceCelle(render()), []);
});

test('il fuoco arriva sull anteprima solo quando c e la 1:1', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 800, 600);
  const { tui } = await mountTui(DitherTui, { width: 100, height: 30, path, dir });

  assert.equal(tui.focus, 'controls');
  press(tui, '\t');
  assert.equal(tui.focus, 'controls', 'senza 1:1 non c e dove andare');

  press(tui, '1');
  press(tui, '\t');
  assert.equal(tui.focus, 'preview');
  press(tui, '\t');
  assert.equal(tui.focus, 'controls', 'il giro deve chiudersi');

  // Spegnendo la 1:1 mentre ci si sta sopra, il fuoco non deve restare
  // su un pannello che non fa piu' niente.
  press(tui, '\t');
  assert.equal(tui.focus, 'preview');
  press(tui, '1');
  assert.equal(tui.focus, 'controls');
});

test('col fuoco sull anteprima i tasti spostano la finestra', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 1200, 900);
  const { tui, render } = await mountTui(
    DitherTui, { width: 90, height: 26, path, dir, mode: 'ascii' },
  );
  tui.options = { ...tui.options, palette: 'bw', algorithm: 'atkinson', megapixels: 0.5 };
  press(tui, '1');
  press(tui, '\t');
  assert.equal(tui.focus, 'preview');

  const disegno = () => testo(render());
  const centro = disegno();
  assert.equal(tui.panX, 50);

  press(tui, 'h');
  assert.equal(tui.panX, 45, 'h deve spostare a sinistra, non regolare un parametro');
  press(tui, 'j');
  assert.equal(tui.panY, 55);

  press(tui, 'g');
  assert.deepEqual([tui.panX, tui.panY], [0, 0], 'home porta a un angolo');
  const angolo = disegno();
  assert.notEqual(angolo, centro, 'spostando, il disegno deve cambiare');

  press(tui, 'G');
  assert.deepEqual([tui.panX, tui.panY], [100, 100]);
  assert.notEqual(disegno(), angolo);

  // Lo spostamento non deve toccare i parametri.
  assert.equal(tui.options.megapixels, 0.5);
});

/**
 * Tagliare la riga da destra si portava via per prime le due voci che
 * servono di piu' a chi e' in difficolta': i tasti e l'uscita.
 */
test('la barra lascia cadere le voci dal fondo, mai tasti e uscita', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 400, 300);
  for (const width of [130, 110, 90, 70, 50, 40]) {
    const { render } = await mountTui(DitherTui, { width, height: 26, path, dir });
    const frame = render();
    const riga = senzaColori(frame[frame.length - 1]);
    assert.ok(riga.length <= width, `${width}: riga lunga ${riga.length}`);
    assert.match(riga, /\? keys/, `${width}: sono spariti i tasti`);
    assert.match(riga, /q quit/, `${width}: e sparita l uscita`);
  }
});

test('la barra dice come si cambia lingua, quando c e spazio', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 400, 300);
  const { render } = await mountTui(DitherTui, { width: 130, height: 26, path, dir });
  const frame = render();
  assert.match(senzaColori(frame[frame.length - 1]), /ctrl\+l lang/);
});

/** Porta il cursore sul parametro con quella chiave. */
function vaiA(tui, key) {
  const i = tui.rows.findIndex((r) => r.kind === 'param' && r.param.key === key);
  assert.ok(i >= 0, `parametro ${key} non presente fra i controlli`);
  tui.cursor = i;
  return tui.rows[i].param;
}

/**
 * Larghezza e altezza sono due campi, ma non due valori indipendenti: col
 * rapporto bloccato scriverne uno riempie l'altro. Senza, i due finiscono
 * per litigare e il file esce di una misura che non e' nessuna delle due.
 */
test('col rapporto bloccato scrivere un lato riempie l altro anche nella TUI', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 1868, 1078);
  const { tui, render } = await mountTui(DitherTui, { width: 110, height: 40, path, dir });

  tui.options = { ...tui.options, aspect: '16:9', lockRatio: true, width: 0, height: 0 };
  tui.cache = null;

  vaiA(tui, 'width');
  press(tui, 'l');
  assert.ok(tui.options.width > 0, 'da auto il primo passo deve posarsi su una misura');
  assert.ok(tui.options.height > 0, 'l altro lato deve essersi riempito');
  assert.ok(
    Math.abs(tui.options.width / tui.options.height - 16 / 9) < 0.02,
    `il rapporto non e 16:9: ${tui.options.width}x${tui.options.height}`,
  );

  // E la misura dichiarata nell'intestazione deve essere quella chiesta.
  const attesa = `${tui.options.width}×${tui.options.height}`;
  assert.match(testo(render()), new RegExp(attesa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // Sbloccando, i due tornano indipendenti.
  tui.options = { ...tui.options, lockRatio: false };
  const altezzaPrima = tui.options.height;
  vaiA(tui, 'width');
  press(tui, 'l');
  assert.equal(tui.options.height, altezzaPrima, 'sbloccato non deve trascinare l altro lato');
});

test('scrivere una misura a mano la ottiene esatta', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 1868, 1078);
  const { tui, render } = await mountTui(DitherTui, { width: 110, height: 40, path, dir });
  tui.options = { ...tui.options, aspect: '16:9', lockRatio: true, scale: 1 };
  tui.cache = null;

  vaiA(tui, 'width');
  press(tui, '\r');
  assert.ok(tui.overlay, 'enter deve aprire il campo per scrivere');
  for (const c of '1920') press(tui, c);
  press(tui, '\r');

  assert.equal(tui.options.width, 1920);
  assert.equal(tui.options.height, 1080, 'l altro lato deve seguire il rapporto');
  assert.match(testo(render()), /1920×1080/, 'l intestazione deve dichiarare la misura chiesta');
});

test('svuotare il campo riporta la misura ad auto', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'foto.png', 800, 600);
  const { tui } = await mountTui(DitherTui, { width: 110, height: 40, path, dir });
  tui.options = { ...tui.options, width: 1920, height: 1440 };

  vaiA(tui, 'width');
  press(tui, '\r');
  // Il campo parte col valore attuale: si cancella tutto e si conferma.
  for (let i = 0; i < 6; i++) press(tui, '\x7f');
  press(tui, '\r');
  assert.equal(tui.options.width, 0, 'vuoto deve voler dire auto');
});
