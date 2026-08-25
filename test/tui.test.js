import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { DitherTui } from '../src/cli/tui.js';
import { parseKey, visibleLength } from '../src/cli/term.js';
import { loadThemes } from '../src/cli/theme.js';
import { MODE_KEYS, GUIDES } from '../src/cli/preview.js';
import { loadImage } from '../src/cli/imageio.js';
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
