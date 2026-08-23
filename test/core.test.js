import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PALETTE_KEYS, paletteInfo, resolvePalette, rgbToHex,
  ALGORITHMS, buildQuantizer, ditherImage,
  createImage, applyAdjustments, downscaleByFactor, upscaleByFactor,
  resampleBox, fitWithin, lumaHistogram, luma,
  PARAMS, PRESETS, DEFAULTS, normalizeOptions, formatValue, applyPreset,
  paramSteps, stepIndex, stepBy, processImage, targetSize,
  isCustomPalette, parseCustomPalette, stringifyPalette,
} from '../src/core/index.js';

/** Sfumatura orizzontale in scala di grigi. */
function gradient(w = 256, h = 32) {
  const img = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = Math.round((x / (w - 1)) * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

const colorsOf = (img) => {
  const set = new Set();
  for (let i = 0; i < img.data.length; i += 4) {
    set.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
  }
  return set;
};

test('ogni palette ha almeno due colori e componenti valide', () => {
  for (const key of PALETTE_KEYS) {
    const { colors } = paletteInfo(key);
    assert.ok(colors.length >= 2, `${key} ha meno di due colori`);
    for (const c of colors) {
      assert.equal(c.length, 3);
      for (const ch of c) assert.ok(Number.isInteger(ch) && ch >= 0 && ch <= 255);
    }
  }
});

test('resolvePalette accetta esadecimali e terne custom', () => {
  assert.deepEqual(resolvePalette(['#000000', '#ff8800']), [[0, 0, 0], [255, 136, 0]]);
  assert.deepEqual(resolvePalette([[1, 2, 3], [4, 5, 6]]), [[1, 2, 3], [4, 5, 6]]);
  assert.equal(rgbToHex([255, 136, 0]), '#ff8800');
  assert.throws(() => resolvePalette('non-esiste'), /Palette sconosciuta/);
});

test('il dithering usa solo i colori della palette', () => {
  const img = gradient();
  for (const key of ['bw', 'gray4', 'gameboy', 'pico8', 'cgaCyan']) {
    const { colors, ramp } = paletteInfo(key);
    const allowed = new Set(colors.map((c) => c.join(',')));
    for (const algorithm of ALGORITHMS) {
      const out = ditherImage(img, { algorithm, colors, ramp });
      for (const c of colorsOf(out)) {
        assert.ok(allowed.has(c), `${key}/${algorithm} ha prodotto il colore ${c}`);
      }
    }
  }
});

test('il dithering conserva misure e canale alfa', () => {
  const img = gradient(64, 20);
  img.data[3] = 128;
  const { colors, ramp } = paletteInfo('bw');
  const out = ditherImage(img, { algorithm: 'atkinson', colors, ramp });
  assert.equal(out.width, 64);
  assert.equal(out.height, 20);
  assert.equal(out.data[3], 128, 'il canale alfa va lasciato stare');
});

test('la diffusione dell errore conserva la luminanza media a blocchi', () => {
  const img = gradient();
  const { colors, ramp } = paletteInfo('bw');
  // Atkinson e' escluso di proposito: scarta un quarto dell'errore, ed e'
  // proprio quello che gli da' il contrasto tipico.
  for (const algorithm of ['floydSteinberg', 'stucki', 'burkes', 'sierra', 'jarvis']) {
    const out = ditherImage(img, { algorithm, colors, ramp });
    let error = 0;
    let blocks = 0;
    for (let by = 0; by < img.height; by += 8) {
      for (let bx = 0; bx < img.width; bx += 8) {
        let a = 0;
        let b = 0;
        for (let y = by; y < by + 8; y++) {
          for (let x = bx; x < bx + 8; x++) {
            const i = (y * img.width + x) * 4;
            a += out.data[i];
            b += img.data[i];
          }
        }
        error += Math.abs(a - b) / 64;
        blocks++;
      }
    }
    assert.ok(error / blocks < 8, `${algorithm}: errore medio ${(error / blocks).toFixed(2)} troppo alto`);
  }
});

test('le matrici ordinate sono deterministiche, il rumore no', () => {
  const img = gradient(64, 8);
  const { colors, ramp } = paletteInfo('bw');
  const a = ditherImage(img, { algorithm: 'bayer8', colors, ramp });
  const b = ditherImage(img, { algorithm: 'bayer8', colors, ramp });
  assert.deepEqual([...a.data], [...b.data]);

  const r1 = ditherImage(img, { algorithm: 'random', colors, ramp });
  const r2 = ditherImage(img, { algorithm: 'random', colors, ramp });
  assert.notDeepEqual([...r1.data], [...r2.data]);
});

test('intensita zero equivale alla soglia secca', () => {
  const img = gradient(64, 8);
  const { colors, ramp } = paletteInfo('bw');
  const soglia = ditherImage(img, { algorithm: 'none', colors, ramp, strength: 0 });
  const bayer = ditherImage(img, { algorithm: 'bayer8', colors, ramp, strength: 0 });
  assert.deepEqual([...bayer.data], [...soglia.data]);
});

test('la soglia sposta il risultato nella direzione giusta', () => {
  const img = gradient();
  const { colors, ramp } = paletteInfo('bw');
  const media = (o) => {
    let s = 0;
    for (let i = 0; i < o.data.length; i += 4) s += o.data[i];
    return s / (o.data.length / 4);
  };
  const scuro = media(ditherImage(img, { algorithm: 'bayer8', colors, ramp, bias: -60 }));
  const neutro = media(ditherImage(img, { algorithm: 'bayer8', colors, ramp, bias: 0 }));
  const chiaro = media(ditherImage(img, { algorithm: 'bayer8', colors, ramp, bias: 60 }));
  assert.ok(scuro < neutro && neutro < chiaro, `${scuro} < ${neutro} < ${chiaro}`);
});

test('le palette a rampa mappano sulla luminanza, non sul rosso piu vicino', () => {
  // Un rosso saturo ha luminanza bassa: su Game Boy deve finire su un verde
  // scuro. Cercando il colore RGB piu' vicino finirebbe invece su uno chiaro.
  const img = createImage(2, 2);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 255; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 255;
  }
  const { colors, ramp } = paletteInfo('gameboy');
  assert.equal(ramp, true);
  const out = ditherImage(img, { algorithm: 'none', colors, ramp });
  const scelto = [out.data[0], out.data[1], out.data[2]];
  const lumas = colors.map((c) => luma(...c)).sort((a, b) => a - b);
  assert.ok(luma(...scelto) <= lumas[1], `ha scelto ${scelto}, troppo chiaro per un rosso`);
});

test('il quantizzatore calcola una spaziatura sensata', () => {
  // Tolleranza: i coefficienti Rec. 709 non sommano a 1 esatto in binario,
  // quindi la luminanza del bianco vale 254.99999... e non 255.
  const vicino = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
  vicino(buildQuantizer(paletteInfo('bw').colors, true).spread, 255);
  vicino(buildQuantizer(paletteInfo('gray4').colors, true).spread, 85);
  assert.ok(buildQuantizer(paletteInfo('pico8').colors, false).spread > 0);
  assert.throws(() => buildQuantizer([[0, 0, 0]], true), /almeno due colori/);
});

test('le regolazioni tonali si comportano come promesso', () => {
  const grigio = () => {
    const img = createImage(4, 4);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 100;
      img.data[i + 3] = 255;
    }
    return img;
  };
  assert.ok(applyAdjustments(grigio(), { brightness: 40 }).data[0] > 100);
  assert.ok(applyAdjustments(grigio(), { brightness: -40 }).data[0] < 100);
  assert.equal(applyAdjustments(grigio(), { invert: true }).data[0], 155);
  assert.ok(applyAdjustments(grigio(), { gamma: 2 }).data[0] > 100);

  const colorato = createImage(1, 1);
  colorato.data.set([200, 50, 50, 255]);
  applyAdjustments(colorato, { saturation: -100 });
  assert.equal(colorato.data[0], colorato.data[1]);
  assert.equal(colorato.data[1], colorato.data[2]);
});

