/**
 * Guardie sulle traduzioni.
 *
 * Non verificano che l'italiano sia bell'italiano: verificano che le
 * chiavi ci siano tutte, che i segnaposto combacino e che le etichette
 * stiano nelle colonne strette del terminale. Sono le tre cose che si
 * rompono in silenzio quando si aggiunge una stringa.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, DICTIONARIES,
  allKeys, hasKey, normalizeLocale, detectLocale, createTranslator,
  PARAMS, PALETTE_KEYS, ALGORITHMS, PRESETS,
  paramLabel, paletteLabel, algorithmLabel, presetLabel, groupLabel,
} from '../src/core/index.js';

import { MODE_KEYS, modeLabel, GUIDE_KEYS, guideLabel } from '../src/cli/preview.js';

/** I nomi fra graffe dentro una stringa: {name}, {size}, {msg}. */
const segnaposti = (s) => new Set((s.match(/\{(\w+)\}/g) || []).sort());

test('ogni lingua conosce solo chiavi che esistono in inglese', () => {
  const riferimento = new Set(allKeys());
  for (const lingua of LOCALES) {
    if (lingua === DEFAULT_LOCALE) continue;
    for (const chiave of Object.keys(DICTIONARIES[lingua])) {
      assert.ok(riferimento.has(chiave), `${lingua}: "${chiave}" non esiste in inglese`);
    }
  }
});

test('le traduzioni usano gli stessi segnaposto dell inglese', () => {
  const en = DICTIONARIES[DEFAULT_LOCALE];
  for (const lingua of LOCALES) {
    if (lingua === DEFAULT_LOCALE) continue;
    for (const [chiave, testo] of Object.entries(DICTIONARIES[lingua])) {
      assert.deepEqual(
        [...segnaposti(testo)], [...segnaposti(en[chiave])],
        `${lingua}/${chiave}: segnaposto diversi dall inglese`,
      );
    }
  }
});

test('tutto quello che l interfaccia mostra ha una chiave', () => {
  const mancanti = [];
  const controlla = (chiave) => { if (!hasKey(chiave)) mancanti.push(chiave); };

  for (const p of PARAMS) {
    controlla(`param.${p.key}.label`);
    controlla(`group.${p.group}`);
    if (p.type === 'enum' && p.key !== 'palette' && p.key !== 'algorithm') {
      for (const v of p.values) controlla(`param.${p.key}.value.${v}`);
    }
  }
  for (const k of PALETTE_KEYS) controlla(`palette.${k}`);
  for (const a of ALGORITHMS) controlla(`algorithm.${a}`);
  for (const k of Object.keys(PRESETS)) controlla(`preset.${k}`);
  for (const m of MODE_KEYS) controlla(`mode.${m}`);
  for (const g of GUIDE_KEYS) controlla(`guide.${g}`);

  assert.deepEqual(mancanti, [], `chiavi mancanti: ${mancanti.join(', ')}`);
});

test('nessuna lingua sfonda le colonne strette del terminale', () => {
  // La colonna delle etichette nella TUI e larga 13 caratteri, e il
  // marcatore ne mangia due: oltre gli 11 il valore a destra si sposta e
  // la tabella si sfalsa. Meglio scoprirlo qui che a schermo.
  const LARGHEZZA = 12;
  for (const lingua of LOCALES) {
    const t = createTranslator(lingua);
    for (const p of PARAMS) {
      const etichetta = paramLabel(p, t);
      assert.ok(
        etichetta.length <= LARGHEZZA,
        `${lingua}/${p.key}: "${etichetta}" e lunga ${etichetta.length}, il massimo e ${LARGHEZZA}`,
      );
    }
    for (const g of new Set(PARAMS.map((p) => p.group))) {
      const testo = groupLabel(g, t);
      assert.ok(testo.length <= 20, `${lingua}/gruppo ${g}: "${testo}" troppo lunga`);
    }
  }
});

test('ogni lingua traduce davvero palette, algoritmi, preset e modi', () => {
  for (const lingua of LOCALES) {
    const t = createTranslator(lingua);
    // Una chiave che manca torna indietro com e: e il segnale che cerchiamo.
    for (const k of PALETTE_KEYS) {
      assert.ok(!paletteLabel(k, t).startsWith('palette.'), `${lingua}: palette ${k}`);
    }
    for (const a of ALGORITHMS) {
      assert.ok(!algorithmLabel(a, t).startsWith('algorithm.'), `${lingua}: algoritmo ${a}`);
    }
    for (const k of Object.keys(PRESETS)) {
      assert.ok(!presetLabel(k, t).startsWith('preset.'), `${lingua}: preset ${k}`);
    }
    for (const m of MODE_KEYS) {
      assert.ok(!modeLabel(m, t).startsWith('mode.'), `${lingua}: modo ${m}`);
    }
    for (const g of GUIDE_KEYS) {
      assert.ok(!guideLabel(g, t).startsWith('guide.'), `${lingua}: cornice ${g}`);
    }
  }
});

test('ogni lingua ha un nome da mostrare nel selettore', () => {
  for (const lingua of LOCALES) {
    assert.ok(LOCALE_NAMES[lingua], `manca il nome di ${lingua}`);
  }
  assert.equal(Object.keys(LOCALE_NAMES).length, LOCALES.length);
});

test('una lingua sconosciuta ricade sull inglese, una nota viene riconosciuta', () => {
  assert.equal(normalizeLocale('pt'), 'en');
  assert.equal(normalizeLocale(undefined), 'en');
  assert.equal(normalizeLocale('IT'), 'it');
  assert.equal(normalizeLocale('de-AT'), 'de');
  assert.equal(normalizeLocale('fr_FR'), 'fr');

  assert.equal(detectLocale(['pt-BR', 'es-AR', 'it']), 'es');
  assert.equal(detectLocale(['ja', 'ko']), 'en');
  assert.equal(detectLocale([]), 'en');
});

test('una chiave che non esiste torna indietro invece di sparire', () => {
  const t = createTranslator('it');
  assert.equal(t('non.esiste.proprio'), 'non.esiste.proprio');
  assert.equal(t('tui.jobRead', { name: 'x.png' }), 'Leggo x.png');
  // Un segnaposto senza valore resta scritto: si vede che manca.
  assert.equal(t('tui.jobRead'), 'Leggo {name}');
  assert.equal(t.locale, 'it');
});

test('una chiave presente solo in inglese ricade sull inglese, non sulla chiave', () => {
  // Le lingue diverse dall inglese portano solo quello che cambia.
  const soloInglese = allKeys().filter((k) => DICTIONARIES.de[k] === undefined);
  assert.ok(soloInglese.length > 0, 'il tedesco non puo tradurre proprio tutto');
  const t = createTranslator('de');
  for (const k of soloInglese) {
    assert.equal(t(k), DICTIONARIES.en[k], `${k}: il ripiego sull inglese non funziona`);
  }
});
