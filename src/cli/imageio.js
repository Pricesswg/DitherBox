/**
 * Lettura e scrittura di immagini per l'app da terminale.
 * PNG e JPEG, entrambi con decodificatori in puro JavaScript: niente
 * librerie native da compilare, l'installazione resta un npm install secco.
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { extname, basename, join } from 'node:path';
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';

export const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

/** True se il nome file ha un'estensione che sappiamo aprire. */
export function isSupported(name) {
  return SUPPORTED_EXTENSIONS.includes(extname(name).toLowerCase());
}

/**
 * Riconosce il formato dai byte iniziali invece che dall'estensione:
 * capita spessissimo che una foto .jpg sia in realta' un PNG rinominato.
 */
function sniff(buffer) {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50
    && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg';
  return null;
}

/**
 * Legge un'immagine dal disco.
 * @returns {Promise<{width:number,height:number,data:Uint8ClampedArray,format:string,path:string}>}
 */
export async function loadImage(path) {
  const buffer = await readFile(path);
  const format = sniff(buffer);

  if (format === 'png') {
    const png = PNG.sync.read(buffer);
    return {
      width: png.width,
      height: png.height,
      data: new Uint8ClampedArray(png.data),
      format: 'png',
      path,
    };
  }

  if (format === 'jpeg') {
    // useTArray tiene i dati in un Uint8Array invece che in un Buffer,
    // che e' quello che si aspetta il resto del motore.
    const raw = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return {
      width: raw.width,
      height: raw.height,
      data: new Uint8ClampedArray(raw.data),
      format: 'jpeg',
      path,
    };
  }

  throw new Error(`Formato non riconosciuto: ${basename(path)} (accetto PNG e JPEG)`);
}

/**
 * Vero se ogni pixel e' un grigio pieno. Le palette a scala tonale
 * (1 bit, grigi, fosfori) ricadono sempre in questo caso.
 */
function isGrayscale(img) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] !== d[i + 1] || d[i + 1] !== d[i + 2] || d[i + 3] !== 255) return false;
  }
  return true;
}

/**
 * Scrive un PNG.
 *
 * Un'immagine ditherata in bianco e nero salvata in RGBA occupa quattro
 * byte per pixel di cui tre identici: scritta come scala di grigi il file
 * cala di parecchio senza perdere niente.
 */
/**
 * Codifica un'immagine in PNG e restituisce i byte, senza toccare il disco.
 * La usa chi il file lo vuole in memoria: le tavole di confronto lo
 * incorporano nella pagina come data URI.
 */
export function encodePng(img) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  // Le opzioni di scrittura vanno passate a write(), non al costruttore:
  // il costruttore le ignora in silenzio.
  return PNG.sync.write(png, {
    colorType: isGrayscale(img) ? 0 : 6,
    inputColorType: 6,
    inputHasAlpha: true,
  });
}

export async function savePng(path, img) {
  await writeFile(path, encodePng(img));
  return path;
}

/** Scrive un JPEG. `quality` va da 1 a 100. */
export async function saveJpeg(path, img, quality = 92) {
  const encoded = jpeg.encode(
    { data: Buffer.from(img.data), width: img.width, height: img.height },
    quality,
  );
  await writeFile(path, encoded.data);
  return path;
}

/** Salva scegliendo il formato dall'estensione del percorso. */
export async function saveImage(path, img, quality) {
  const ext = extname(path).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return saveJpeg(path, img, quality);
  return savePng(path, img);
}

/**
 * Il contenuto di una cartella: prima le sottocartelle, poi le immagini
 * che il programma sa aprire. I nomi che cominciano per punto restano fuori.
 *
 * I collegamenti si seguono con `stat`: una cartella raggiunta per
 * collegamento e' comunissima (iCloud, cartelle condivise) e senza questo
 * comparirebbe come una voce che non si apre.
 */
export async function listEntries(dir) {
  const voci = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => !e.name.startsWith('.'));

  const decise = await Promise.all(voci.map(async (e) => {
    const path = join(dir, e.name);
    let cartella = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        cartella = (await stat(path)).isDirectory();
      } catch {
        return null; // collegamento rotto: non serve a nessuno vederlo
      }
    }
    if (!cartella && !(e.isFile() || e.isSymbolicLink())) return null;
    if (!cartella && !isSupported(e.name)) return null;
    return { name: e.name, path, dir: cartella };
  }));

  const buone = decise.filter(Boolean);
  const ordina = (a, b) => a.name.localeCompare(b.name, 'it');
  return [
    ...buone.filter((v) => v.dir).sort(ordina),
    ...buone.filter((v) => !v.dir).sort(ordina),
  ];
}

/** Elenca le immagini apribili dentro una cartella, in ordine alfabetico. */
export async function listImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && isSupported(e.name) && !e.name.startsWith('.'))
    .map((e) => join(dir, e.name))
    .sort((a, b) => a.localeCompare(b, 'it'));
}
