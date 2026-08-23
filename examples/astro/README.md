# DitherBox dentro Astro

## 1. Installa

```sh
npm install ditherbox
```

Se preferisci non passare da npm, copia la cartella `src/` del progetto dentro
`src/lib/ditherbox/` e cambia gli import di conseguenza.

## 2. Copia il componente

Metti `DitherBox.astro` in `src/components/`.

## 3. Usalo in una pagina

```astro
---
import DitherBox from '../components/DitherBox.astro';
---

<h1>Trasforma una foto</h1>
<DitherBox palette="bw" algorithm="atkinson" contrast={15} sharpen={40} />
```

## Solo il motore, senza interfaccia

Se l'interfaccia non ti serve e vuoi solo ditherare un'immagine, importa il
motore: e' puro JavaScript e non tocca il DOM, quindi funziona anche in
frontmatter (a build time) oltre che nel browser.

```astro
---
import { processImage, applyPreset } from 'ditherbox';
// processImage(imageData, opzioni) -> { image, palette, ditherWidth, ditherHeight }
---
```

Nel browser la scorciatoia e' `ditherToCanvas`:

```js
import { ditherToCanvas } from 'ditherbox/web';

const img = document.querySelector('img');
const canvas = ditherToCanvas(img, { palette: 'gameboy', scale: 4 });
img.replaceWith(canvas);
```

## Intonarlo al tuo sito

Il foglio di stile passa tutto da custom property. Ridefiniscile dove vuoi:

```css
.dbx {
  --dbx-bg: #12100e;
  --dbx-panel: #1b1815;
  --dbx-border: #34302b;
  --dbx-accent: #e8a33d;
  --dbx-accent-fg: #12100e;
  --dbx-font: 'Berkeley Mono', monospace;
  --dbx-radius: 0;
}
```
