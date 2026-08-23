/**
 * DitherBox - widget per il browser.
 *
 * Nessuna dipendenza, nessun accesso al DOM al momento dell'import: il modulo
 * si puo' importare anche in un contesto server (Astro SSR) senza esplodere,
 * perche' tutto quello che tocca il documento sta dentro il costruttore.
 *
 *   import { DitherBox } from './src/web/ditherbox.js';
 *   const box = new DitherBox('#dither');
 */

import {
  PARAMS, GROUP_LABELS, PRESETS, DEFAULTS,
  normalizeOptions, formatValue, applyPreset,
  processImage, fitWithin,
} from '../core/index.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  return node;
}

/** Sposta un valore al gradino di slider piu' vicino, evitando 0.30000000004. */
function snap(value, step) {
  const decimals = (String(step).split('.')[1] || '').length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/**
 * Legge un File/Blob/URL in un oggetto disegnabile, rispettando
 * l'orientamento EXIF: le foto da telefono arrivano quasi sempre ruotate.
 */
async function decodeSource(source) {
  if (typeof createImageBitmap === 'function' && (source instanceof Blob)) {
    try {
      return await createImageBitmap(source, { imageOrientation: 'from-image' });
    } catch {
      // Safari piu' vecchi non conoscono imageOrientation: si riprova liscio.
      try {
        return await createImageBitmap(source);
      } catch { /* si passa al percorso con <img> */ }
    }
  }
  const url = source instanceof Blob ? URL.createObjectURL(source) : source;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Immagine non leggibile'));
      img.src = url;
    });
    return img;
  } finally {
    if (source instanceof Blob) URL.revokeObjectURL(url);
  }
}

