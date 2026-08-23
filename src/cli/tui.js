/**
 * Interfaccia a schermo intero, nello spirito di cliamp: pannelli bordati,
 * tema a sei colori, un display in alto con il titolo che scorre e il
 * visualizzatore, gli slider al posto dell'equalizzatore, la lista dei file
 * al posto della playlist.
 */

import { basename, dirname, resolve, join } from 'node:path';
import { statSync } from 'node:fs';

import {
  PARAMS, GROUP_LABELS, PRESETS, DEFAULTS,
  normalizeOptions, formatValue, applyPreset, paramSteps, stepIndex, stepBy,
  processImage, targetSize, resampleBox, cloneImage,
  applyAdjustments, lumaHistogram, isCustomPalette,
} from '../core/index.js';

import {
  Screen, parseKey, panel, pad, padStart, center, truncate, visibleLength,
  bar, BLOCKS_V, fg, RESET, BOLD, DIM, REVERSE,
} from './term.js';
import { MODES, MODE_KEYS, cellTarget, renderImage } from './preview.js';
import { loadThemes, loadConfig, DEFAULT_THEME } from './theme.js';
import { loadImage, saveImage, listImages, isSupported } from './imageio.js';

const HEADER_HEIGHT = 5;
const HELP_HEIGHT = 1;
const CONTROLS_WIDTH = 38;
const NARROW_WIDTH = 78;
const HIST_BANDS = 22;

/** Elenco piatto dei parametri, con le intestazioni di gruppo intercalate. */
function buildRows() {
  const rows = [];
  let lastGroup = null;
  for (const param of PARAMS) {
    if (param.group !== lastGroup) {
      rows.push({ kind: 'group', label: GROUP_LABELS[param.group] || param.group });
      lastGroup = param.group;
    }
    rows.push({ kind: 'param', param });
  }
  return rows;
}

export class DitherTui {
  constructor(opts = {}) {
    const config = loadConfig();
    this.screen = new Screen();
    this.themes = loadThemes();
    this.themeName = opts.theme || config.theme || DEFAULT_THEME;
    if (!this.themes[this.themeName]) this.themeName = DEFAULT_THEME;

    this.options = normalizeOptions({ ...DEFAULTS, ...pickOptions(config), ...opts.options });
    this.previewMode = opts.mode || config.mode || 'braille';
    if (!MODES[this.previewMode]) this.previewMode = 'braille';

    this.rows = buildRows();
    this.cursor = this.rows.findIndex((r) => r.kind === 'param');
    this.focus = 'controls';
    this.showFiles = true;
    this.overlay = null;
    this.toast = null;
    this.marqueeOffset = 0;
    this.cache = null;
    this.running = false;

    this.source = null;
    this.sourceInfo = null;
    this.thumb = null;
    this.imagePath = null;
    this.files = [];
    this.fileIndex = -1;
    this.dir = opts.dir ? resolve(opts.dir) : process.cwd();
  }

  get theme() { return this.themes[this.themeName]; }

  // ------------------------------------------------------------- avvio

  async start(initialPath) {
    this.running = true;
    this.screen.enter();
    this.#installHandlers();

    if (initialPath) {
      this.dir = dirname(resolve(initialPath));
      await this.#scanDir();
      await this.openImage(resolve(initialPath));
    } else {
      await this.#scanDir();
      if (this.files.length) await this.openImage(this.files[0]);
      else this.#say('Nessuna immagine qui. Premi o per aprire un percorso.', 'yellow');
    }

    this.render();
    // Un battito lento serve solo a far scorrere il titolo e a far
    // scadere i messaggi: non ridisegna se non c'e' niente da animare.
    this.ticker = setInterval(() => this.#tick(), 220);
    if (this.ticker.unref) this.ticker.unref();

    await new Promise((done) => { this.done = done; });
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.ticker);
    this.#removeHandlers();
    this.screen.leave();
    if (this.done) this.done();
  }

