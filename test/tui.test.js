import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { DitherTui } from '../src/cli/tui.js';
import { parseKey, visibleLength } from '../src/cli/term.js';
import { loadThemes } from '../src/cli/theme.js';
import { MODE_KEYS } from '../src/cli/preview.js';
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
  assert.match(testo(render()), /troppo piccola/);
});

test('senza immagine mostra un invito invece di rompersi', async () => {
  const { render } = await mountTui(DitherTui, { width: 90, height: 30 });
  const t = testo(render());
  assert.match(t, /nessuna immagine/);
  assert.match(t, /DITHERBOX/);
});

test('l intestazione riporta nome, misure e catena di elaborazione', async (t) => {
  const dir = tempDir(t);
  const path = await writeSample(dir, 'ritratto.png', 640, 480);
  const { render } = await mountTui(DitherTui, { width: 100, height: 32, path, dir });
  const t2 = testo(render());
  assert.match(t2, /ritratto\.png/);
  assert.match(t2, /640×480/);
  assert.match(t2, /1-BIT B\/N/);
  assert.match(t2, /anteprima \d+×\d+ · export \d+×\d+/);
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
  assert.match(testo(render()), /TEMA/);
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
  assert.match(testo(render()), /TASTI/);
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
  assert.match(testo(render()), /SALVA/);
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
  assert.match(tui.toast.text, /png o \.jpg/);
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
