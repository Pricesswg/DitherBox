/**
 * Interfaccia a schermo intero, nello spirito di cliamp: pannelli bordati,
 * tema a sei colori, un display in alto con il titolo che scorre e il
 * visualizzatore, gli slider al posto dell'equalizzatore, la lista dei file
 * al posto della playlist.
 */

import { basename, dirname, resolve, join } from 'node:path';
import { statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PARAMS, PRESETS, DEFAULTS,
  normalizeOptions, formatValue, applyPreset, paramSteps, stepIndex, stepBy,
  usefulStepCeiling, effectiveMegapixels,
  groupLabel, paramLabel, paramHint, presetLabel, enumLabel,
  linkedDimensions,
  processImage, exportSize, resampleBox, isCustomPalette,
  aspectRatio, selectionFrame, targetSize, cropRect,
  createTranslator, normalizeLocale, LOCALES, LOCALE_NAMES,
} from '../core/index.js';

import {
  Screen, parseKey, panel, pad, padStart, center, truncate, visibleLength,
  bar, BLOCKS_V, fg, RESET, BOLD, DIM, REVERSE,
} from './term.js';
import {
  MODES, MODE_KEYS, modeLabel, cellTarget, renderImage,
  GUIDES, GUIDE_KEYS, guideLabel, makeGuide, dimOutside,
} from './preview.js';
import { loadThemes, loadConfig, DEFAULT_THEME } from './theme.js';
import { loadImage, saveImage, listImages, isSupported } from './imageio.js';
import { VERSION } from './version.js';

const STATUS_HEIGHT = 1;
const HELP_HEIGHT = 1;
const CONTROLS_WIDTH = 38;
const CONTROLS_MAX = 52;
const NARROW_WIDTH = 78;

/**
 * Tetto ai megapixel su cui elabora l'anteprima.
 *
 * L'anteprima ora ditherizza alla risoluzione di uscita, che su una foto da
 * ventiquattro megapixel vuol dire quasi due secondi a ogni tasto premuto.
 * Due megapixel stanno sotto i centocinquanta millisecondi, che e' il punto
 * in cui una interfaccia smette di sembrare che risponda.
 */
const MAX_PREVIEW_MP = 2;

/** Il gradino piu' alto dei megapixel: vale "non ridurre". */
const MEGAPIXEL_MAX = paramSteps(PARAMS.find((p) => p.key === 'megapixels')).at(-1);

/** Rotellina in braille: gira mentre un'operazione e' in corso. */
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const PARAM_BY_KEY_LOCAL = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

/**
 * La foto di prova che viene con il programma.
 *
 * Serve a chi lo apre per la prima volta in una cartella dove non ci sono
 * immagini: invece di una cornice vuota e un invito, si vede subito che
 * cosa fa. Il percorso e' relativo al modulo e non alla cartella di lavoro,
 * se no funzionerebbe solo lanciandolo da dentro il repo.
 */
export const SAMPLE_PATH = fileURLToPath(
  new URL('../../examples/sample.jpg', import.meta.url),
);

