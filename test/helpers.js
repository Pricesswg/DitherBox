/** Utilita' condivise dai test. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImage } from '../src/core/index.js';
import { savePng } from '../src/cli/imageio.js';

/** Cartella temporanea che si ripulisce da sola a fine test. */
export function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ditherbox-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Immagine con sfumatura diagonale, abbastanza varia da esercitare il motore. */
export function sampleImage(w = 120, h = 90) {
  const img = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = Math.round(((x / w) * 0.6 + (y / h) * 0.4) * 255);
      img.data[i] = v;
      img.data[i + 1] = Math.round(v * 0.8);
      img.data[i + 2] = 255 - v;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

export async function writeSample(dir, name = 'prova.png', w, h) {
  const path = join(dir, name);
  await savePng(path, sampleImage(w, h));
  return path;
}

/**
 * Costruisce una TUI con uno schermo finto della misura data, senza mai
 * toccare la modalita' raw del terminale. Restituisce l'ultimo frame.
 */
export async function mountTui(DitherTui, { width, height, path, ...opts } = {}) {
  const tui = new DitherTui(opts);
  tui.running = true;
  const frame = [];
  tui.screen = {
    width, height,
    draw(lines) { frame.length = 0; frame.push(...lines); },
    enter() {}, leave() {}, invalidate() {},
  };
  if (path) await tui.openImage(path);
  tui.toast = null;
  return { tui, frame, render: () => { tui.render(); return frame; } };
}