test('riduzione e ringrandimento fanno i conti giusti', () => {
  const img = gradient(64, 32);
  assert.deepEqual(
    [downscaleByFactor(img, 4).width, downscaleByFactor(img, 4).height], [16, 8],
  );
  const su = upscaleByFactor(downscaleByFactor(img, 4), 4);
  assert.deepEqual([su.width, su.height], [64, 32]);
  assert.equal(downscaleByFactor(img, 1).width, 64);
  assert.equal(fitWithin(img, 16, 16).width, 16);
  assert.equal(fitWithin(img, 999, 999).width, 64, 'fitWithin non deve ingrandire');
  assert.deepEqual([resampleBox(img, 7, 3).width, resampleBox(img, 7, 3).height], [7, 3]);
});

test('il ringrandimento a blocchi non inventa colori nuovi', () => {
  const img = gradient(32, 16);
  const { colors, ramp } = paletteInfo('bw');
  const piccola = ditherImage(downscaleByFactor(img, 4), { algorithm: 'bayer4', colors, ramp });
  assert.deepEqual([...colorsOf(upscaleByFactor(piccola, 4))].sort(), [...colorsOf(piccola)].sort());
});

test('l istogramma e normalizzato e ha il numero di bande chiesto', () => {
  const h = lumaHistogram(gradient(), 12);
  assert.equal(h.length, 12);
  assert.equal(Math.max(...h), 1);
  assert.ok(h.every((v) => v >= 0 && v <= 1));
});

