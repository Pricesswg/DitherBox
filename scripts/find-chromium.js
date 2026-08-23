/**
 * Trova un Chromium utilizzabile.
 *
 * Playwright pretende la revisione esatta che si aspetta la sua versione, ma
 * su molte macchine (immagini CI, contenitori) ce n'e' gia' uno installato con
 * un numero diverso. Qui si prova prima quello che Playwright sa gestire da
 * solo, poi si cerca in giro: meglio usare il browser che c'e' che saltare
 * ogni controllo visivo.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATI = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** @returns {string|undefined} percorso da passare a `executablePath`, o undefined per il predefinito. */
export function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    let voci = [];
    try {
      voci = readdirSync(base);
    } catch { /* cartella illeggibile: si passa ai candidati di sistema */ }
    // Prima le build complete, poi quelle "headless shell".
    const ordinate = voci
      .filter((v) => v.startsWith('chromium'))
      .sort((a, b) => Number(a.startsWith('chromium_headless')) - Number(b.startsWith('chromium_headless')));
    for (const voce of ordinate) {
      for (const rel of [
        'chrome-linux/chrome',
        'chrome-linux/headless_shell',
        'chrome-headless-shell-linux64/chrome-headless-shell',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      ]) {
        const p = join(base, voce, rel);
        if (existsSync(p)) return p;
      }
    }
  }

  return CANDIDATI.find((p) => existsSync(p));
}

/**
 * Avvia Chromium, ricadendo sull'eseguibile trovato se Playwright non
 * riesce a partire con la sua revisione.
 * @returns {Promise<import('playwright').Browser|null>} null se non c'e' nessun browser.
 */
export async function launchChromium(chromium, opzioni = {}) {
  try {
    return await chromium.launch(opzioni);
  } catch {
    const executablePath = findChromium();
    if (!executablePath) return null;
    try {
      return await chromium.launch({ ...opzioni, executablePath });
    } catch {
      return null;
    }
  }
}