  #installHandlers() {
    const stdin = process.stdin;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    this.onData = (data) => {
      try {
        this.#handleKey(parseKey(data));
      } catch (err) {
        this.#say(`Errore: ${err.message}`, 'red');
        this.render();
      }
    };
    this.onResize = () => {
      this.screen.invalidate();
      this.cache = null;
      this.render();
    };
    this.onExit = () => this.stop();
    stdin.on('data', this.onData);
    process.stdout.on('resize', this.onResize);
    process.on('SIGINT', this.onExit);
    process.on('SIGTERM', this.onExit);
  }

  #removeHandlers() {
    const stdin = process.stdin;
    stdin.removeListener('data', this.onData);
    process.stdout.removeListener('resize', this.onResize);
    process.removeListener('SIGINT', this.onExit);
    process.removeListener('SIGTERM', this.onExit);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }

  #tick() {
    let needs = false;
    if (this.toast && Date.now() > this.toast.until) {
      this.toast = null;
      needs = true;
    }
    if (this.marqueeWidth && this.marqueeText
      && this.marqueeText.length > this.marqueeWidth) {
      this.marqueeOffset = (this.marqueeOffset + 1) % (this.marqueeText.length + 3);
      needs = true;
    }
    if (needs) this.render();
  }

  // -------------------------------------------------------- caricamento

  async #scanDir() {
    try {
      this.files = await listImages(this.dir);
    } catch {
      this.files = [];
    }
    this.fileIndex = this.imagePath ? this.files.indexOf(this.imagePath) : (this.files.length ? 0 : -1);
  }

  async openImage(path) {
    this.#say('Carico…', 'fg');
    this.render();
    const img = await loadImage(path);
    this.source = { width: img.width, height: img.height, data: img.data };
    this.imagePath = path;
    this.sourceInfo = {
      format: img.format.toUpperCase(),
      bytes: safeSize(path),
    };
    // Miniatura fissa per l'istogramma: ricalcolarla a ogni frame su una
    // foto da 12 megapixel sarebbe uno spreco assurdo.
    this.thumb = resampleBox(this.source, 96, 96);
    this.cache = null;
    this.marqueeOffset = 0;
    const idx = this.files.indexOf(path);
    if (idx >= 0) this.fileIndex = idx;
    this.#say(`${basename(path)} caricata`, 'green');
  }

  // ------------------------------------------------------------- input

  /** Ingresso pubblico della tastiera: la usa anche la suite di prova. */
  _handle(key) { return this.#handleKey(key); }

  #handleKey(key) {
    if (this.overlay) {
      this.overlay.onKey(key);
      this.render();
      return;
    }

    const { name, ctrl, shift } = key;

    if (ctrl && name === 'c') return this.stop();
    if (name === 'q') return this.stop();

    if (name === '?' || (ctrl && name === 'k')) return this.#openHelp();
    if (name === 't') return this.#openThemePicker();
    if (name === 'p') return this.#openPresetPicker();
    if (name === 'o') return this.#openPathPrompt();
    if (name === 's' || (ctrl && name === 's')) return this.#openSavePrompt();

    if (name === 'v') {
      const i = MODE_KEYS.indexOf(this.previewMode);
      this.previewMode = MODE_KEYS[(i + 1) % MODE_KEYS.length];
      this.cache = null;
      this.#say(`Anteprima: ${MODES[this.previewMode].label}`, 'accent');
      return this.render();
    }

    if (ctrl && name === 'x') {
      this.showFiles = !this.showFiles;
      this.cache = null;
      if (!this.showFiles && this.focus === 'files') this.focus = 'controls';
      return this.render();
    }

    if (name === 'r') {
      this.options = normalizeOptions({ ...DEFAULTS });
      this.cache = null;
      this.#say('Parametri azzerati', 'yellow');
      return this.render();
    }

    if (name === 'i') return this.#setOption('invert', !this.options.invert);

    if (name === 'tab' || name === 'shifttab') {
      if (this.showFiles && this.files.length) {
        this.focus = this.focus === 'controls' ? 'files' : 'controls';
      }
      return this.render();
    }

    if (name === 'n' && !ctrl) return this.#step(1);
    if (name === 'N') return this.#step(-1);

    const big = shift ? 5 : 1;
    switch (name) {
      case 'up': case 'k': return this.#move(-1);
      case 'down': case 'j': return this.#move(1);
      case 'pageup': return this.#move(-5);
      case 'pagedown': return this.#move(5);
      case 'home': case 'g': return this.#moveTo(0);
      case 'end': case 'G': return this.#moveTo(Infinity);
      case 'left': case 'h': return this.#adjust(-big);
      case 'right': case 'l': return this.#adjust(big);
      case 'H': return this.#adjust(-5);
      case 'L': return this.#adjust(5);
      case 'enter': case 'space': return this.#activate();
      default: break;
    }
  }

  /**
   * Passa all'immagine successiva o precedente della cartella.
   * Restituisce la promessa del caricamento: serve ai test, e serve a
   * chiunque debba sapere quando l'immagine e' davvero pronta.
   */
  #step(delta) {
    if (!this.files.length) return Promise.resolve();
    const next = (this.fileIndex + delta + this.files.length) % this.files.length;
    return this.#loadAndRender(this.files[next]);
  }

  /** Carica un file e ridisegna, riportando in stato gli eventuali errori. */
  #loadAndRender(path) {
    return this.openImage(path)
      .then(() => this.render())
      .catch((err) => {
        this.#say(err.message, 'red');
        this.render();
      });
  }

  #move(delta) {
    if (this.focus === 'files') {
      if (!this.files.length) return;
      this.fileIndex = Math.max(0, Math.min(this.files.length - 1, this.fileIndex + delta));
      return this.render();
    }
    let i = this.cursor;
    const dir = Math.sign(delta);
    for (let n = 0; n < Math.abs(delta); n++) {
      let next = i + dir;
      // Le intestazioni di gruppo non sono selezionabili: si saltano.
      while (next >= 0 && next < this.rows.length && this.rows[next].kind !== 'param') next += dir;
      if (next < 0 || next >= this.rows.length) break;
      i = next;
    }
    this.cursor = i;
    this.render();
  }

  #moveTo(index) {
    if (this.focus === 'files') {
      this.fileIndex = Math.max(0, Math.min(this.files.length - 1, index === Infinity ? this.files.length - 1 : index));
      return this.render();
    }
    const candidates = this.rows
      .map((r, i) => (r.kind === 'param' ? i : -1))
      .filter((i) => i >= 0);
    this.cursor = index === Infinity ? candidates[candidates.length - 1] : candidates[0];
    this.render();
  }

  #currentParam() {
    const row = this.rows[this.cursor];
    return row && row.kind === 'param' ? row.param : null;
  }

  #adjust(steps) {
    if (this.focus === 'files') return;
    const param = this.#currentParam();
    if (!param) return;
    const current = this.options[param.key];

    if (param.type === 'bool') return this.#setOption(param.key, steps > 0);
    if (param.type === 'enum') {
      // Una palette scritta a mano non sta nell'elenco: si riparte da capo.
      const i = param.values.indexOf(current);
      const base = i < 0 ? (steps > 0 ? -1 : 0) : i;
      const next = (base + steps + param.values.length * 10) % param.values.length;
      return this.#setOption(param.key, param.values[next]);
    }
    // Gli stessi gradini che usa il cursore del widget: cosi' un passo di
    // tastiera qui e uno di mouse la' portano allo stesso valore.
    return this.#setOption(param.key, stepBy(param, current, steps));
  }

  #activate() {
    if (this.focus === 'files') {
      const path = this.files[this.fileIndex];
      return path ? this.#loadAndRender(path) : undefined;
    }
    const param = this.#currentParam();
    if (!param) return;
    if (param.type === 'bool') return this.#setOption(param.key, !this.options[param.key]);
    if (param.type === 'enum') return this.#adjust(1);
  }

  #setOption(key, value) {
    this.options = normalizeOptions({ ...this.options, [key]: value });
    this.cache = null;
    this.render();
  }

  // --------------------------------------------------------- sovrapposte

  #openHelp() {
    const lines = [
      ['↑ ↓  j k', 'Scorri i parametri o i file'],
      ['← →  h l', 'Regola il valore selezionato'],
      ['H L  shift+← →', 'Regola a passi di cinque'],
      ['invio  spazio', 'Attiva: carica il file, gira l’interruttore'],
      ['tab', 'Sposta il fuoco fra controlli e file'],
      ['n  N', 'Immagine successiva / precedente'],
      ['g  G  home  fine', 'Vai in cima / in fondo'],
      ['v', 'Cambia modo di anteprima'],
      ['t', 'Scegli il tema'],
      ['p', 'Applica un preset'],
      ['i', 'Inverti (scorciatoia)'],
      ['r', 'Azzera tutti i parametri'],
      ['o', 'Apri un percorso'],
      ['s  ctrl+s', 'Salva il risultato'],
      ['ctrl+x', 'Mostra o nascondi la lista dei file'],
      ['?  ctrl+k', 'Questa schermata'],
      ['q  ctrl+c', 'Esci'],
    ];
    this.overlay = {
      title: 'TASTI',
      render: (w) => lines.map(([k, d]) => `${fg(this.theme.accent)}${pad(k, 17)}${RESET}${fg(this.theme.bright_fg)}${truncate(d, w - 18)}${RESET}`),
      onKey: (key) => {
        if (['escape', 'q', 'enter', '?'].includes(key.name) || (key.ctrl && key.name === 'k')) {
          this.overlay = null;
        }
      },
    };
    this.render();
  }

  /** Selettore generico a lista, con anteprima dal vivo mentre si scorre. */
  #listOverlay({ title, items, initialIndex, onPreview, onConfirm, onCancel }) {
    let index = Math.max(0, initialIndex);
    const overlay = {
      title,
      render: (w) => items.map((item, i) => {
        const selected = i === index;
        const marker = selected ? '>' : ' ';
        const body = ` ${marker} ${pad(item.label, w - 5)}`;
        return selected
          ? `${REVERSE}${fg(this.theme.accent)}${truncate(body, w)}${RESET}`
          : `${fg(this.theme.bright_fg)}${truncate(body, w)}${RESET}`;
      }),
      onKey: (key) => {
        switch (key.name) {
          case 'up': case 'k':
            index = (index - 1 + items.length) % items.length;
            if (onPreview) onPreview(items[index]);
            break;
          case 'down': case 'j':
            index = (index + 1) % items.length;
            if (onPreview) onPreview(items[index]);
            break;
          case 'enter': case 'space':
            this.overlay = null;
            if (onConfirm) onConfirm(items[index]);
            break;
          case 'escape': case 'q':
            this.overlay = null;
            if (onCancel) onCancel();
            break;
          default: break;
        }
      },
    };
    this.overlay = overlay;
    this.render();
  }

  #openThemePicker() {
    const names = Object.keys(this.themes);
    const original = this.themeName;
    this.#listOverlay({
      title: 'TEMA',
      items: names.map((n) => ({ label: n, value: n })),
      initialIndex: names.indexOf(this.themeName),
      onPreview: (item) => { this.themeName = item.value; },
      onConfirm: (item) => {
        this.themeName = item.value;
        this.#say(`Tema: ${item.value}`, 'accent');
      },
      onCancel: () => { this.themeName = original; },
    });
  }

  #openPresetPicker() {
    const keys = Object.keys(PRESETS);
    this.#listOverlay({
      title: 'PRESET',
      items: keys.map((k) => ({ label: PRESETS[k].label, value: k })),
      initialIndex: 0,
      onConfirm: (item) => {
        this.options = applyPreset(item.value, this.options);
        this.cache = null;
        this.#say(`Preset: ${item.label}`, 'green');
      },
    });
  }

  /** Campo di testo su una riga, con i tasti di editing essenziali. */
  #promptOverlay({ title, hint, initial, onConfirm }) {
    let text = initial || '';
    let caret = text.length;
    this.overlay = {
      title,
      render: (w) => {
        // Finestra scorrevole attorno al cursore: i percorsi sono lunghi
        // e devono restare dentro il riquadro, con il cursore sempre in vista.
        const view = Math.max(8, w - 1);
        let from = 0;
        if (caret > view - 1) from = caret - view + 1;
        const shown = text.slice(from, from + view);
        const local = caret - from;
        const before = shown.slice(0, local);
        const at = shown.slice(local, local + 1) || ' ';
        const after = shown.slice(local + 1);
        const ellipsis = from > 0 ? `${fg(this.theme.fg)}…${RESET}` : '';
        return [
          `${fg(this.theme.fg)}${truncate(hint, w)}${RESET}`,
          '',
          `${ellipsis}${fg(this.theme.bright_fg)}${before}${REVERSE}${at}${RESET}`
            + `${fg(this.theme.bright_fg)}${truncate(after, Math.max(0, w - local - 2))}${RESET}`,
          '',
          `${fg(this.theme.fg)}invio conferma · esc annulla${RESET}`,
        ];
      },
      onKey: (key) => {
        const { name, ctrl } = key;
        if (name === 'escape') { this.overlay = null; return; }
        if (name === 'enter') {
          this.overlay = null;
          onConfirm(text.trim());
          return;
        }
        if (name === 'left') { caret = Math.max(0, caret - 1); return; }
        if (name === 'right') { caret = Math.min(text.length, caret + 1); return; }
        if (name === 'home') { caret = 0; return; }
        if (name === 'end') { caret = text.length; return; }
        if (name === 'backspace') {
          if (caret > 0) {
            text = text.slice(0, caret - 1) + text.slice(caret);
            caret--;
          }
          return;
        }
        if (name === 'delete') { text = text.slice(0, caret) + text.slice(caret + 1); return; }
        if (ctrl && name === 'u') { text = text.slice(caret); caret = 0; return; }
        if (ctrl && name === 'w') {
          const head = text.slice(0, caret).replace(/\S*\s*$/, '');
          text = head + text.slice(caret);
          caret = head.length;
          return;
        }
        if (name === 'space') {
          text = `${text.slice(0, caret)} ${text.slice(caret)}`;
          caret++;
          return;
        }
        if (!ctrl && name.length === 1) {
          text = text.slice(0, caret) + name + text.slice(caret);
          caret++;
        }
      },
    };
    this.render();
  }

  #openPathPrompt() {
    this.#promptOverlay({
      title: 'APRI',
      hint: 'Percorso di un’immagine o di una cartella',
      initial: this.imagePath ? dirname(this.imagePath) + '/' : `${this.dir}/`,
      onConfirm: async (input) => {
        if (!input) return;
        const path = resolve(input.replace(/^~/, process.env.HOME || '~'));
        try {
          const st = statSync(path);
          if (st.isDirectory()) {
            this.dir = path;
            await this.#scanDir();
            if (this.files.length) await this.openImage(this.files[0]);
            else this.#say('Cartella senza immagini', 'yellow');
          } else {
            this.dir = dirname(path);
            await this.#scanDir();
            await this.openImage(path);
          }
        } catch (err) {
          this.#say(err.message, 'red');
        }
        this.render();
      },
    });
  }

  #openSavePrompt() {
    if (!this.source) return this.#say('Nessuna immagine caricata', 'red');
    const base = basename(this.imagePath || 'ditherbox').replace(/\.[^.]+$/, '');
    const palette = isCustomPalette(this.options.palette) ? 'custom' : this.options.palette;
    const suggested = join(
      dirname(this.imagePath || this.dir),
      `${base}-${palette}-${this.options.algorithm}.png`,
    );
    this.#promptOverlay({
      title: 'SALVA',
      hint: 'File di destinazione (.png o .jpg) — elaboro a piena risoluzione',
      initial: suggested,
      onConfirm: async (input) => {
        if (!input) return;
        const path = resolve(input.replace(/^~/, process.env.HOME || '~'));
        if (!isSupported(path)) {
          this.#say('Uso solo .png o .jpg', 'red');
          return this.render();
        }
        this.#say('Elaboro a piena risoluzione…', 'yellow');
        this.render();
        try {
          const { image } = processImage(this.source, this.options);
          await saveImage(path, image);
          this.#say(`Salvato: ${basename(path)} (${image.width}×${image.height})`, 'green');
        } catch (err) {
          this.#say(`Salvataggio fallito: ${err.message}`, 'red');
        }
        this.render();
      },
    });
  }

  #say(text, kind = 'fg') {
    this.toast = { text, kind, until: Date.now() + 4000 };
  }

  // ---------------------------------------------------------- disegno

  render() {
    if (!this.running) return;
    const W = this.screen.width;
    const H = this.screen.height;
    if (W < 40 || H < 12) {
      this.screen.draw([`${fg(this.theme.red)}Finestra troppo piccola (serve almeno 40x12)${RESET}`]);
      return;
    }

    const layout = this.#layout(W, H);
    // Il centro va disegnato per primo: e' lui a riempire la cache
    // dell'anteprima, che poi l'intestazione legge per la riga di stato.
    const middle = this.#middle(W, layout);
    const lines = [...this.#header(W, layout), ...middle];
    if (layout.fileHeight) lines.push(...this.#filePanel(W, layout.fileHeight));
    lines.push(this.#helpBar(W));

    if (this.overlay) this.#applyOverlay(lines, W, H);
    this.screen.draw(lines);
  }

  #layout(W, H) {
    const narrow = W < NARROW_WIDTH;
    const controlsWidth = narrow ? 0 : Math.min(CONTROLS_WIDTH, Math.floor(W * 0.45));
    let remaining = H - HEADER_HEIGHT - HELP_HEIGHT;
    const wantFiles = this.showFiles && this.files.length > 0 && remaining >= 16 && !narrow;
    const fileHeight = wantFiles ? Math.min(7, Math.max(4, Math.floor(remaining * 0.25))) : 0;
    remaining -= fileHeight;
    return {
      narrow,
      controlsWidth,
      previewWidth: W - controlsWidth,
      middleHeight: Math.max(3, remaining),
      fileHeight,
    };
  }

  /** Il display in alto: titolo che scorre, dati, istogramma, stato. */
  #header(W, layout) {
    const t = this.theme;
    const inner = W - 2;
    const name = this.imagePath ? basename(this.imagePath) : 'nessuna immagine';

    const rightInfo = this.source
      ? `${this.source.width}×${this.source.height} · ${this.sourceInfo.format}${this.sourceInfo.bytes ? ` · ${this.sourceInfo.bytes}` : ''}`
      : '';
    const titleWidth = Math.max(8, inner - visibleLength(rightInfo) - 3);
    this.marqueeText = name;
    this.marqueeWidth = titleWidth - 2;
    const title = marquee(name, this.marqueeWidth, this.marqueeOffset);
    const line1 = `${fg(t.green)}▶ ${RESET}${fg(t.accent)}${BOLD}${pad(title, titleWidth - 2)}${RESET}`
      + `${fg(t.fg)}${padStart(rightInfo, inner - titleWidth)}${RESET}`;

    const preview = this.#previewResult();
    const chain = [
      labelOf('palette', this.options.palette),
      labelOf('algorithm', this.options.algorithm),
      `${this.options.scale}x`,
    ].join(' · ').toUpperCase();
    const hist = this.#histogram(HIST_BANDS);
    const chainWidth = inner - HIST_BANDS - 2;
    const line2 = `${fg(t.bright_fg)}${pad(truncate(chain, chainWidth), chainWidth)}${RESET}  ${hist}`;

    const status = this.toast
      ? `${fg(t[this.toast.kind] || t.fg)}${this.toast.text}${RESET}`
      : `${fg(t.fg)}${preview ? `anteprima ${preview.image.width}×${preview.image.height} · export ${this.#exportSize()}` : 'in attesa di un’immagine'}${RESET}`;
    const right = `${MODES[this.previewMode].label.toLowerCase()} · ${this.themeName}`;
    const statusWidth = inner - visibleLength(right) - 1;
    const line3 = `${pad(truncate(status, statusWidth), statusWidth)} ${fg(t.fg)}${right}${RESET}`;

    return panel({
      title: `${BOLD}DITHERBOX${RESET}${fg(t.fg)}`,
      lines: [line1, line2, line3],
      width: W,
      height: HEADER_HEIGHT,
      color: fg(t.fg),
      titleColor: fg(t.accent),
    });
  }

  /** Istogramma della luminanza dopo le regolazioni di tono. */
  #histogram(bands) {
    const t = this.theme;
    if (!this.thumb) return ' '.repeat(bands);
    const work = cloneImage(this.thumb);
    applyAdjustments(work, this.options);
    const values = lumaHistogram(work, bands);
    let out = '';
    let last = null;
    for (const v of values) {
      // Colore per altezza, come lo spettro di cliamp: basso verde,
      // medio giallo, picco rosso.
      const color = v > 0.72 ? t.red : v > 0.4 ? t.yellow : t.green;
      if (color !== last) {
        out += fg(color);
        last = color;
      }
      out += BLOCKS_V[Math.round(v * 8)];
    }
    return out + RESET;
  }

  #exportSize() {
    if (!this.source) return '—';
    const t = targetSize(this.source.width, this.source.height, this.options.megapixels);
    let { width: w, height: h } = t;
    if (!this.options.upscale && this.options.scale > 1) {
      w = Math.floor(w / this.options.scale);
      h = Math.floor(h / this.options.scale);
    }
    return `${w}×${h}`;
  }

  /** Fascia centrale: anteprima a sinistra, controlli a destra. */
  #middle(W, layout) {
    const { previewWidth, controlsWidth, middleHeight } = layout;
    const previewPanel = this.#previewPanel(previewWidth, middleHeight);
    if (!controlsWidth) return previewPanel;

    const controlsPanel = this.#controlsPanel(controlsWidth, middleHeight);
    const out = [];
    for (let i = 0; i < middleHeight; i++) {
      out.push((previewPanel[i] || ' '.repeat(previewWidth)) + (controlsPanel[i] || ''));
    }
    return out;
  }

  /**
   * Elabora l'immagine alla risoluzione esatta della griglia di celle.
   * Il risultato e' in cache: senza, ogni pressione di tasto ridithererebbe.
   */
  #previewResult(cols, rows) {
    if (!this.source) return null;
    if (cols === undefined) return this.cache ? this.cache.result : null;

    const key = `${cols}x${rows}|${this.previewMode}|${this.imagePath}|${JSON.stringify(this.options)}`;
    if (this.cache && this.cache.key === key) return this.cache.result;

    const target = cellTarget(this.source.width, this.source.height, cols, rows, this.previewMode);
    const small = resampleBox(this.source, target.width, target.height);
    // I megapixel dichiarati sono quelli che l'immagine ha gia': il
    // ridimensionamento l'abbiamo fatto noi qui sopra, alla misura esatta
    // della griglia del terminale, e il motore non deve rifarlo.
    // upscale resta quello scelto dall'utente: forzandolo a spento, con
    // Pixel maggiore di uno l'anteprima si rimpiccioliva invece di mostrare
    // blocchi piu' grossi, e finiva in un angolo del pannello.
    const result = processImage(small, {
      ...this.options,
      megapixels: (small.width * small.height) / 1e6,
    });
    this.cache = { key, result };
    return result;
  }

  #previewPanel(W, H) {
    const t = this.theme;
    const inner = W - 2;
    const innerH = H - 2;
    let body;

    if (!this.source) {
      body = [
        '',
        center(`${fg(t.fg)}nessuna immagine caricata${RESET}`, inner),
        '',
        center(`${fg(t.accent)}o${RESET}${fg(t.fg)} apri un percorso · ${RESET}${fg(t.accent)}?${RESET}${fg(t.fg)} tasti${RESET}`, inner),
      ];
    } else {
      const result = this.#previewResult(inner, innerH);
      const picture = renderImage(result.image, this.previewMode, t);
      // Centra il disegno nel pannello: un'immagine incollata in alto a
      // sinistra dentro una cornice grande fa un effetto sciatto.
      const padTop = Math.max(0, Math.floor((innerH - picture.length) / 2));
      body = [];
      for (let i = 0; i < padTop; i++) body.push('');
      for (const line of picture) body.push(center(line, inner));
    }

    return panel({
      title: 'ANTEPRIMA',
      lines: body,
      width: W,
      height: H,
      color: fg(t.fg),
      titleColor: fg(t.fg),
    });
  }

  #controlsPanel(W, H) {
    const t = this.theme;
    const inner = W - 2;
    const innerH = H - 2;
    const active = this.focus === 'controls';

    const rendered = this.rows.map((row, i) => {
      if (row.kind === 'group') {
        return `${fg(t.fg)}${DIM}${pad(row.label, inner)}${RESET}`;
      }
      return this.#controlRow(row.param, inner, i === this.cursor && active);
    });

    // Finestra di scorrimento che tiene sempre visibile il cursore.
    let start = 0;
    if (rendered.length > innerH) {
      start = Math.max(0, Math.min(this.cursor - Math.floor(innerH / 2), rendered.length - innerH));
    }
    const body = rendered.slice(start, start + innerH);

    return panel({
      title: `CONTROLLI${rendered.length > innerH ? ` ${start + 1}/${rendered.length}` : ''}`,
      lines: body,
      width: W,
      height: H,
      color: fg(active ? t.accent : t.fg),
      titleColor: fg(active ? t.accent : t.fg),
    });
  }

  /**
   * Una riga di controllo: marcatore, etichetta, widget, valore.
   * Le colonne sono fisse, cosi' i valori restano incolonnati a destra
   * qualunque sia la loro lunghezza (1x, 100%, 1024px).
   */
  #controlRow(param, width, selected) {
    const t = this.theme;
    const value = this.options[param.key];
    const marker = selected ? '>' : ' ';
    const labelW = 13;
    const valueW = 7;
    const valueText = formatValue(param, value);

    let line;
    if (param.type === 'range') {
      // La posizione segue l'indice del passo, non il valore: su una scala a
      // gradini scelti a mano come i megapixel il rapporto grezzo
      // schiaccerebbe tutta la meta' bassa contro il bordo sinistro.
      const passi = paramSteps(param);
      const ratio = passi.length > 1 ? stepIndex(param, value) / (passi.length - 1) : 0;
      const barW = Math.max(4, width - labelW - valueW - 4);
      line = `${marker} ${pad(param.label, labelW)}`
        + `${fg(t.accent)}${bar(ratio, barW, '▰', '▱')}${RESET} `
        + `${fg(t.accent)}${padStart(valueText, valueW)}${RESET}`;
    } else if (param.type === 'bool') {
      // Il riquadro da' il colpo d'occhio, ON/OFF resta leggibile anche
      // su un terminale che non fa colori.
      const box = value ? `${fg(t.green)}[■]${RESET}` : `${fg(t.fg)}[ ]${RESET}`;
      line = `${marker} ${pad(param.label, labelW)}${box} ${fg(t.accent)}${valueText}${RESET}`;
    } else {
      const room = width - labelW - 7;
      line = `${marker} ${pad(param.label, labelW)}${fg(t.fg)}◄${RESET} `
        + `${fg(t.accent)}${pad(truncate(valueText, room), room)}${RESET}${fg(t.fg)}►${RESET}`;
    }

    const text = pad(truncate(line, width), width);
    return selected
      ? `${REVERSE}${fg(t.accent)}${text}${RESET}`
      : `${fg(t.bright_fg)}${text}${RESET}`;
  }

  #filePanel(W, H) {
    const t = this.theme;
    const inner = W - 2;
    const innerH = H - 2;
    const active = this.focus === 'files';

    let start = 0;
    if (this.files.length > innerH) {
      start = Math.max(0, Math.min(this.fileIndex - Math.floor(innerH / 2), this.files.length - innerH));
    }

    const body = [];
    for (let i = start; i < Math.min(this.files.length, start + innerH); i++) {
      const path = this.files[i];
      const isCurrent = path === this.imagePath;
      const selected = i === this.fileIndex && active;
      // Marcatori testuali oltre al colore, cosi' si distinguono anche
      // su un terminale monocromatico.
      const mark = isCurrent ? '★' : ' ';
      const cursorMark = i === this.fileIndex ? '>' : ' ';
      const text = pad(truncate(`${cursorMark} ${mark} ${basename(path)}`, inner), inner);
      body.push(selected
        ? `${REVERSE}${fg(t.accent)}${text}${RESET}`
        : `${fg(isCurrent ? t.green : t.bright_fg)}${text}${RESET}`);
    }

    return panel({
      title: `FILE ${this.files.length ? this.fileIndex + 1 : 0}/${this.files.length} · ${truncate(basename(this.dir) || this.dir, 18)}`,
      lines: body,
      width: W,
      height: H,
      color: fg(active ? t.accent : t.fg),
      titleColor: fg(active ? t.accent : t.fg),
    });
  }

  #helpBar(W) {
    const t = this.theme;
    const pairs = [
      ['jk', 'scorri'], ['hl', 'regola'], ['tab', 'fuoco'],
      ['v', 'anteprima'], ['p', 'preset'], ['t', 'tema'],
      ['s', 'salva'], ['?', 'tasti'], ['q', 'esci'],
    ];
    const text = pairs
      .map(([k, d]) => `${fg(t.accent)}${k}${RESET}${fg(t.fg)} ${d}${RESET}`)
      .join(`${fg(t.fg)}  ${RESET}`);
    return ` ${truncate(text, W - 2)}`;
  }

  /** Disegna un pannello sovrapposto al centro dello schermo. */
  #applyOverlay(lines, W, H) {
    const t = this.theme;
    const boxW = Math.min(Math.max(30, W - 8), 66);
    const content = this.overlay.render(boxW - 2);
    const boxH = Math.min(content.length + 2, H - 4);
    const boxed = panel({
      title: this.overlay.title,
      lines: content,
      width: boxW,
      height: boxH,
      color: fg(t.accent),
      titleColor: `${BOLD}${fg(t.accent)}`,
    });
    const top = Math.max(0, Math.floor((H - boxH) / 2));
    const left = Math.max(0, Math.floor((W - boxW) / 2));

    for (let i = 0; i < boxed.length; i++) {
      const row = top + i;
      if (row >= lines.length) lines[row] = '';
      const base = lines[row] || '';
      lines[row] = overlayInto(base, boxed[i], left, W);
    }
  }
}