/** Estrae gli ImageData da una sorgente gia' decodificata. */
function toImageData(drawable) {
  const w = drawable.naturalWidth || drawable.width;
  const h = drawable.naturalHeight || drawable.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(drawable, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

export class DitherBox {
  /**
   * @param {HTMLElement|string} target elemento o selettore
   * @param {object} config
   * @param {object} [config.options]        opzioni iniziali (vedi PARAMS)
   * @param {number} [config.previewMaxSize] lato massimo usato per l anteprima
   * @param {boolean} [config.presets]       mostra la barra dei preset
   * @param {string}  [config.src]           immagine da caricare all avvio
   * @param {string}  [config.downloadName]  nome del file scaricato
   */
  constructor(target, config = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) throw new Error(`DitherBox: elemento non trovato (${target})`);

    this.root = root;
    this.config = {
      previewMaxSize: 900,
      presets: true,
      downloadName: 'ditherbox.png',
      ...config,
    };
    this.options = normalizeOptions(config.options);
    this.source = null;        // ImageData a piena risoluzione
    this.previewSource = null; // ImageData ridotto, per l anteprima interattiva
    this.sourceName = null;
    this.listeners = { change: [], load: [], error: [] };
    this.controls = new Map();
    this._pending = null;

    this.#build();
    if (config.src) this.load(config.src).catch((e) => this.#fail(e));
  }

  // ---------------------------------------------------------------- API

  /** Carica un File, un Blob o un URL. */
  async load(source, name) {
    this.#status('Carico…');
    try {
      const drawable = await decodeSource(source);
      this.source = toImageData(drawable);
      if (drawable.close) drawable.close();
      this.previewSource = fitWithin(this.source, this.config.previewMaxSize, this.config.previewMaxSize);
      this.sourceName = name || (source instanceof File ? source.name : null);
      this.root.classList.add('is-loaded');
      this.render();
      this.#emit('load', { width: this.source.width, height: this.source.height });
    } catch (err) {
      this.#fail(err);
      throw err;
    }
  }

  /** Aggiorna una o piu' opzioni e ridisegna. */
  set(patch) {
    this.options = normalizeOptions({ ...this.options, ...patch });
    this.#syncControls();
    this.render();
    this.#emit('change', this.getOptions());
  }

  getOptions() {
    return { ...this.options };
  }

  /** Torna ai valori di partenza. */
  reset() {
    this.set({ ...DEFAULTS, ...(this.config.options || {}) });
  }

  /** Ricalcola l anteprima. Debounced: gli slider sparano decine di eventi. */
  render() {
    if (!this.previewSource) return;
    if (this._pending) cancelAnimationFrame(this._pending);
    this._pending = requestAnimationFrame(() => {
      this._pending = null;
      this.#draw();
    });
  }

  /**
   * Elabora a piena risoluzione e restituisce il canvas del risultato.
   * L anteprima lavora ridotta; l export no.
   */
  renderFull() {
    if (!this.source) throw new Error('Nessuna immagine caricata');
    const { image } = processImage(this.source, this.options);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    return canvas;
  }

  /** @returns {Promise<Blob>} il PNG a piena risoluzione. */
  toBlob(type = 'image/png', quality) {
    const canvas = this.renderFull();
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Export fallito'))),
        type,
        quality,
      );
    });
  }

  /** Scarica il risultato come PNG. */
  async download(filename) {
    this.#status('Preparo il PNG…');
    const blob = await this.toBlob();
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = filename || this.#defaultFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.#status(null);
  }

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  }

  /** Smonta il widget e libera i listener globali. */
  destroy() {
    if (this._pending) cancelAnimationFrame(this._pending);
    for (const [event, fn] of this._globalListeners || []) {
      this.root.removeEventListener(event, fn);
    }
    this.root.replaceChildren();
    this.root.classList.remove('dbx', 'is-loaded', 'is-dragging');
  }

  // ------------------------------------------------------- costruzione UI

  #build() {
    const root = this.root;
    root.classList.add('dbx');
    root.replaceChildren();

    // --- palco con l anteprima -------------------------------------
    const stage = el('div', 'dbx__stage');
    this.canvas = el('canvas', 'dbx__canvas');
    this.ctx = this.canvas.getContext('2d');
    stage.appendChild(this.canvas);

    const drop = el('div', 'dbx__drop');
    drop.append(
      this.#dropIcon(),
      el('p', 'dbx__drop-title', { text: 'Trascina qui una foto' }),
      el('p', 'dbx__drop-sub', { text: 'oppure usa i pulsanti qui sotto — l’immagine non lascia il tuo browser' }),
    );
    stage.appendChild(drop);

    this.statusEl = el('div', 'dbx__status', { role: 'status', 'aria-live': 'polite' });
    stage.appendChild(this.statusEl);
    root.appendChild(stage);

    // --- pannello dei controlli ------------------------------------
    const panel = el('div', 'dbx__panel');

    if (this.config.presets) {
      const bar = el('div', 'dbx__presets');
      bar.appendChild(el('span', 'dbx__presets-label', { text: 'Preset' }));
      for (const [key, preset] of Object.entries(PRESETS)) {
        const b = el('button', 'dbx__preset', { type: 'button', text: preset.label });
        b.addEventListener('click', () => this.set(applyPreset(key, this.options)));
        bar.appendChild(b);
      }
      panel.appendChild(bar);
    }

    const groups = new Map();
    for (const param of PARAMS) {
      if (!groups.has(param.group)) {
        const section = el('section', 'dbx__group');
        section.appendChild(el('h3', 'dbx__group-title', {
          text: GROUP_LABELS[param.group] || param.group,
        }));
        groups.set(param.group, section);
        panel.appendChild(section);
      }
      groups.get(param.group).appendChild(this.#buildControl(param));
    }

    panel.appendChild(this.#buildActions());
    root.appendChild(panel);

    this.#wireDropZone();
    this.#syncControls();
  }

  #dropIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'dbx__drop-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    // Una macchina fotografica stilizzata, disegnata a mano per non
    // trascinarsi dietro un font di icone.
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linejoin', 'round');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '13');
    circle.setAttribute('r', '3.5');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '1.5');
    svg.append(path, circle);
    return svg;
  }

  #buildControl(param) {
    const id = `dbx-${param.key}-${Math.random().toString(36).slice(2, 7)}`;
    const wrap = el('div', `dbx__control dbx__control--${param.type}`);
    const label = el('label', 'dbx__label', { for: id, text: param.label });
    if (param.hint) label.title = param.hint;
    wrap.appendChild(label);

    let input;
    let value = null;

    if (param.type === 'enum') {
      input = el('select', 'dbx__select', { id });
      for (const v of param.values) {
        const opt = el('option', null, { value: v, text: (param.labels && param.labels[v]) || v });
        input.appendChild(opt);
      }
      input.addEventListener('change', () => this.set({ [param.key]: input.value }));
    } else if (param.type === 'bool') {
      input = el('input', 'dbx__checkbox', { id, type: 'checkbox' });
      input.addEventListener('change', () => this.set({ [param.key]: input.checked }));
    } else {
      input = el('input', 'dbx__range', {
        id, type: 'range', min: param.min, max: param.max, step: param.step,
      });
      value = el('output', 'dbx__value', { for: id });
      // `input` per l anteprima continua mentre si trascina.
      input.addEventListener('input', () => {
        this.set({ [param.key]: snap(Number(input.value), param.step) });
      });
      // Doppio clic sull etichetta: torna al default di quel parametro.
      label.addEventListener('dblclick', () => this.set({ [param.key]: param.default }));
    }

    if (param.hint) input.title = param.hint;
    wrap.appendChild(input);
    if (value) wrap.appendChild(value);

    this.controls.set(param.key, { param, input, value });
    return wrap;
  }

  #buildActions() {
    const actions = el('div', 'dbx__actions');

    this.fileInput = el('input', 'dbx__file', { type: 'file', accept: 'image/*' });
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files && this.fileInput.files[0];
      if (file) this.load(file).catch(() => {});
      this.fileInput.value = '';
    });

    this.cameraInput = el('input', 'dbx__file', {
      type: 'file', accept: 'image/*', capture: 'environment',
    });
    this.cameraInput.addEventListener('change', () => {
      const file = this.cameraInput.files && this.cameraInput.files[0];
      if (file) this.load(file).catch(() => {});
      this.cameraInput.value = '';
    });

    const open = el('button', 'dbx__button dbx__button--primary', { type: 'button', text: 'Apri foto' });
    open.addEventListener('click', () => this.fileInput.click());

    const shoot = el('button', 'dbx__button dbx__button--camera', { type: 'button', text: 'Scatta' });
    shoot.addEventListener('click', () => this.cameraInput.click());

    const save = el('button', 'dbx__button', { type: 'button', text: 'Scarica PNG' });
    save.addEventListener('click', () => this.download().catch((e) => this.#fail(e)));

    const reset = el('button', 'dbx__button dbx__button--ghost', { type: 'button', text: 'Azzera' });
    reset.addEventListener('click', () => this.reset());

    actions.append(open, shoot, save, reset, this.fileInput, this.cameraInput);
    this.saveButton = save;
    return actions;
  }

  #wireDropZone() {
    const root = this.root;
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const listeners = [
      ['dragenter', (e) => { stop(e); root.classList.add('is-dragging'); }],
      ['dragover', (e) => { stop(e); root.classList.add('is-dragging'); }],
      ['dragleave', (e) => {
        stop(e);
        if (!root.contains(e.relatedTarget)) root.classList.remove('is-dragging');
      }],
      ['drop', (e) => {
        stop(e);
        root.classList.remove('is-dragging');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          this.#fail(new Error('Quel file non è un’immagine'));
          return;
        }
        this.load(file).catch(() => {});
      }],
      ['paste', (e) => {
        const item = [...(e.clipboardData ? e.clipboardData.items : [])]
          .find((it) => it.type.startsWith('image/'));
        if (item) this.load(item.getAsFile()).catch(() => {});
      }],
    ];
    for (const [event, fn] of listeners) root.addEventListener(event, fn);
    this._globalListeners = listeners;
  }

  // ------------------------------------------------------------ interni

  #syncControls() {
    for (const [key, { param, input, value }] of this.controls) {
      const v = this.options[key];
      if (param.type === 'bool') input.checked = Boolean(v);
      else input.value = v;
      if (value) value.textContent = formatValue(param, v);
    }
  }

  #draw() {
    const started = performance.now();
    const { image } = processImage(this.previewSource, this.options);
    this.canvas.width = image.width;
    this.canvas.height = image.height;
    this.ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    const ms = Math.round(performance.now() - started);
    this.#status(
      `${this.source.width}×${this.source.height} · anteprima ${image.width}×${image.height} · ${ms} ms`,
    );
  }

  #defaultFilename() {
    const base = this.sourceName
      ? this.sourceName.replace(/\.[^.]+$/, '')
      : 'ditherbox';
    return `${base}-${this.options.palette}-${this.options.algorithm}.png`;
  }

  #status(text) {
    if (this.statusEl) this.statusEl.textContent = text || '';
  }

  #fail(err) {
    this.#status(`Errore: ${err.message}`);
    this.#emit('error', err);
  }

  #emit(event, payload) {
    for (const fn of this.listeners[event] || []) {
      try {
        fn(payload, this);
      } catch (e) {
        console.error('[DitherBox] listener in errore', e);
      }
    }
  }
}