/** Elenco piatto dei parametri, con le intestazioni di gruppo intercalate. */
function buildRows() {
  const rows = [];
  let lastGroup = null;
  for (const param of PARAMS) {
    if (param.group !== lastGroup) {
      rows.push({ kind: 'group', group: param.group });
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

    // `tr` e non `t`: qui `t` e' gia' il tema dei colori in mezza dozzina
    // di metodi di disegno, e sovrapporre i due nomi sarebbe una trappola.
    this.locale = normalizeLocale(opts.lang || config.lang);
    this.tr = createTranslator(this.locale);

    this.options = normalizeOptions({ ...DEFAULTS, ...pickOptions(config), ...opts.options });
    // Predefinito i mezzi blocchi, non il braille: '▀' e' un blocco, largo
    // esattamente una cella in qualunque font. I glifi braille invece
    // mancano da parecchi font monospaziati, il terminale ripiega su un
    // altro font con avanzamento diverso e le colonne si sfalsano, con la
    // cornice che sembra rotta. Il braille resta a un tasto di distanza (v)
    // e da' molto piu' dettaglio dove il font lo regge.
    this.previewMode = opts.mode || config.mode || 'halfblock';
    this.oneToOne = false;
    this.panX = 50;
    this.panY = 50;
    this.guide = opts.guide || config.guide || 'red';
    if (!GUIDE_KEYS.includes(this.guide)) this.guide = 'red';
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
    this.job = null;          // operazione in corso, per la barra di avanzamento
    this.spinnerFrame = 0;

    this.source = null;
    this.sourceInfo = null;
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
      if (this.files.length) {
        await this.openImage(this.files[0]);
      } else if (existsSync(SAMPLE_PATH)) {
        // Aperta la foto di prova, ma senza infilarla nella lista dei file:
        // non sta in questa cartella e non deve comparire fra le immagini
        // su cui girare con n e N.
        await this.openImage(SAMPLE_PATH);
        this.#say(this.tr('tui.sample'), 'yellow');
      } else {
        this.#say(this.tr('tui.noImageHere'), 'yellow');
      }
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
        this.#say(this.tr('ui.error', { msg: err.message }), 'red');
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
    if (this.job) {
      this.spinnerFrame++;
      needs = true;
    }
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
    const nome = basename(path);
    this.#startJob(this.tr('tui.jobOpen', { name: nome }));
    try {
      await this.#jobStep(this.tr('tui.jobRead', { name: nome }), 0.2);
      const img = await loadImage(path);

      await this.#jobStep(this.tr('tui.jobPreview'), 0.75);
      this.source = { width: img.width, height: img.height, data: img.data };
      this.imagePath = path;
      this.sourceInfo = {
        format: img.format.toUpperCase(),
        bytes: safeSize(path),
      };
      this.cache = null;
      this.marqueeOffset = 0;
      const idx = this.files.indexOf(path);
      if (idx >= 0) this.fileIndex = idx;
    } finally {
      this.#endJob();
    }
    this.#say(this.tr('tui.loaded', {
      name: nome,
      size: `${this.source.width}×${this.source.height}`,
    }), 'green');
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
    if (name === '1') {
      this.oneToOne = !this.oneToOne;
      if (!this.oneToOne && this.focus === 'preview') this.focus = 'controls';
      this.cache = null;
      this.#say(this.tr(this.oneToOne ? 'tui.oneToOneOn' : 'tui.oneToOneOff'), 'accent');
      return this.render();
    }
    if (name === 'c') return this.#openGuidePicker();
    if (name === 't') return this.#openThemePicker();
    if (name === 'p') return this.#openPresetPicker();
    if (ctrl && name === 'l') return this.#openLanguagePicker();
    if (name === 'o') return this.#openPathPrompt();
    if (name === 's' || (ctrl && name === 's')) return this.#openSavePrompt();

    if (name === 'v') {
      const i = MODE_KEYS.indexOf(this.previewMode);
      this.previewMode = MODE_KEYS[(i + 1) % MODE_KEYS.length];
      this.cache = null;
      this.#say(this.tr('tui.previewMode', { name: modeLabel(this.previewMode, this.tr) }), 'accent');
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
      this.#say(this.tr('tui.reset'), 'yellow');
      return this.render();
    }

    if (name === 'i') return this.#setOption('invert', !this.options.invert);

    if (name === 'tab' || name === 'shifttab') {
      // L'anteprima entra nel giro solo a 1:1, che e' l'unico caso in cui
      // ci sia qualcosa da fare standoci sopra: spostare la finestra.
      const giro = ['controls'];
      if (this.oneToOne) giro.push('preview');
      if (this.showFiles && this.files.length) giro.push('files');
      const i = Math.max(0, giro.indexOf(this.focus));
      const passo = name === 'shifttab' ? -1 : 1;
      this.focus = giro[(i + passo + giro.length) % giro.length];
      return this.render();
    }

    if (name === 'n' && !ctrl) return this.#step(1);
    if (name === 'N') return this.#step(-1);

    if (this.focus === 'preview') {
      const passo = shift ? 25 : 5;
      switch (name) {
        case 'up': case 'k': return this.#pan(0, -passo);
        case 'down': case 'j': return this.#pan(0, passo);
        case 'left': case 'h': return this.#pan(-passo, 0);
        case 'right': case 'l': return this.#pan(passo, 0);
        case 'H': return this.#pan(-25, 0);
        case 'L': return this.#pan(25, 0);
        case 'home': case 'g': return this.#panTo(0, 0);
        case 'end': case 'G': return this.#panTo(100, 100);
        default: break;
      }
      return undefined;
    }

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
   * Sposta la finestra a 1:1 sul file, in percentuale della corsa
   * disponibile: 0 a un bordo, 100 all'altro. In percentuale e non in pixel
   * perche' la corsa cambia con la misura del riquadro e con quella del file,
   * e un passo in pixel su un file piccolo lo attraverserebbe tutto.
   */
  #pan(dx, dy) {
    return this.#panTo(this.panX + dx, this.panY + dy);
  }

  #panTo(x, y) {
    const stretto = (v) => Math.min(100, Math.max(0, v));
    this.panX = stretto(x);
    this.panY = stretto(y);
    this.cache = null;
    return this.render();
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

  /** L'ultimo gradino dei megapixel che cambi ancora qualcosa. */
  #megapixelCeiling(param) {
    const propri = (this.source.width * this.source.height) / 1e6;
    return usefulStepCeiling(param, propri);
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
    if (param.type === 'number') {
      const attuale = Math.round(Number(current) || 0);
      // Da "auto" il primo passo si posa sulla misura che il file ha adesso:
      // partire da dieci pixel non servirebbe a nessuno, e cosi' invece si
      // comincia da dove si e' e si aggiusta.
      if (attuale === 0) return this.#setOption(param.key, this.#autoDimension(param.key));
      const n = attuale + steps * param.step;
      return this.#setOption(param.key, Math.max(0, Math.min(param.max, n)));
    }

    // Gli stessi gradini che usa il cursore del widget: cosi' un passo di
    // tastiera qui e uno di mouse la' portano allo stesso valore.
    let prossimo = stepBy(param, current, steps);

    // Oltre la misura della foto i megapixel non fanno niente: il tasto
    // continuerebbe a rispondere senza che cambi nulla sullo schermo.
    if (param.key === 'megapixels' && this.source) {
      const passi = paramSteps(param);
      const tetto = passi[this.#megapixelCeiling(param)];
      if (prossimo > tetto) prossimo = tetto;
    }
    return this.#setOption(param.key, prossimo);
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
    if (param.type === 'number') return this.#openNumberPrompt(param);
    return undefined;
  }

  /**
   * La misura che il file ha adesso, per il lato chiesto. E' il valore da cui
   * conviene partire quando il campo e' su "auto".
   */
  #autoDimension(key) {
    if (!this.source) return 0;
    const { width, height } = exportSize(this.source.width, this.source.height, this.options);
    return key === 'width' ? width : height;
  }

  /**
   * Un campo per scrivere il numero, perche' 1920 con le frecce non si
   * raggiunge. Vuoto vuol dire "torna ad auto".
   */
  #openNumberPrompt(param) {
    const attuale = Math.round(Number(this.options[param.key]) || 0);
    this.#promptOverlay({
      title: this.tr('tui.numberPrompt', { name: paramLabel(param, this.tr) }),
      hint: paramHint(param, this.tr) || '',
      initial: attuale ? String(attuale) : '',
      onConfirm: (input) => {
        const scritto = String(input == null ? '' : input).trim();
        if (scritto === '') return this.#setOption(param.key, 0);
        const n = Number(scritto);
        if (!Number.isFinite(n)) {
          this.#say(this.tr('tui.notANumber'), 'red');
          return this.render();
        }
        return this.#setOption(param.key, Math.max(0, Math.min(param.max, Math.round(n))));
      },
    });
  }

  #setOption(key, value) {
    // Larghezza e altezza non sono indipendenti col rapporto bloccato:
    // scriverne una riempie l'altra. Si fa qui e non nei singoli comandi,
    // cosi' vale per le frecce come per il valore scritto a mano.
    const cambio = (key === 'width' || key === 'height') && this.source
      ? linkedDimensions(this.source.width, this.source.height, this.options, key, value)
      : { [key]: value };
    this.options = normalizeOptions({ ...this.options, ...cambio });
    this.cache = null;
    this.render();
  }

  // --------------------------------------------------------- sovrapposte

  #openHelp() {
    const lines = [
      ['↑ ↓  j k', 'move'],
      ['← →  h l', 'adjust'],
      ['H L  shift+← →', 'adjustBig'],
      ['enter  space', 'activate'],
      ['tab', 'focus'],
      ['n  N', 'step'],
      ['g  G  home  end', 'ends'],
      ['v', 'mode'],
      ['1', 'oneToOne'],
      ['tab  jk h l', 'pan'],
      ['c', 'guide'],
      ['t', 'theme'],
      ['p', 'preset'],
      ['ctrl+l', 'lang'],
      ['i', 'invert'],
      ['r', 'reset'],
      ['o', 'openPath'],
      ['s  ctrl+s', 'save'],
      ['ctrl+x', 'files'],
      ['?  ctrl+k', 'help'],
      ['q  ctrl+c', 'quit'],
    ].map(([k, id]) => [k, this.tr(`key.${id}`)]);
    this.overlay = {
      title: this.tr('tui.keys'),
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
      title: this.tr('tui.theme'),
      items: names.map((n) => ({ label: n, value: n })),
      initialIndex: names.indexOf(this.themeName),
      onPreview: (item) => { this.themeName = item.value; },
      onConfirm: (item) => {
        this.themeName = item.value;
        this.#say(this.tr('tui.themeSet', { name: item.value }), 'accent');
      },
      onCancel: () => { this.themeName = original; },
    });
  }

  /**
   * Il colore della cornice di inquadratura, spegnimento compreso.
   * Sotto 'g' non poteva stare: quello porta gia' a inizio e fine corsa.
   */
  #openGuidePicker() {
    const original = this.guide;
    const cambia = (v) => { this.guide = v; this.cache = null; };
    this.#listOverlay({
      title: this.tr('tui.guide'),
      items: GUIDE_KEYS.map((k) => ({ label: guideLabel(k, this.tr), value: k })),
      initialIndex: Math.max(0, GUIDE_KEYS.indexOf(this.guide)),
      onPreview: (item) => cambia(item.value),
      onConfirm: (item) => {
        cambia(item.value);
        this.#say(this.tr('tui.guideSet', { name: item.label }), 'accent');
      },
      onCancel: () => cambia(original),
    });
  }

  #openPresetPicker() {
    const keys = Object.keys(PRESETS);
    this.#listOverlay({
      title: this.tr('tui.preset'),
      items: keys.map((k) => ({ label: presetLabel(k, this.tr), value: k })),
      initialIndex: 0,
      onConfirm: (item) => {
        this.options = applyPreset(item.value, this.options);
        this.cache = null;
        this.#say(this.tr('tui.presetSet', { name: item.label }), 'green');
      },
    });
  }

  #openLanguagePicker() {
    const original = this.locale;
    this.#listOverlay({
      title: this.tr('tui.language'),
      items: LOCALES.map((code) => ({ label: LOCALE_NAMES[code], value: code })),
      initialIndex: LOCALES.indexOf(this.locale),
      // Anteprima dal vivo: scorrendo l'elenco l'interfaccia dietro cambia
      // lingua subito, cosi' si sceglie vedendo il risultato.
      onPreview: (item) => this.setLocale(item.value),
      onConfirm: (item) => {
        this.setLocale(item.value);
        this.#say(this.tr('tui.languageSet', { name: item.label }), 'accent');
      },
      onCancel: () => this.setLocale(original),
    });
  }

  /** Cambia la lingua dell'interfaccia. Pubblico: lo usano i test. */
  setLocale(code) {
    this.locale = normalizeLocale(code);
    this.tr = createTranslator(this.locale);
    return this.locale;
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
          `${fg(this.theme.fg)}${truncate(this.tr('tui.confirm'), w)}${RESET}`,
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
      title: this.tr('tui.open'),
      hint: this.tr('tui.openHint'),
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
            else this.#say(this.tr('tui.emptyFolder'), 'yellow');
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
    if (!this.source) return this.#say(this.tr('tui.noImageLoaded'), 'red');
    const base = basename(this.imagePath || 'ditherbox').replace(/\.[^.]+$/, '');
    const palette = isCustomPalette(this.options.palette) ? 'custom' : this.options.palette;
    // La foto di prova sta dentro il pacchetto installato, che con ogni
    // probabilita' non e' scrivibile e comunque non e' un posto dove
    // qualcuno vuole i propri file: in quel caso si propone la cartella
    // da cui il programma e' stato lanciato.
    const cartella = this.imagePath && this.imagePath !== SAMPLE_PATH
      ? dirname(this.imagePath)
      : this.dir;
    const suggested = join(cartella, `${base}-${palette}-${this.options.algorithm}.png`);
    this.#promptOverlay({
      title: this.tr('tui.save'),
      hint: this.tr('tui.saveHint'),
      initial: suggested,
      onConfirm: async (input) => {
        if (!input) return;
        const path = resolve(input.replace(/^~/, process.env.HOME || '~'));
        if (!isSupported(path)) {
          this.#say(this.tr('tui.onlyPngJpg'), 'red');
          return this.render();
        }
        this.#startJob(this.tr('tui.jobSave', { name: basename(path) }));
        try {
          await this.#jobStep(this.tr('tui.jobProcess'), 0.25);
          const { image } = processImage(this.source, this.options);

          const size = `${image.width}×${image.height}`;
          await this.#jobStep(this.tr('tui.jobWrite', { size }), 0.8);
          await saveImage(path, image);

          await this.#jobStep(this.tr('tui.jobDone'), 1);
          this.#endJob();
          this.#say(this.tr('tui.savedAs', { name: basename(path), size }), 'green');
        } catch (err) {
          this.#endJob();
          this.#say(this.tr('tui.saveFailed', { msg: err.message }), 'red');
        }
        this.render();
      },
    });
  }

  #say(text, kind = 'fg') {
    this.toast = { text, kind, until: Date.now() + 4000 };
  }

  // ------------------------------------------------ operazioni in corso

  /**
   * Segna l'inizio di un'operazione: da qui in poi la riga di stato
   * diventa la sua barra.
   */
  #startJob(label) {
    this.job = { label, fraction: 0, started: Date.now() };
    this.spinnerFrame = 0;
    this.toast = null;
  }

  /**
   * Avanza alla fase successiva e ridisegna.
   *
   * La pausa non e' un abbellimento: il passo dopo occupa la CPU per
   * secondi interi, e senza cedere il controllo il frame appena scritto
   * resterebbe in coda fino a operazione finita. La barra segue le fasi
   * vere, non un conto alla rovescia inventato: mentre una fase lavora
   * resta ferma dov'e', ed e' giusto cosi'.
   */
  async #jobStep(label, fraction) {
    if (!this.job) return;
    this.job.label = label;
    this.job.fraction = fraction;
    this.spinnerFrame++;
    this.render();
    await new Promise((r) => setImmediate(r));
  }

  #endJob() {
    this.job = null;
  }

  // ---------------------------------------------------------- disegno

  render() {
    if (!this.running) return;
    const W = this.screen.width;
    const H = this.screen.height;
    if (W < 40 || H < 12) {
      this.screen.draw([`${fg(this.theme.red)}${this.tr('tui.tooSmall')}${RESET}`]);
      return;
    }

    const layout = this.#layout(W, H);
    // Il centro va disegnato per primo: e' lui a riempire la cache
    // dell'anteprima, che poi l'intestazione legge per la riga di stato.
    const middle = this.#middle(W, layout);
    const lines = [this.#statusLine(W), ...middle];
    if (layout.fileHeight) lines.push(...this.#filePanel(W, layout.fileHeight));
    lines.push(this.#helpBar(W));

    if (this.overlay) this.#applyOverlay(lines, W, H);
    this.screen.draw(lines);
  }

  #layout(W, H) {
    const narrow = W < NARROW_WIDTH;
    let remaining = H - STATUS_HEIGHT - HELP_HEIGHT;

    // La lista compare solo se c'e' davvero qualcosa da scegliere: con una
    // sola immagine erano sei righe di cornice vuota sottratte all'anteprima.
    const wantFiles = this.showFiles && this.files.length > 1 && remaining >= 16 && !narrow;
    const fileHeight = wantFiles ? Math.min(7, Math.max(4, Math.floor(remaining * 0.22))) : 0;
    remaining -= fileHeight;
    const middleHeight = Math.max(3, remaining);

    let controlsWidth = narrow ? 0 : Math.min(CONTROLS_WIDTH, Math.floor(W * 0.45));
    let previewWidth = W - controlsWidth;

    // Il riquadro dell'anteprima si stringe sull'immagine invece di restare
    // largo quanto lo schermo. Con una foto verticale su un terminale largo
    // restava un vuoto enorme accanto a un'immagine schiacciata, e lo spazio
    // in piu' serve molto di piu' ai controlli.
    if (!narrow && this.source) {
      const celle = this.#previewCells(middleHeight - 2, previewWidth - 2);
      const voluto = celle + 4;
      if (voluto < previewWidth) {
        const massimo = Math.min(CONTROLS_MAX, Math.floor(W * 0.45));
        const extra = Math.min(previewWidth - voluto, Math.max(0, massimo - controlsWidth));
        controlsWidth += extra;
        previewWidth -= extra;
      }
    }

    return { narrow, controlsWidth, previewWidth, middleHeight, fileHeight };
  }

  /**
   * Quante colonne occuperebbe l'immagine dentro un riquadro alto `innerH`.
   * Serve a dimensionare il riquadro sull'immagine e non viceversa: quando
   * l'altezza e' il vincolo (le foto verticali) il conto si chiude in un
   * passaggio solo, perche' stringere la larghezza non cambia il risultato.
   */
  #previewCells(innerH, maxInnerW) {
    const m = MODES[this.previewMode];
    // Le misure d'uscita, non quelle della sorgente: con un rapporto
    // diverso da quello della foto il riquadro va dimensionato su come
    // sara' l'immagine, altrimenti resta largo per una forma che non c'e'.
    const uscita = exportSize(this.source.width, this.source.height, this.options);
    const t = cellTarget(
      uscita.width, uscita.height,
      Math.max(1, maxInnerW), Math.max(1, innerH), this.previewMode,
    );
    return Math.ceil(t.width / m.cx);
  }

  /**
   * Riga di stato: una sola riga, non un pannello.
   *
   * Prima qui c'era una cornice alta cinque righe con l'istogramma e il nome
   * del tema. Su un terminale da trentacinque righe si mangiava un settimo
   * dello spazio per dire cose che si vedono gia' altrove, e quello che ne
   * pativa era l'anteprima. Adesso la riga porta l'essenziale, e quando c'e'
   * un'operazione in corso diventa la sua barra di avanzamento.
   */
  #statusLine(W) {
    const t = this.theme;
    if (this.job) return this.#jobLine(W);

    if (this.toast) {
      const colore = t[this.toast.kind] || t.fg;
      return pad(`${fg(colore)}${truncate(this.toast.text, W - 1)}${RESET}`, W);
    }

    if (!this.source) {
      return pad(`${fg(t.fg)}${truncate(this.tr('tui.noImageHint'), W - 1)}${RESET}`, W);
    }

    const nome = basename(this.imagePath);
    const catena = [
      formatValue(PARAM_BY_KEY_LOCAL.palette, this.options.palette, this.tr),
      formatValue(PARAM_BY_KEY_LOCAL.algorithm, this.options.algorithm, this.tr),
      `${this.options.scale}x`,
    ].join(' · ');

    const anteprima = this.#previewResult();

    // Le voci della coda in ordine di importanza: su un terminale stretto
    // si lasciano cadere dall'ultima, invece di spremere il nome del file
    // fino a troncarlo a meta' parola.
    const facoltative = [
      `${this.source.width}×${this.source.height} → ${this.#exportSize()}`,
      anteprima
        ? this.tr('tui.previewShort', { size: `${anteprima.image.width}×${anteprima.image.height}` })
        : null,
      modeLabel(this.previewMode, this.tr).toLowerCase(),
    ].filter(Boolean);

    const NOME_MINIMO = 18;
    let coda = facoltative.join(' · ');
    while (facoltative.length
      && W - visibleLength(catena) - visibleLength(coda) - 6 < NOME_MINIMO) {
      facoltative.pop();
      coda = facoltative.join(' · ');
    }

    const spazioNome = Math.max(6, W - visibleLength(catena) - visibleLength(coda) - 6);
    this.marqueeText = nome;
    this.marqueeWidth = spazioNome;
    const titolo = marquee(nome, spazioNome, this.marqueeOffset);

    const sinistra = `${fg(t.green)}▶ ${RESET}${fg(t.accent)}${BOLD}${titolo}${RESET}`
      + `${fg(t.fg)}  ${catena}${RESET}`;
    const destra = coda ? `${fg(t.fg)}${coda}${RESET}` : '';
    const riempimento = Math.max(1, W - visibleLength(sinistra) - visibleLength(destra));
    return truncate(`${sinistra}${' '.repeat(riempimento)}${destra}`, W);
  }

  /** La stessa riga, mentre un'operazione e' in corso. */
  #jobLine(W) {
    const t = this.theme;
    const { label, fraction, started } = this.job;
    const rotella = SPINNER[this.spinnerFrame % SPINNER.length];
    const secondi = ((Date.now() - started) / 1000).toFixed(1);

    const testa = `${fg(t.accent)}${rotella} ${RESET}${fg(t.bright_fg)}${label}${RESET}`;
    const coda = `${fg(t.fg)}${secondi}s${RESET}`;
    const barW = Math.max(6, Math.min(24, W - visibleLength(testa) - visibleLength(coda) - 10));
    const percento = `${Math.round(fraction * 100)}%`.padStart(4);
    const barra = `${fg(t.green)}${bar(fraction, barW, '▰', '▱')}${RESET}`
      + `${fg(t.accent)} ${percento}${RESET}`;

    const riempimento = Math.max(1, W - visibleLength(testa) - visibleLength(barra) - visibleLength(coda) - 2);
    return truncate(`${testa}${' '.repeat(riempimento)}${barra}  ${coda}`, W);
  }

  #exportSize() {
    if (!this.source) return '—';
    const { width, height } = exportSize(
      this.source.width, this.source.height, this.options,
    );
    return `${width}×${height}`;
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

    const key = `${cols}x${rows}|${this.previewMode}|${this.guide}`
      + `|${this.oneToOne}|${this.panX},${this.panY}`
      + `|${this.imagePath}|${JSON.stringify(this.options)}`;
    if (this.cache && this.cache.key === key) return this.cache.result;

    // Si elabora alla risoluzione di uscita e poi si rimpicciolisce, che e'
    // esattamente quello che fa un visualizzatore aprendo il file salvato.
    //
    // Prima si faceva il contrario: ricampionare alla griglia del terminale
    // e ditherare li'. Cosi' una cella di dithering era grossa un carattere
    // mentre nel file e' grossa un pixel, e a 1x su due megapixel il file
    // usciva liscio dove l'anteprima era un mosaico. Sembrava rotto il
    // salvataggio; a mentire era l'anteprima.
    //
    // Ricampionare dopo il dithering qui non contraddice la regola di non
    // farlo mai: quella riguarda il file, e il motivo per cui vale e' che la
    // media dei pixel richiude i punti in grigio. E' precisamente cio' che
    // vogliamo riprodurre, perche' e' quello che vede chi guarda.
    const uscita = this.#exportResult();
    let image;
    if (this.oneToOne) {
      image = this.#oneToOneWindow(uscita.image, cols, rows);
    } else {
      const target = cellTarget(
        uscita.image.width, uscita.image.height, cols, rows, this.previewMode,
      );
      image = resampleBox(uscita.image, target.width, target.height);
    }

    const guide = this.#guideRect(uscita.image, image);
    // Fuori dal ritaglio c'e' quello che si sta buttando: spegnerlo lo dice
    // meglio di qualsiasi messaggio. Fuori dalle bande invece non c'e'
    // niente da buttare, e infatti quelle non si spengono.
    if (guide && this.options.fit === 'crop') dimOutside(image, guide);

    const result = { ...uscita, image, guide };
    this.cache = { key, result };
    return result;
  }

  /**
   * Una finestra sul file a risoluzione vera, presa dal centro.
   *
   * L'anteprima normale rimpicciolisce il file per farcelo stare, e la media
   * dei pixel richiude i punti del dithering in tinte piatte: e' quello che
   * si vede aprendo il file e rimpicciolendolo, non quello che si vede
   * guardandolo da vicino. Qui non si ricampiona: si ritaglia e basta, un
   * pixel del file per sotto-cella.
   *
   * In mezzi blocchi e in braille i pixel sono quadrati a schermo e il
   * rapporto e' quello vero. In quadranti e in ASCII la cella non e' quadrata
   * (`ratio` vale 2) e l'immagine risulta stretta: quei due modi correggono
   * le proporzioni allungando, e allungare vorrebbe dire ricampionare.
   */
  #oneToOneWindow(img, cols, rows) {
    const m = MODES[this.previewMode] || MODES.halfblock;
    const w = Math.min(img.width, Math.max(m.cx, cols * m.cx));
    const h = Math.min(img.height, Math.max(m.cy, rows * m.cy));
    return cropRect(img, {
      x: Math.round((img.width - w) * (this.panX / 100)),
      y: Math.round((img.height - h) * (this.panY / 100)),
      width: w,
      height: h,
    });
  }

  /**
   * Vero quando la cornice ha qualcosa da mostrare: o le proporzioni non sono
   * quelle della foto, o la selezione e' piu' piccola del massimo possibile.
   */
  #guideActive() {
    // A 1:1 quello che si vede e' gia' il file: non c'e' nessun fuori da
    // segnare, e una cornice cadrebbe sul bordo del riquadro.
    return !this.oneToOne
      && this.guide !== 'off'
      && (aspectRatio(this.options.aspect) !== null || this.options.zoom < 100);
  }

  /**
   * Il rettangolo da sovrapporre, in pixel dell'immagine d'anteprima.
   *
   * Col ritaglio l'anteprima e' la foto intera e la cornice e' la selezione,
   * calcolata con la stessa funzione che usa il motore. Con le bande la
   * selezione il motore l'ha gia' applicata, e quello che resta da segnare e'
   * dove finisce la fotografia e cominciano le bande.
   */
  #guideRect(uscita, mostrata) {
    if (!this.#guideActive()) return null;
    const dentro = this.options.fit === 'crop'
      ? selectionFrame(uscita.width, uscita.height, {
        ratio: aspectRatio(this.options.aspect),
        zoom: this.options.zoom,
        alignX: this.options.alignX,
        alignY: this.options.alignY,
      })
      : selectionFrame(uscita.width, uscita.height, {
        ratio: this.source.width / this.source.height,
        alignX: this.options.alignX,
        alignY: this.options.alignY,
      });

    // Il rettangolo si calcola sull'immagine d'uscita e poi si porta su
    // quella mostrata, che non ha le stesse proporzioni: cellTarget la
    // deforma del `ratio` della modalita', perche' una cella di terminale
    // e' alta il doppio di quanto e' larga. Calcolarlo direttamente sulla
    // mostrata dava una cornice che nei modi a ratio 2 non stava sul
    // contenuto.
    const sx = mostrata.width / uscita.width;
    const sy = mostrata.height / uscita.height;
    return {
      x: Math.round(dentro.x * sx),
      y: Math.round(dentro.y * sy),
      width: Math.max(1, Math.round(dentro.width * sx)),
      height: Math.max(1, Math.round(dentro.height * sy)),
    };
  }

  /**
   * L'immagine come verra' salvata.
   *
   * In cache per conto suo perche' non dipende dalla griglia: ridimensionare
   * il terminale non deve ridithera' nulla. La chiave contiene tutto quello
   * da cui il risultato dipende, quindi non c'e' niente da invalidare a mano.
   */
  #exportResult() {
    const { sorgente, opzioni } = this.#previewJob();
    const key = `${this.imagePath}|${sorgente.width}x${sorgente.height}|${JSON.stringify(opzioni)}`;
    if (this.exportCache && this.exportCache.key === key) return this.exportCache.result;
    const result = processImage(sorgente, opzioni);
    this.exportCache = { key, result };
    return result;
  }

  /** Ingresso pubblico per la suite di prova. */
  _previewJob() { return this.#previewJob(); }

  /**
   * Le opzioni con cui elaborare l'anteprima: quelle vere, con un tetto ai
   * megapixel perche' l'interfaccia resti reattiva.
   *
   * Il tetto da solo falserebbe la trama, che si misura in pixel: rimpicciolita
   * l'immagine di un fattore, va rimpicciolito dello stesso fattore anche
   * Pixel, o i blocchi risultano piu' grossi di quanto saranno nel file.
   * Sotto 1 non si scende, ed e' li' che il tetto smette di essere fedele:
   * a quel punto pero' un blocco e' gia' molto piu' piccolo di una cella e
   * la differenza non arriva all'occhio.
   */
  #previewJob() {
    const o = this.options;
    // Con la cornice accesa e il ritaglio attivo l'anteprima mostra la foto
    // intera: una cornice disegnata sull'immagine gia' ritagliata cadrebbe
    // esattamente sul bordo, e non direbbe niente a nessuno.
    const intera = this.#guideActive() && o.fit === 'crop';

    let sorgente = this.source;
    let opzioni = o;

    if (intera) {
      // Non basta togliere il ritaglio dalle opzioni. Il tetto dei megapixel
      // si applicherebbe alla foto intera invece che alla selezione, e la
      // selezione uscirebbe piu' piccola di quanto sara' nel file: stessi
      // blocchi di dithering su meno pixel di soggetto vuol dire trama piu'
      // grossa, e l'anteprima prometterebbe un effetto che il file non ha.
      //
      // Si riduce quindi la foto intera del fattore esatto che il file
      // applica alla selezione, e dentro il motore la riduzione si spegne.
      const sel = selectionFrame(this.source.width, this.source.height, {
        ratio: aspectRatio(o.aspect),
        zoom: o.zoom,
        alignX: o.alignX,
        alignY: o.alignY,
      });
      const { scale } = targetSize(sel.width, sel.height, o.megapixels);
      if (scale < 1) {
        sorgente = resampleBox(
          this.source, this.source.width * scale, this.source.height * scale,
        );
      }
      opzioni = { ...o, aspect: 'source', zoom: 100, megapixels: MEGAPIXEL_MAX };
    }

    // Tetto ai megapixel perche' l'interfaccia resti reattiva. Il tetto da
    // solo falserebbe la trama, che si misura in pixel: rimpicciolita
    // l'immagine di un fattore, va rimpicciolito dello stesso fattore anche
    // Pixel, o i blocchi risultano piu' grossi di quanto saranno nel file.
    // Sotto 1 non si scende, ed e' li' che il tetto smette di essere fedele:
    // a quel punto pero' un blocco e' gia' molto piu' piccolo di una cella e
    // la differenza non arriva all'occhio.
    const lavoro = intera
      ? (sorgente.width * sorgente.height) / 1e6
      : effectiveMegapixels(this.source.width, this.source.height, o.megapixels);
    // A 1:1 il tetto non si applica: rimpicciolire l'immagine cambierebbe
    // proprio i pixel che si e' chiesto di vedere. Su una foto enorme si
    // paga in attesa, ed e' il prezzo dichiarato di quel modo.
    if (!this.oneToOne && lavoro > MAX_PREVIEW_MP) {
      const lineare = Math.sqrt(MAX_PREVIEW_MP / lavoro);
      opzioni = {
        ...opzioni,
        megapixels: MAX_PREVIEW_MP,
        scale: Math.max(1, Math.round(o.scale * lineare)),
      };
    }
    return { sorgente, opzioni };
  }

  #previewPanel(W, H) {
    const t = this.theme;
    const inner = W - 2;
    const innerH = H - 2;
    let body;

    if (!this.source) {
      body = [
        '',
        center(`${fg(t.fg)}${this.tr('tui.noImageLoaded')}${RESET}`, inner),
        '',
        center(`${fg(t.accent)}o${RESET}${fg(t.fg)} ${this.tr('bar.open')} · ${RESET}`
          + `${fg(t.accent)}?${RESET}${fg(t.fg)} ${this.tr('bar.keys')}${RESET}`, inner),
      ];
    } else {
      const result = this.#previewResult(inner, innerH);
      const cornice = result.guide
        ? makeGuide(result.guide, this.previewMode, GUIDES[this.guide])
        : null;
      const picture = renderImage(result.image, this.previewMode, t, cornice);
      // Centra il disegno nel pannello: un'immagine incollata in alto a
      // sinistra dentro una cornice grande fa un effetto sciatto.
      const padTop = Math.max(0, Math.floor((innerH - picture.length) / 2));
      body = [];
      for (let i = 0; i < padTop; i++) body.push('');
      for (const line of picture) body.push(center(line, inner));
    }

    const active = this.focus === 'preview';
    return panel({
      title: this.tr('tui.preview'),
      lines: body,
      width: W,
      height: H,
      color: fg(active ? t.accent : t.fg),
      titleColor: fg(active ? t.accent : t.fg),
    });
  }

  #controlsPanel(W, H) {
    const t = this.theme;
    const inner = W - 2;
    const innerH = H - 2;
    const active = this.focus === 'controls';

    const rendered = this.rows.map((row, i) => {
      if (row.kind === 'group') {
        return `${fg(t.fg)}${DIM}${pad(groupLabel(row.group, this.tr), inner)}${RESET}`;
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
      title: `${this.tr('tui.controls')}${rendered.length > innerH ? ` ${start + 1}/${rendered.length}` : ''}`,
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
    // Il numero accanto e' quello che si otterra', non quello che si e'
    // chiesto: su una foto da 0.76 MP scrivere "8 MP" sarebbe falso.
    const mostrato = param.key === 'megapixels' && this.source
      ? effectiveMegapixels(this.source.width, this.source.height, value)
      : value;
    const valueText = formatValue(param, mostrato, this.tr);

    let line;
    if (param.type === 'range') {
      // La posizione segue l'indice del passo, non il valore: su una scala a
      // gradini scelti a mano come i megapixel il rapporto grezzo
      // schiaccerebbe tutta la meta' bassa contro il bordo sinistro.
      //
      // E per i megapixel la barra si ferma dove la foto finisce: chiederne
      // piu' di quanti ne ha non cambia niente, e una barra che continua a
      // riempirsi senza che il risultato cambi e' una barra che mente.
      const passi = paramSteps(param);
      const ultimo = param.key === 'megapixels' && this.source
        ? this.#megapixelCeiling(param)
        : passi.length - 1;
      const ratio = ultimo > 0
        ? Math.min(1, stepIndex(param, value) / ultimo)
        : 0;
      const barW = Math.max(4, width - labelW - valueW - 4);
      line = `${marker} ${pad(paramLabel(param, this.tr), labelW)}`
        + `${fg(t.accent)}${bar(ratio, barW, '▰', '▱')}${RESET} `
        + `${fg(t.accent)}${padStart(valueText, valueW)}${RESET}`;
    } else if (param.type === 'bool') {
      // Il riquadro da' il colpo d'occhio, ON/OFF resta leggibile anche
      // su un terminale che non fa colori.
      const box = value ? `${fg(t.green)}[■]${RESET}` : `${fg(t.fg)}[ ]${RESET}`;
      line = `${marker} ${pad(paramLabel(param, this.tr), labelW)}${box} ${fg(t.accent)}${valueText}${RESET}`;
    } else {
      const room = width - labelW - 7;
      line = `${marker} ${pad(paramLabel(param, this.tr), labelW)}${fg(t.fg)}◄${RESET} `
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
      title: `${this.tr('tui.files')} ${this.files.length ? this.fileIndex + 1 : 0}/${this.files.length}`
        + ` · ${truncate(basename(this.dir) || this.dir, 18)}`,
      lines: body,
      width: W,
      height: H,
      color: fg(active ? t.accent : t.fg),
      titleColor: fg(active ? t.accent : t.fg),
    });
  }

  /**
   * La riga dei tasti in fondo.
   *
   * Prima era una lista fissa tagliata a misura, e tagliare da destra si
   * portava via per prime le due voci che servono di piu' a chi e' in
   * difficolta': i tasti e l'uscita. Ora le voci si lasciano cadere dal
   * fondo finche' la riga non ci sta, e quelle due restano sempre.
   */
  #helpBar(W) {
    const t = this.theme;
    // Col fuoco sull'anteprima gli stessi tasti spostano invece di regolare,
    // e la riga deve dirlo, altrimenti si preme h e non succede quello che
    // c'e' scritto.
    const voci = this.focus === 'preview'
      ? [['jk hl', 'pan'], ['tab', 'focus'], ['1', 'oneToOne'], ['v', 'preview']]
      : [
        ['jk', 'move'], ['hl', 'adjust'], ['tab', 'focus'],
        ['1', 'oneToOne'], ['v', 'preview'], ['c', 'guide'],
        ['p', 'preset'], ['t', 'theme'], ['ctrl+l', 'lang'], ['s', 'save'],
      ];
    const sempre = [['?', 'keys'], ['q', 'quit']];

    const disegna = (coppie) => coppie
      .map(([k, id]) => `${fg(t.accent)}${k}${RESET}${fg(t.fg)} ${this.tr(`bar.${id}`)}${RESET}`)
      .join(`${fg(t.fg)}  ${RESET}`);

    // La versione sta a destra e solo se avanza spazio: i tasti valgono
    // piu' di lei.
    const versione = `${fg(t.fg)}${DIM}ditherbox ${VERSION}${RESET}`;
    for (let n = voci.length; n >= 0; n--) {
      const riga = disegna([...voci.slice(0, n), ...sempre]);
      const largo = visibleLength(riga);
      const spazio = W - 2 - largo - visibleLength(versione);
      if (spazio >= 2) return ` ${riga}${' '.repeat(spazio)}${versione} `;
      if (largo <= W - 2) return ` ${riga}`;
    }
    return ` ${truncate(disegna(sempre), W - 2)}`;
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