// ------------------------------------------------------------- aiutanti

/** Sovrappone `patch` a `base` a partire dalla colonna `left`. */
function overlayInto(base, patch, left, width) {
  const head = pad(truncate(base, left), left);
  const patchLen = visibleLength(patch);
  const tailStart = left + patchLen;
  // Ricostruire la coda con i colori giusti non vale la candela: dopo un
  // pannello sovrapposto si riempie di spazi fino a fine riga.
  const tail = ' '.repeat(Math.max(0, width - tailStart));
  return `${head}${RESET}${patch}${RESET}${tail}`;
}

/** Titolo che scorre, con separatore, quando non ci sta tutto. */
function marquee(text, width, offset) {
  if (!width || text.length <= width) return text;
  const loop = `${text}   `;
  const shifted = loop.slice(offset % loop.length) + loop.slice(0, offset % loop.length);
  return shifted.slice(0, width);
}

function labelOf(key, value) {
  const param = PARAMS.find((p) => p.key === key);
  return param ? formatValue(param, value) : String(value);
}

/** Legge dalla configurazione solo le chiavi che sono davvero parametri. */
function pickOptions(config) {
  const out = {};
  for (const param of PARAMS) {
    if (config[param.key] !== undefined) out[param.key] = config[param.key];
  }
  return out;
}

function safeSize(path) {
  try {
    const bytes = statSync(path).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  } catch {
    return null;
  }
}
