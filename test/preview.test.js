import test from 'node:test';
import assert from 'node:assert/strict';

import { MODES, MODE_KEYS, cellTarget, fitToCells, renderImage } from '../src/cli/preview.js';
import { visibleLength } from '../src/cli/term.js';
import { paletteInfo, ditherImage, resampleBox } from '../src/core/index.js';
import { sampleImage } from './helpers.js';

const senzaColori = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

test('cellTarget sta dentro le celle disponibili e conserva le proporzioni', () => {
  for (const mode of MODE_KEYS) {
    const m = MODES[mode];
    for (const [sw, sh] of [[900, 1200], [1600, 900], [500, 500], [3, 4000]]) {
      for (const [cols, rows] of [[40, 12], [100, 30], [8, 4]]) {
        const t = cellTarget(sw, sh, cols, rows, mode);
        assert.ok(t.width <= cols * m.cx, `${mode}: troppo largo`);
        assert.ok(t.height <= rows * m.cy, `${mode}: troppo alto`);
        assert.ok(t.width >= 1 && t.height >= 1);

        // Le proporzioni a schermo, tenendo conto che una cella e' alta il doppio.
        const attese = sw / sh;
        const rese = (t.width / m.cx) / ((t.height / m.cy) * 2);
        // Con pochissime celle l'arrotondamento pesa, quindi la soglia e' larga.
        const minimo = Math.min(t.width, t.height);
        if (minimo > 8) {
          assert.ok(
            Math.abs(rese - attese) / attese < 0.25,
            `${mode} ${sw}x${sh} in ${cols}x${rows}: proporzioni ${rese.toFixed(2)} invece di ${attese.toFixed(2)}`,
          );
        }
      }
    }
  }
});

test('ogni modo produce righe della misura attesa', () => {
  const { colors, ramp } = paletteInfo('bw');
  for (const mode of MODE_KEYS) {
    const m = MODES[mode];
    const cols = 30;
    const rows = 10;
    const target = cellTarget(200, 150, cols, rows, mode);
    const src = resampleBox(sampleImage(200, 150), target.width, target.height);
    const lines = renderImage(ditherImage(src, { algorithm: 'bayer4', colors, ramp }), mode, null);

    assert.equal(lines.length, Math.ceil(target.height / m.cy), `${mode}: numero di righe`);
    for (const line of lines) {
      assert.equal(visibleLength(line), Math.ceil(target.width / m.cx), `${mode}: larghezza riga`);
    }
  }
});

test('il braille conserva la trama a un bit invece di impastarla', () => {
  const { colors, ramp } = paletteInfo('bw');
  const target = cellTarget(200, 200, 30, 15, 'braille');
  const src = resampleBox(sampleImage(200, 200), target.width, target.height);
  const lines = renderImage(ditherImage(src, { algorithm: 'atkinson', colors, ramp }), 'braille', null);

  const punti = new Set();
  for (const line of lines) {
    for (const ch of senzaColori(line)) {
      if (ch.codePointAt(0) >= 0x2800 && ch.codePointAt(0) <= 0x28ff) punti.add(ch);
    }
  }
  // Se il dithering venisse ricampionato via, resterebbero solo pieni e vuoti.
  assert.ok(punti.size > 12, `solo ${punti.size} caratteri braille distinti: la trama si e persa`);
});

test('il modo ascii usa la rampa di densita e non i colori di sfondo', () => {
  const { colors, ramp } = paletteInfo('gray8');
  const target = cellTarget(120, 60, 40, 12, 'ascii');
  const src = resampleBox(sampleImage(120, 60), target.width, target.height);
  const lines = renderImage(ditherImage(src, { algorithm: 'bayer4', colors, ramp }), 'ascii', null);
  const testo = lines.map(senzaColori).join('');
  assert.ok(new Set(testo).size > 3, 'la rampa ascii deve usare piu di tre caratteri');
  assert.ok(!lines.join('').includes('\x1b[48;'), 'ascii non deve colorare lo sfondo');
});

test('fitToCells ricampiona davvero alla misura di cellTarget', () => {
  const img = sampleImage(300, 200);
  for (const mode of MODE_KEYS) {
    const t = cellTarget(300, 200, 50, 20, mode);
    const f = fitToCells(img, 50, 20, mode);
    assert.deepEqual([f.width, f.height], [t.width, t.height], mode);
  }
});

test('immagini degeneri non fanno esplodere il rendering', () => {
  const { colors, ramp } = paletteInfo('bw');
  for (const [w, h] of [[1, 1], [1, 50], [50, 1]]) {
    for (const mode of MODE_KEYS) {
      const t = cellTarget(w, h, 20, 8, mode);
      const src = resampleBox(sampleImage(Math.max(w, 2), Math.max(h, 2)), t.width, t.height);
      const lines = renderImage(ditherImage(src, { algorithm: 'bayer4', colors, ramp }), mode, null);
      assert.ok(lines.length >= 1, `${mode} ${w}x${h}`);
    }
  }
});
