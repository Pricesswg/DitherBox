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

Per una tavolozza tua basta passarla come elenco di colori, senza registrarla
da nessuna parte:

```astro
<DitherBox palette="#0a0c10,#c2fe0b" megapixels={0.3} algorithm="atkinson" />
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
const canvas = ditherToCanvas(img, { palette: 'gameboy', scale: 4, megapixels: 1 });
img.replaceWith(canvas);
```

## Intonarlo al tuo sito

I colori di serie sono gia' quelli di alessandrosimonitto.it. Se preferisci
agganciarli alle variabili del sito, cosi' che seguano da sole ogni futura
modifica alla palette, bastano queste righe:

```css
.dbx {
  --dbx-bg: var(--color-bg-card);
  --dbx-fg: var(--color-text);
  --dbx-accent: var(--color-accent);

  /* Facoltativi: senza questi vengono ricavati per miscela dai tre di sopra,
     e cadono comunque a un passo da questi valori. */
  --dbx-panel: var(--color-bg-card);
  --dbx-border: var(--color-border);
  --dbx-muted: var(--color-text-muted);

  --dbx-font: var(--font-body);
  --dbx-radius: 0;
}
```

Il sito e' scuro e basta, quindi conviene imporre lo schema invece di
lasciare che il widget segua le preferenze del sistema:

```astro
<DitherBox theme="dark" />
```

Senza, chi tiene il sistema in chiaro si vedrebbe un riquadro chiaro in mezzo
a una pagina nera.

## Partire da zero

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