/**
 * Funzione secca, per chi vuole solo ditherare un'immagine senza interfaccia.
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} drawable
 * @returns {HTMLCanvasElement}
 */
export function ditherToCanvas(drawable, options = {}) {
  const { image } = processImage(toImageData(drawable), options);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(
    new ImageData(image.data, image.width, image.height), 0, 0,
  );
  return canvas;
}

/**
 * Aggancia automaticamente ogni elemento con `data-ditherbox`.
 * Gli attributi `data-*` diventano opzioni: data-palette, data-algorithm, ...
 */
export function autoInit(scope = document) {
  const boxes = [];
  for (const node of scope.querySelectorAll('[data-ditherbox]')) {
    if (node.dataset.dbxReady) continue;
    node.dataset.dbxReady = '1';
    const options = {};
    for (const param of PARAMS) {
      const raw = node.dataset[param.key];
      if (raw === undefined) continue;
      if (param.type === 'range') options[param.key] = Number(raw);
      else if (param.type === 'bool') options[param.key] = raw !== 'false';
      else options[param.key] = raw;
    }
    boxes.push(new DitherBox(node, { options, src: node.dataset.src || undefined }));
  }
  return boxes;
}

export { PARAMS, PRESETS, DEFAULTS, processImage };
export default DitherBox;
