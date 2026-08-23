import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, copyFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join } from 'node:path';

import {
  loadImage, savePng, saveJpeg, saveImage, listImages, isSupported,
} from '../src/cli/imageio.js';
import { createImage, processImage } from '../src/core/index.js';
import { tempDir, sampleImage } from './helpers.js';

test('isSupported riconosce solo le estensioni che sappiamo aprire', () => {
  for (const ok of ['a.png', 'a.PNG', 'a.jpg', 'a.JPEG']) assert.ok(isSupported(ok), ok);
  for (const no of ['a.gif', 'a.webp', 'a.txt', 'a']) assert.ok(!isSupported(no), no);
});

test('un PNG fa andata e ritorno senza perdere niente', async (t) => {
  const dir = tempDir(t);
  const originale = sampleImage(40, 30);
  const path = join(dir, 'r.png');
  await savePng(path, originale);
  const riletto = await loadImage(path);
  assert.equal(riletto.format, 'png');
  assert.deepEqual([riletto.width, riletto.height], [40, 30]);
  assert.deepEqual([...riletto.data], [...originale.data]);
});

test('un JPEG torna indietro somigliante, con le misure giuste', async (t) => {
  const dir = tempDir(t);
  const originale = sampleImage(40, 30);
  const path = join(dir, 'r.jpg');
  await saveJpeg(path, originale, 95);
  const riletto = await loadImage(path);
  assert.equal(riletto.format, 'jpeg');
  assert.deepEqual([riletto.width, riletto.height], [40, 30]);
  let scarto = 0;
  for (let i = 0; i < originale.data.length; i += 4) {
    scarto += Math.abs(riletto.data[i] - originale.data[i]);
  }
  assert.ok(scarto / (originale.data.length / 4) < 6, 'il JPEG ha perso troppo');
});

test('il formato si riconosce dai byte, non dall estensione', async (t) => {
  const dir = tempDir(t);
  const vero = join(dir, 'vero.png');
  await savePng(vero, sampleImage(10, 10));
  const bugiardo = join(dir, 'bugiardo.jpg');
  await copyFile(vero, bugiardo);
  assert.equal((await loadImage(bugiardo)).format, 'png');
});

test('un file che non e un immagine da un errore comprensibile', async (t) => {
  const dir = tempDir(t);
  const path = join(dir, 'finto.png');
  await writeFile(path, 'questo non e un PNG');
  await assert.rejects(() => loadImage(path), /Formato non riconosciuto/);
});

test('saveImage sceglie il formato dall estensione', async (t) => {
  const dir = tempDir(t);
  const img = sampleImage(20, 20);
  await saveImage(join(dir, 'a.png'), img);
  await saveImage(join(dir, 'b.jpg'), img);
  assert.equal((await loadImage(join(dir, 'a.png'))).format, 'png');
  assert.equal((await loadImage(join(dir, 'b.jpg'))).format, 'jpeg');
});

test('un risultato in bianco e nero viene scritto in scala di grigi', async (t) => {
  const dir = tempDir(t);
  const { image } = processImage(sampleImage(300, 300), { palette: 'bw', algorithm: 'atkinson' });

  const grigio = join(dir, 'grigio.png');
  await savePng(grigio, image);

  // Stessa immagine ma con un pixel colorato: deve tornare a scrivere in RGBA.
  const colorata = { ...image, data: new Uint8ClampedArray(image.data) };
  colorata.data[1] = 128;
  const rgba = join(dir, 'rgba.png');
  await savePng(rgba, colorata);

  assert.ok(
    statSync(grigio).size < statSync(rgba).size * 0.8,
    `grigio ${statSync(grigio).size} B non e piu piccolo di rgba ${statSync(rgba).size} B`,
  );
  // E deve comunque rileggersi identica.
  assert.deepEqual([...(await loadImage(grigio)).data], [...image.data]);
});

test('listImages elenca solo immagini, in ordine, senza i file nascosti', async (t) => {
  const dir = tempDir(t);
  await savePng(join(dir, 'b.png'), createImage(2, 2));
  await savePng(join(dir, 'a.png'), createImage(2, 2));
  await saveJpeg(join(dir, 'c.jpg'), createImage(2, 2));
  await writeFile(join(dir, 'note.txt'), 'x');
  await savePng(join(dir, '.nascosta.png'), createImage(2, 2));

  const nomi = (await listImages(dir)).map((p) => p.split('/').pop());
  assert.deepEqual(nomi, ['a.png', 'b.png', 'c.jpg']);
});
