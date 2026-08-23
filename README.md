# DitherBox

Dithering regolabile per le foto: lo stesso motore in due confezioni.

- **Un widget da mettere nel sito** — JavaScript puro, zero dipendenze, nessun
  bundler richiesto. Funziona in Astro come in una pagina HTML scritta a mano.
  L'immagine non lascia mai il browser: si elabora tutto sul canvas.
- **Un'app da terminale** con interfaccia a schermo intero nello stile di
  [cliamp](https://github.com/bjarneo/cliamp): pannelli bordati, temi a sei
  colori, slider al posto dell'equalizzatore, l'anteprima disegnata dentro
  il terminale.

Diciannove algoritmi di dithering, tredici palette (dal bianco e nero a un bit
al Game Boy, dal CGA al C64), regolazioni di tono e otto preset pronti.

```
╭─ DITHERBOX ────────────────────────────────────────────────────────────────────────╮
│▶ ritratto.png                                               900×1200 · PNG · 1.6 MB│
│1-BIT B/N · FLOYD-STEINBERG · 1X                                 ▁▃▂▄▅█▅▄▄▅▇        │
│anteprima 45×60 · export 768×1024                                   braille · winamp│
╰────────────────────────────────────────────────────────────────────────────────────╯
╭─ ANTEPRIMA ──────────────────────────────────╮╭─ CONTROLLI 1/18 ───────────────────╮
│           ⣕⢯⢺⡱⣫⡺⡕⣏⢞⣕⢯⢺⡱⣫⡺⡕⣏⢞⣕⢯⢺⡱⡃            ││DITHER                              │
│           ⢎⢧⢳⢝⢼⢜⢵⢕⢗⡕⡯⡪⣺⢪⡺⡕⣕⢗⡕⡯⡪⣺⠅            ││> Palette      ◄ 1-bit B/N       ►  │
│           ⡫⡎⡧⡫⡺⡜⡕⡇⡗⡍⡎⢕⢑⠕⢇⢯⢪⡺⡸⣱⢫⢪⡂            ││  Algoritmo    ◄ Floyd-Steinberg ►  │
│           ⢕⢝⢜⢎⢞⢜⢕⢣⢣⢣⢣⠱⡐⠅⡂⠣⢳⢩⡺⡸⡜⡕⡅            ││  Pixel        ▱▱▱▱▱▱▱▱▱▱▱▱      1x │
│           ⢕⢝⢜⢕⢕⢝⡼⣾⢿⡷⣵⢅⡪⠨⠀⡁⢱⢣⢣⢣⡣⡳⡁            ││  Intensita    ▰▰▰▰▰▰▱▱▱▱▱▱    100% │
│           ⢕⢕⢕⢕⢕⢕⢽⣫⣟⣎⡗⣟⢜⢘⠌⢐⠨⡪⡪⡪⡪⡪⡂            ││  Soglia       ▰▰▰▰▰▰▱▱▱▱▱▱       0 │
│           ⠕⡕⡕⡕⡕⡕⡕⡧⡳⡸⡪⡃⡣⠂⠡⢀⢪⢪⢪⢪⢪⢪⠂            ││  Grana        ▱▱▱▱▱▱▱▱▱▱▱▱      0% │
│           ⡣⢣⢱⢡⢣⢱⢑⢅⠣⢃⠣⠡⡈⠄⠁⡢⠅⡇⡕⡕⢜⢌⠆            ││  Serpentina   [■] ON               │
│           ⡪⡊⡆⢇⠕⡜⢔⢱⢨⠠⡈⠄⠄⡡⡡⡪⡅⢇⠎⡜⡸⢰⠁            ││TONO                                │
│           ⡢⢃⢎⠪⡪⢘⢌⠆⡣⠀⡂⠕⠈⢄⠪⡢⢊⠎⡜⢌⢪⢘⠄            ││  Luminosita   ▰▰▰▰▰▰▱▱▱▱▱▱       0 │
│           ⢘⠔⡑⡅⡪⠪⢐⠕⠅⠌⠄⠅⡑⠠⡡⡪⢘⢌⢪⢐⠕⡡⡁            ││  Contrasto    ▰▰▰▰▰▰▱▱▱▱▱▱       0 │
│           ⠌⡪⢐⢅⢪⠡⡃⢕⢑⠨⠨⠠⢂⠡⢐⢅⠕⡰⠡⡊⡌⡢⠂            ││  Gamma        ▰▰▰▱▱▱▱▱▱▱▱▱    1.00 │
╰──────────────────────────────────────────────╯╰────────────────────────────────────╯
╭─ FILE 1/3 · Foto ──────────────────────────────────────────────────────────────────╮
│> ★ ritratto.png                                                                    │
│    scogliera.jpg                                                                   │
╰────────────────────────────────────────────────────────────────────────────────────╯
 jk scorri  hl regola  tab fuoco  v anteprima  p preset  t tema  s salva  ? tasti  q esci
```

---

## Il widget per il sito

### Astro

```sh
npm install ditherbox
```

Copia `examples/astro/DitherBox.astro` in `src/components/` e usalo:

```astro
---
import DitherBox from '../components/DitherBox.astro';
---

<DitherBox palette="bw" algorithm="atkinson" contrast={15} sharpen={40} />
```

Il modulo si puo' importare anche nel frontmatter senza far esplodere la build:
non tocca il DOM al momento dell'import, quindi il rendering lato server passa
liscio.

### HTML e basta

Un file di stile, un file di script, un div:

```html
<link rel="stylesheet" href="dist/ditherbox.css">
<div id="dither"></div>
<script src="dist/ditherbox.global.js"></script>
<script>
  new DitherBox('#dither', {
    options: { palette: 'gameboy', algorithm: 'bayer4', scale: 4 },
  });
</script>
```

Oppure senza scrivere niente, lasciando che sia l'HTML a dire cosa fare:

```html
<div data-ditherbox data-palette="gameboy" data-scale="4"></div>
<script>DitherBox.autoInit();</script>
```

Apri `examples/index.html` per vedere entrambe le forme al lavoro.

### Cosa sa fare il widget

Trascinamento, incolla dagli appunti, selettore file, e su telefono il pulsante
*Scatta* apre direttamente la fotocamera. L'orientamento EXIF viene rispettato,
cosi' le foto verticali non arrivano coricate. L'anteprima lavora su una copia
ridotta per restare reattiva mentre si trascinano gli slider; il PNG che scarichi
viene rielaborato a piena risoluzione.

### API

```js
import { DitherBox, ditherToCanvas, autoInit } from 'ditherbox/web';
import { processImage, applyPreset, PALETTES } from 'ditherbox';

const box = new DitherBox('#dither', {
  options: { palette: 'bw', algorithm: 'atkinson' },
  previewMaxSize: 900,   // lato massimo dell'anteprima interattiva
  presets: true,         // barra dei preset
  src: '/foto.jpg',      // immagine da caricare all'avvio
});

await box.load(file);            // File, Blob o URL
box.set({ contrast: 30 });       // aggiorna e ridisegna
box.getOptions();
box.reset();
const canvas = box.renderFull(); // a piena risoluzione
const blob = await box.toBlob();
await box.download('mia-foto.png');
box.on('load' | 'change' | 'error', fn);
box.destroy();

// Senza interfaccia:
const canvas = ditherToCanvas(document.querySelector('img'), { palette: 'gameboy' });
```

### Intonarlo al tuo sito

Tutti i colori passano da custom property:

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

Il foglio di stile ha gia' una variante chiara sotto `prefers-color-scheme`.

---

## L'app da terminale

```sh
npm install -g ditherbox    # oppure: npx ditherbox
```

```sh
ditherbox ~/Foto                     # sfoglia una cartella
ditherbox ritratto.jpg               # apre direttamente una foto
ditherbox foto.jpg --print           # stampa nel terminale ed esce
```

### Tasti

Ricalcano quelli di cliamp, cosi' se lo usi gia' sei a casa.

| Tasto | Cosa fa |
|---|---|
| `↑` `↓` / `j` `k` | Scorri i parametri o i file |
| `←` `→` / `h` `l` | Regola il valore selezionato |
| `H` `L` / `shift+← →` | Regola a passi di cinque |
| `invio` `spazio` | Carica il file, gira l'interruttore |
| `tab` | Sposta il fuoco fra controlli e lista file |
| `n` `N` | Immagine successiva / precedente |
| `g` `G` `home` `fine` | Vai in cima / in fondo |
| `v` | Cambia modo di anteprima |
| `t` | Scegli il tema (anteprima dal vivo mentre scorri) |
| `p` | Applica un preset |
| `i` | Inverti |
| `r` | Azzera tutti i parametri |
| `o` | Apri un percorso |
| `s` / `ctrl+s` | Salva a piena risoluzione |
| `ctrl+x` | Mostra o nascondi la lista dei file |
| `?` / `ctrl+k` | Elenco dei tasti |
| `q` / `ctrl+c` | Esci |

### I quattro modi di anteprima

Il terminale non ha pixel, ha caratteri, e una cella e' alta il doppio di
quanto e' larga. Ogni modo sfrutta il carattere in modo diverso:

| Modo | Pixel per cella | Quando conviene |
|---|---|---|
| `braille` | 2×4 | Il piu' dettagliato. Perfetto per il bianco e nero |
| `halfblock` | 1×2 | Il piu' fedele nei colori |
| `quadrant` | 2×2 | Via di mezzo, due colori per cella |
| `ascii` | 1×1 | Il piu' nostalgico |

L'anteprima viene ditherata **direttamente alla risoluzione del terminale**, non
rimpicciolita dopo: se si dithera grande e poi si riduce, la media dei pixel
richiude i puntini in grigi e la trama sparisce. Quello che vedi e' dithering
vero, non una foto sfocata.

### Senza interfaccia

```sh
ditherbox foto.jpg -p macintosh -o esito.png
ditherbox foto.jpg --palette gameboy --scale 4 --contrast 20 -o gb.png
ditherbox ~/Foto --preset fanzine --out-dir ./esiti
ditherbox --list                      # palette, algoritmi, preset, temi
ditherbox --help
```

Ogni parametro del motore ha la sua opzione: `--palette`, `--algorithm`,
`--scale`, `--strength`, `--bias`, `--noise`, `--serpentine`, `--brightness`,
`--contrast`, `--gamma`, `--saturation`, `--sharpen`, `--invert`, `--max-size`,
`--upscale`. Gli interruttori si spengono con `--no-` davanti.

### Configurazione

`~/.config/ditherbox/config.toml`:

```toml
theme = "gruvbox"
mode = "braille"
palette = "bw"
algorithm = "atkinson"
contrast = 15
```

I temi personali vanno in `~/.config/ditherbox/themes/*.toml` e usano lo stesso
schema a sei colori di cliamp, quindi un tema scritto per quello funziona qui
senza modifiche:

```toml
bg = "#002b36"
accent = "#268bd2"
bright_fg = "#eee8d5"
fg = "#839496"
green = "#859900"
yellow = "#b58900"
red = "#dc322f"
```

Temi inclusi: `winamp`, `gruvbox`, `dracula`, `nord`, `catppuccin`,
`tokyo-night`, `everforest`, `ember`, `matte-black`, `hackerman`, `vantablack`,
`terminale` (che eredita lo sfondo del tuo terminale).

---

## I parametri

| Parametro | Intervallo | Cosa fa |
|---|---|---|
| **Palette** | 13 tavolozze | I colori a disposizione del risultato |
| **Algoritmo** | 19 algoritmi | Come vengono distribuiti i puntini |
| **Pixel** | 1–16 | Riduce prima di ditherare: 1 = dettaglio pieno, 8 = pixelone da 8 bit |
| **Intensita** | 0–200% | Quanta parte dell'errore (o del rumore ordinato) viene applicata |
| **Soglia** | −100 → 100 | Sposta il punto di taglio: negativo scurisce, positivo schiarisce |
| **Grana** | 0–100% | Rumore casuale prima della soglia: rompe le trame troppo regolari |
| **Serpentina** | on/off | Scansione alternata riga per riga: elimina le strisciate diagonali |
| **Luminosita, Contrasto, Gamma, Saturazione** | | Regolazioni di tono, applicate prima del dithering |
| **Nitidezza** | 0–200% | Maschera di contrasto: recupera i dettagli che il dithering mangia |
| **Inverti** | on/off | Scambia chiari e scuri |
| **Lato max** | 64–4096 px | Le foto da fotocamera vengono prima ridotte a questo lato |
| **Ringrandisci** | on/off | Riporta il risultato alla misura di partenza con pixel netti |

### Algoritmi

**A diffusione dell'errore** — l'errore di ogni pixel viene spalmato sui vicini.
Trama irregolare, tono molto fedele: `floydSteinberg`, `falseFloydSteinberg`,
`atkinson`, `jarvis`, `stucki`, `burkes`, `sierra`, `sierra2`, `sierraLite`,
`stevensonArce`.

`atkinson` e' quello del Macintosh del 1984: diffonde solo sei ottavi
dell'errore, e da li' viene il contrasto marcato che lo rende riconoscibile.

**A matrice ordinata** — ogni pixel viene confrontato con una soglia che dipende
dalla sua posizione. Trama regolare, aria da vecchio videogioco: `bayer2`,
`bayer4`, `bayer8`, `bayer16`, `cluster4`, `cluster8` (retino da rotocalco),
`lines4` (incisione).

**Senza trama** — `none` (soglia secca) e `random` (rumore puro).

### Palette

`bw` (un bit), `gray4` `gray8` `gray16`, `gameboy`, `gameboyPocket`, `cgaCyan`,
`cgaGreen`, `pico8`, `c64`, `zx`, `greenCrt`, `amberCrt`.

Le palette che sono scale tonali (bianco e nero, grigi, Game Boy, fosfori)
vengono mappate sulla **luminanza**, non sul colore RGB piu' vicino: e' l'unico
modo perche' un rosso saturo finisca sul gradino scuro invece che sul verde
chiaro che gli capita accanto nello spazio dei colori.

Puoi anche passare una tavolozza tua:

```js
processImage(imageData, { palette: ['#1a1423', '#f2e9e4'] });
```

### Preset

`macintosh` (Mac 1984), `giornale` (retino da stampa), `gameboy`,
`fanzine` (fotocopia ad alto contrasto), `terminale` (fosfori verdi),
`arcade` (16 colori), `cga` (1981), `incisione`.

---

## Il motore, da solo

Puro JavaScript, nessuna dipendenza, nessun riferimento al DOM: gira uguale nel
browser e in Node.

```js
import { processImage, ditherImage, paletteInfo, applyPreset } from 'ditherbox';

// Le immagini sono { width, height, data: Uint8ClampedArray } in RGBA:
// esattamente la forma di un ImageData, quindi dal canvas si passa diretto.
const { image, palette, ditherWidth } = processImage(imageData, applyPreset('gameboy'));
```

Aggiungere un parametro lo fa comparire **da solo** nel widget web, nella TUI e
nella riga di comando: lo schema sta in un posto solo, `src/core/options.js`, e
tutte e tre le interfacce lo leggono da li'.

---

## Sviluppo

```sh
npm install
npm test          # 80 test: motore, terminale, I/O, TUI, riga di comando, bundle
npm run build     # rigenera dist/ per l'uso con <script>
```

Se tocchi qualcosa in `src/core/` o `src/web/`, rilancia `npm run build` e
committa anche `dist/`: c'e' un test che verifica che il file impacchettato sia
allineato ai sorgenti.

```
src/core/    motore condiviso, niente DOM e niente Node
src/web/     widget per il browser + foglio di stile
src/cli/     app da terminale: TUI, temi, renderer, I/O immagini
```

Le uniche dipendenze sono `jpeg-js` e `pngjs`, entrambe in puro JavaScript e
usate solo dall'app da terminale: niente da compilare, niente moduli nativi. Il
widget web non ha dipendenze del tutto.

## Licenza

MIT
