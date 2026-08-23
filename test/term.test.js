import test from 'node:test';
import assert from 'node:assert/strict';

import {
  panel, pad, padStart, center, truncate, visibleLength, bar,
  parseKey, fg, bg, Screen, joinHorizontal, BLOCKS_V,
} from '../src/cli/term.js';

const VERDE = fg([0, 255, 0]);

test('visibleLength ignora le sequenze di colore', () => {
  assert.equal(visibleLength('ciao'), 4);
  assert.equal(visibleLength(`${VERDE}ciao\x1b[0m`), 4);
  assert.equal(visibleLength(`${bg([1, 2, 3])}${VERDE}\x1b[7mabc\x1b[0m`), 3);
  assert.equal(visibleLength(''), 0);
});

test('pad, padStart e center portano alla larghezza esatta', () => {
  for (const s of ['ciao', `${VERDE}ciao\x1b[0m`, '', 'testo molto piu lungo del previsto']) {
    for (const w of [1, 4, 10, 40]) {
      assert.equal(visibleLength(pad(s, w)), w, `pad ${JSON.stringify(s)} a ${w}`);
      assert.equal(visibleLength(padStart(s, w)), w);
      assert.equal(visibleLength(center(s, w)), w);
    }
  }
});

test('truncate taglia i caratteri ma non spezza le sequenze', () => {
  const s = `${VERDE}abcdef\x1b[0m`;
  assert.equal(visibleLength(truncate(s, 3)), 3);
  assert.ok(truncate(s, 3).startsWith(VERDE), 'il colore deve sopravvivere al taglio');
  assert.equal(truncate('abc', 10), 'abc');
});

test('i pannelli hanno tutte le righe della larghezza e altezza chieste', () => {
  for (const [w, h] of [[20, 4], [40, 10], [12, 3], [100, 30]]) {
    for (const title of ['', 'TITOLO', 'UN TITOLO PARECCHIO LUNGO']) {
      const p = panel({ title, lines: ['a', `${VERDE}b\x1b[0m`], width: w, height: h, color: VERDE });
      assert.equal(p.length, h, `altezza con ${w}x${h}`);
      for (const [i, line] of p.entries()) {
        assert.equal(visibleLength(line), w, `riga ${i} di ${w}x${h} titolo "${title}"`);
      }
    }
  }
});

test('il pannello non si scompone se il contenuto e piu lungo dello spazio', () => {
  const p = panel({
    title: 'X', lines: Array.from({ length: 50 }, (_, i) => `riga ${i}`),
    width: 20, height: 5, color: '',
  });
  assert.equal(p.length, 5);
  assert.ok(p.every((l) => visibleLength(l) === 20));
});

test('joinHorizontal affianca rispettando le larghezze', () => {
  const out = joinHorizontal([['aa', 'bb'], ['cccc']], [4, 6], 1);
  assert.equal(out.length, 2);
  assert.ok(out.every((l) => visibleLength(l) === 11));
});

test('bar riempie la frazione giusta e resta della larghezza chiesta', () => {
  assert.equal(bar(0, 10), '░'.repeat(10));
  assert.equal(bar(1, 10), '█'.repeat(10));
  assert.equal([...bar(0.5, 10)].filter((c) => c === '█').length, 5);
  // Fuori scala non deve sfondare la larghezza.
  for (const r of [-3, 0.33, 2.5, NaN]) assert.equal([...bar(r, 8)].length, 8, `ratio ${r}`);
});

test('BLOCKS_V copre i nove livelli', () => {
  assert.equal(BLOCKS_V.length, 9);
  assert.equal(BLOCKS_V[0], ' ');
  assert.equal(BLOCKS_V[8], '█');
});

test('parseKey riconosce tasti semplici, controlli e sequenze', () => {
  const k = (s) => parseKey(Buffer.from(s, 'binary'));
  assert.equal(k('a').name, 'a');
  assert.equal(k('A').shift, true);
  assert.equal(k(' ').name, 'space');
  assert.equal(k('\r').name, 'enter');
  assert.equal(k('\t').name, 'tab');
  assert.equal(k('\x7f').name, 'backspace');
  assert.equal(k('\x1b').name, 'escape');

  assert.deepEqual([k('\x03').name, k('\x03').ctrl], ['c', true]);
  assert.deepEqual([k('\x13').name, k('\x13').ctrl], ['s', true]);
  assert.deepEqual([k('\x18').name, k('\x18').ctrl], ['x', true]);

  for (const [seq, name] of [
    ['\x1b[A', 'up'], ['\x1b[B', 'down'], ['\x1b[C', 'right'], ['\x1b[D', 'left'],
    ['\x1bOA', 'up'], ['\x1b[5~', 'pageup'], ['\x1b[6~', 'pagedown'],
    ['\x1b[H', 'home'], ['\x1b[F', 'end'], ['\x1b[3~', 'delete'], ['\x1b[Z', 'shifttab'],
  ]) assert.equal(k(seq).name, name, `sequenza ${JSON.stringify(seq)}`);

  const shiftRight = k('\x1b[1;2C');
  assert.equal(shiftRight.name, 'right');
  assert.equal(shiftRight.shift, true);
});

test('Screen riscrive solo le righe cambiate', () => {
  const scritture = [];
  const finto = { columns: 20, rows: 3, write: (s) => scritture.push(s) };
  const screen = new Screen(finto);
  screen.enter();
  scritture.length = 0;

  screen.draw(['uno', 'due', 'tre']);
  assert.ok(scritture.join('').includes('uno'));

  scritture.length = 0;
  screen.draw(['uno', 'due', 'tre']);
  assert.equal(scritture.length, 0, 'un frame identico non deve produrre scritture');

  screen.draw(['uno', 'DUE', 'tre']);
  const out = scritture.join('');
  assert.ok(out.includes('DUE'));
  assert.ok(!out.includes('uno'), 'le righe invariate non vanno riscritte');
  screen.leave();
});
