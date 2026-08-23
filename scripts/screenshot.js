#!/usr/bin/env node
/**
 * Apre examples/index.html in Chromium e ne salva una schermata.
 * Serve a guardare il widget senza doverlo aprire a mano dopo ogni modifica.
 *
 *   node scripts/screenshot.js esito.png 1240 820 foto.png '{"palette":"marathon"}' 0
 *
 * Gli argomenti dopo il nome del file sono tutti facoltativi:
 * larghezza, altezza, foto da caricare, opzioni in JSON, scorrimento del
 * pannello in pixel.
 */
import { chromium } from 'playwright';
import { launchChromium } from './find-chromium.js';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const [out = 'ditherbox.png', w = '1240', h = '820', foto, opzioniJson, scrollTo] = process.argv.slice(2);
const browser = await launchChromium(chromium);
if (!browser) throw new Error('Nessun Chromium utilizzabile: installalo o imposta CHROMIUM_PATH');
const page = await browser.newPage({ viewportSize: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
const errori = [];
page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
page.on('pageerror', (e) => errori.push('PAGEERROR: ' + e.message));
await page.goto(pathToFileURL('examples/index.html').href, { waitUntil: 'networkidle' });

if (foto) {
  const b64 = readFileSync(foto).toString('base64');
  await page.evaluate(async (data) => {
    const bin = atob(data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    await window.__boxes[0].load(new File([blob], 'ritratto.png', { type: 'image/png' }));
  }, b64);
  await page.waitForTimeout(500);
}
if (opzioniJson) {
  await page.evaluate((o) => window.__boxes[0].set(JSON.parse(o)), opzioniJson);
  await page.waitForTimeout(400);
}
if (scrollTo) {
  await page.evaluate((t) => {
    document.querySelector('.dbx__scroll').scrollTop = Number(t);
  }, scrollTo);
  await page.waitForTimeout(150);
}
await page.locator('.dbx').first().screenshot({ path: out });
if (errori.length) console.log('ERRORI CONSOLE:\n' + errori.join('\n'));
await browser.close();
import { chromium } from 'playwright';
import { launchChromium } from './find-chromium.js';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const [out = 'ditherbox.png', w = '1240', h = '820', foto, opzioniJson, scrollTo] = process.argv.slice(2);
const browser = await launchChromium(chromium);
if (!browser) throw new Error('Nessun Chromium utilizzabile: installalo o imposta CHROMIUM_PATH');
const page = await browser.newPage({ viewportSize: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
const errori = [];
page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
page.on('pageerror', (e) => errori.push('PAGEERROR: ' + e.message));
await page.goto(pathToFileURL('examples/index.html').href, { waitUntil: 'networkidle' });

if (foto) {
  const b64 = readFileSync(foto).toString('base64');
  await page.evaluate(async (data) => {
    const bin = atob(data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    await window.__boxes[0].load(new File([blob], 'ritratto.png', { type: 'image/png' }));
  }, b64);
  await page.waitForTimeout(500);
}
if (opzioniJson) {
  await page.evaluate((o) => window.__boxes[0].set(JSON.parse(o)), opzioniJson);
  await page.waitForTimeout(400);
}
if (scrollTo) {
  await page.evaluate((t) => {
    document.querySelector('.dbx__scroll').scrollTop = Number(t);
  }, scrollTo);
  await page.waitForTimeout(150);
}
await page.locator('.dbx').first().screenshot({ path: out });
if (errori.length) console.log('ERRORI CONSOLE:\n' + errori.join('\n'));
await browser.close();