test('normalizeOptions riporta tutto entro i limiti', () => {
  const o = normalizeOptions({
    scale: 999, gamma: -5, bias: -9999, algorithm: 'inventato',
    palette: 'inesistente', serpentine: 'si', megapixels: 9999,
  });
  assert.equal(o.scale, 16);
  assert.equal(o.gamma, 0.2);
  assert.equal(o.bias, -100);
  assert.equal(o.algorithm, DEFAULTS.algorithm);
  assert.equal(o.palette, DEFAULTS.palette);
  assert.equal(o.serpentine, true);
  assert.equal(o.megapixels, 24);
  assert.equal(normalizeOptions({ megapixels: 0 }).megapixels, 0.01);
  assert.equal(normalizeOptions({ gamma: 'abc' }).gamma, DEFAULTS.gamma);
});

test('i valori vengono agganciati a un gradino esistente', () => {
  // Un valore preso da un attributo HTML o da un file di configurazione puo'
  // cadere fra due gradini: deve finire su uno di quelli che i cursori sanno
  // rappresentare, se no il cursore mostrerebbe un valore diverso da quello
  // effettivamente in uso.
  for (const p of PARAMS.filter((x) => x.type === 'range')) {
    const passi = paramSteps(p);
    const meta = (passi[0] + passi[passi.length - 1]) / 2;
    const agganciato = normalizeOptions({ [p.key]: meta })[p.key];
    assert.ok(passi.includes(agganciato), `${p.key}: ${agganciato} non e un gradino`);
  }
});

test('una palette custom passa indenne dalla normalizzazione', () => {
  const comeArray = ['#101010', '#f0f0f0'];
  assert.deepEqual(normalizeOptions({ palette: comeArray }).palette, comeArray);
  const comeStringa = '#0a0c10,#c2fe0b';
  assert.equal(normalizeOptions({ palette: comeStringa }).palette, comeStringa);
});

test('ogni parametro ha uno schema coerente', () => {
  for (const p of PARAMS) {
    assert.ok(p.key && p.label && p.group, `parametro incompleto: ${p.key}`);
    if (p.type === 'range') {
      assert.ok(p.min < p.max, `${p.key}: intervallo assurdo`);
      assert.ok(p.default >= p.min && p.default <= p.max, `${p.key}: default fuori scala`);
      assert.ok(p.step > 0 || Array.isArray(p.steps), `${p.key}: ne passo ne gradini`);
      const passi = paramSteps(p);
      assert.ok(passi.length >= 2, `${p.key}: troppo pochi gradini`);
      assert.equal(passi[0], p.min, `${p.key}: il primo gradino non e il minimo`);
      assert.equal(passi[passi.length - 1], p.max, `${p.key}: l ultimo non e il massimo`);
      for (let i = 1; i < passi.length; i++) {
        assert.ok(passi[i] > passi[i - 1], `${p.key}: gradini non crescenti`);
      }
    }
    if (p.type === 'enum') assert.ok(p.values.includes(p.default), `${p.key}: default non in elenco`);
  }
});

test('stepBy e stepIndex si muovono e si fermano agli estremi', () => {
  for (const p of PARAMS.filter((x) => x.type === 'range')) {
    const passi = paramSteps(p);
    assert.equal(stepBy(p, passi[0], -50), p.min, `${p.key}: sfonda in basso`);
    assert.equal(stepBy(p, passi[passi.length - 1], 50), p.max, `${p.key}: sfonda in alto`);
    assert.equal(stepBy(p, passi[1], -1), passi[0], `${p.key}: passo indietro`);
    assert.equal(stepIndex(p, p.min), 0);
    assert.equal(stepIndex(p, p.max), passi.length - 1);
  }
});

test('formatValue non restituisce mai stringhe vuote', () => {
  for (const p of PARAMS) {
    const text = formatValue(p, DEFAULTS[p.key]);
    assert.ok(typeof text === 'string' && text.length, `${p.key} formattato a vuoto`);
  }
});

test('tutti i preset producono opzioni valide ed elaborano', () => {
  const img = gradient(48, 48);
  for (const name of Object.keys(PRESETS)) {
    const options = applyPreset(name);
    assert.deepEqual(options, normalizeOptions(options), `${name} non e stabile`);
    const { image, palette } = processImage(img, options);
    assert.ok(image.width > 0 && image.height > 0, `${name} ha prodotto un immagine vuota`);
    const allowed = new Set(palette.map((c) => c.join(',')));
    for (const c of colorsOf(image)) assert.ok(allowed.has(c), `${name}: colore estraneo ${c}`);
  }
  assert.throws(() => applyPreset('inventato'), /Preset sconosciuto/);
});

test('targetSize riduce ai megapixel chiesti e non ingrandisce mai', () => {
  for (const mp of [0.01, 0.05, 0.2, 1, 2, 8]) {
    const t = targetSize(4032, 3024, mp);
    const resa = (t.width * t.height) / 1e6;
    assert.ok(Math.abs(resa - mp) / mp < 0.02, `${mp} MP -> ${resa.toFixed(3)} MP`);
    // Le proporzioni devono restare quelle.
    assert.ok(Math.abs(t.width / t.height - 4032 / 3024) < 0.02);
  }
  assert.deepEqual(targetSize(200, 150, 24), { scale: 1, width: 200, height: 150 });
});

test('processImage rispetta megapixel, scala e ringrandimento', () => {
  const img = gradient(800, 400);           // 0.32 MP
  const ridotta = processImage(img, { megapixels: 0.02, scale: 1 });
  assert.ok(Math.abs(ridotta.image.width * ridotta.image.height - 20000) < 900);

  // 0.5 MP e' piu' della foto (0.32): nessuna riduzione, resta 800x400.
  const bloccosa = processImage(img, { megapixels: 0.5, scale: 4, upscale: true });
  assert.equal(bloccosa.ditherWidth, 200);
  assert.equal(bloccosa.image.width, 800);

  const cruda = processImage(img, { megapixels: 0.5, scale: 4, upscale: false });
  assert.equal(cruda.image.width, 200);
});

test('palette personalizzate: riconoscimento, lettura e scrittura', () => {
  for (const buona of ['#000000,#ffffff', '#000,#fff', '0a0c10,c2fe0b', '#1a1423,#f2e9e4,#c9ada7']) {
    assert.ok(isCustomPalette(buona), buona);
  }
  for (const cattiva of ['bw', '#abc', 'rosso,verde', '', '#12345', 'gameboy,bw']) {
    assert.ok(!isCustomPalette(cattiva), cattiva);
  }
  assert.deepEqual(parseCustomPalette('#000,#ffffff'), [[0, 0, 0], [255, 255, 255]]);
  assert.equal(stringifyPalette([[0, 0, 0], [255, 136, 0]]), '#000000,#ff8800');

  // Andata e ritorno da una palette predefinita.
  const { colors } = paletteInfo('gameboy');
  assert.deepEqual(parseCustomPalette(stringifyPalette(colors)), colors);
});

test('una palette personalizzata attraversa tutta la pipeline', () => {
  const img = gradient(64, 32);
  const { image, palette } = processImage(img, {
    palette: '#0a0c10,#c2fe0b', algorithm: 'atkinson',
  });
  assert.deepEqual(palette, [[10, 12, 16], [194, 254, 11]]);
  const usati = colorsOf(image);
  assert.ok(usati.size <= 2);
  for (const c of usati) assert.ok(['10,12,16', '194,254,11'].includes(c), c);
});

test('le palette a due tinte sono trattate come scale di luminanza', () => {
  // Nero e giallo acido non sono vicini nello spazio RGB: senza la mappatura
  // sulla luminanza un pixel scuro finirebbe sul giallo per pura distanza.
  const { ramp } = paletteInfo('#0a0c10,#c2fe0b');
  assert.equal(ramp, true);
  assert.equal(paletteInfo('marathon').ramp, true, 'marathon deve dare fasce piatte');
});

test('processImage non tocca l immagine di partenza', () => {
  const img = gradient(32, 16);
  const copia = [...img.data];
  processImage(img, { contrast: 60, invert: true, scale: 2 });
  assert.deepEqual([...img.data], copia);
});
