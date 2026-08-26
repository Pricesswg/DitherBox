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
  PARAMS, PRESETS, DEFAULTS, PALETTES, linkedDimensions,
  normalizeOptions, formatValue, applyPreset, paramSteps, stepIndex, usefulStepCeiling, effectiveMegapixels,
  groupLabel, paramLabel, paramHint, presetLabel, paletteLabel, enumLabel,
  processImage, exportSize, requestedSize, targetSize, resampleBox, fitWithin,
  paletteInfo, rgbToHex, stringifyPalette, isCustomPalette,
  imageToText, TEXT_MODES,
  createTranslator, detectLocale, normalizeLocale, LOCALES, LOCALE_NAMES,
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
      img.onerror = () => reject(new Error('unreadable'));
      img.src = url;
    });
    return img;
  } finally {
    if (source instanceof Blob) URL.revokeObjectURL(url);
  }
}

/**
 * Il nome da mostrare nel campo in cima.
 *
 * Da un File si legge; da un URL si prende l'ultimo pezzo del percorso,
 * se no una foto precaricata comparirebbe come "nessun file scelto"
 * mentre la si sta guardando.
 */
function nomeDellaSorgente(source) {
  if (source instanceof File) return source.name;
  if (typeof source !== 'string') return null;
  try {
    const percorso = new URL(source, document.baseURI).pathname;
    return decodeURIComponent(percorso.split('/').pop()) || null;
  } catch {
    return source.split(/[?#]/)[0].split('/').pop() || null;
  }
}

/**
 * Scrive negli appunti. L'API moderna esiste solo in contesto sicuro
 * (https o localhost); altrove si ripiega sulla selezione di un campo
 * nascosto, che e' brutta ma funziona da vent'anni.
 */
async function scriviNegliAppunti(testo) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(testo);
      return true;
    }
  } catch { /* si prova il ripiego */ }

  try {
    const area = document.createElement('textarea');
    area.value = testo;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    const esito = document.execCommand('copy');
    area.remove();
    return esito;
  } catch {
    return false;
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
   * @param {'dark'|'light'} [config.theme]  impone lo schema invece di
   *   seguire le preferenze del sistema: serve ai siti che vivono di un
   *   solo schema e non devono ribaltarsi addosso al visitatore.
   * @param {string} [config.lang]  lingua dell'interfaccia (en, it, es, fr,
   *   de). Senza indicazione si guarda quella del browser, e se non e' fra
   *   queste si parla inglese.
   * @param {boolean} [config.languagePicker=true] mostra il selettore.
   */
  constructor(target, config = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) throw new Error(`DitherBox: elemento non trovato (${target})`);

    this.root = root;
    this.config = {
      previewMaxSize: 900,
      presets: true,
      languagePicker: true,
      downloadName: 'ditherbox.png',
      ...config,
    };
    this.locale = config.lang ? normalizeLocale(config.lang) : detectLocale();
    this.t = createTranslator(this.locale);
    this.view = 'image';           // image | ascii | braille
    this.textCols = 100;
    this.options = normalizeOptions(config.options);
    this.source = null;        // ImageData a piena risoluzione
    this.previewBase = null;   // copia ridotta, base di tutte le anteprime
    this.previewCache = null;  // { megapixels, image } per non ricampionare a vuoto
    this.sourceName = null;
    this.listeners = { change: [], load: [], error: [] };
    this.controls = new Map();
    this.customColors = ['#0a0c10', '#c2fe0b'];
    this._pending = null;

    this.#build();
    if (config.src) {
      // Una foto precaricata e' una comodita', non qualcosa che chi guarda
      // ha chiesto: se non arriva (percorso sbagliato, oppure la pagina
      // aperta da disco invece che da un server, dove il browser blocca la
      // richiesta) si resta sul riquadro vuoto invece di aprire la giornata
      // con un errore rosso. `load` ha gia' segnalato il guasto per conto suo.
      this.load(config.src).catch(() => {
        this.#status(this.t('ui.noImage'));
      });
    }
  }

  // ---------------------------------------------------------------- API

  /** Carica un File, un Blob o un URL. */
  async load(source, name) {
    const t = this.t;
    this.#status(t('ui.loading'));
    try {
      const drawable = await decodeSource(source);
      this.source = toImageData(drawable);
      if (drawable.close) drawable.close();
      // Base dell'anteprima: si calcola una volta sola al caricamento, cosi'
      // muovere un cursore non costa mai un ricampionamento della foto intera.
      this.previewBase = fitWithin(
        this.source, this.config.previewMaxSize, this.config.previewMaxSize,
      );
      this.previewCache = null;
      this.sourceName = name || nomeDellaSorgente(source);
      this.root.classList.add('is-loaded');
      if (this.fileName) this.fileName.textContent = this.sourceName || t('ui.noFile');
      // Il limite utile dei megapixel dipende dalla foto: cambiata la foto,
      // vanno rifatti i conti sul cursore.
      this.#syncControls();
      this.render();
      this.#emit('load', { width: this.source.width, height: this.source.height });
    } catch (err) {
      this.#fail(err);
      throw err;
    }
  }

  /** Aggiorna una o piu' opzioni e ridisegna. */
  set(patch) {
    this.options = normalizeOptions({ ...this.options, ...this.#collega(patch) });
    this.#syncControls();
    this.render();
    this.#emit('change', this.getOptions());
  }

  /**
   * Larghezza e altezza non sono indipendenti col rapporto bloccato:
   * scriverne una riempie l'altra. Lo stesso conto lo fa la TUI, dalla
   * stessa funzione: due versioni si scostano, e il campo riempito qui non
   * corrisponderebbe a quello riempito la'.
   */
  #collega(patch) {
    if (!this.source) return patch;
    const lato = ['width', 'height'].find((k) => k in patch);
    if (!lato) return patch;
    return {
      ...patch,
      ...linkedDimensions(this.source.width, this.source.height, this.options, lato, patch[lato]),
    };
  }

  getOptions() {
    return { ...this.options };
  }

  /** Cambia la lingua dell'interfaccia e ridisegna i controlli. */
  setLocale(locale) {
    const nuova = normalizeLocale(locale);
    if (nuova === this.locale) return;
    this.locale = nuova;
    this.t = createTranslator(nuova);
    // I controlli portano il testo dentro: si ricostruiscono invece di
    // rincorrere ogni etichetta. Lo stato sta tutto in this.options.
    this.controls.clear();
    this.#build();
    this.render();
    this.#emit('change', this.getOptions());
  }

  getLocale() {
    return this.locale;
  }

  /** Passa fra immagine, ASCII e braille. */
  setView(view) {
    this.view = ['ascii', 'braille'].includes(view) ? view : 'image';
    this.#syncView();
    this.render();
  }

  getView() {
    return this.view;
  }

  /** Il testo della vista corrente, anche senza cambiare vista. */
  toText(mode = this.view === 'image' ? 'ascii' : this.view) {
    if (!this.source) throw new Error(this.t('ui.noImage'));
    return imageToText(this.source, { ...this.options, mode, cols: this.textCols });
  }

  /**
   * Copia negli appunti il testo della vista.
   *
   * `navigator.clipboard` non c'e' fuori dai contesti sicuri e in qualche
   * browser vecchio: in quel caso si ripiega sulla vecchia selezione di un
   * campo nascosto, che funziona ovunque.
   */
  async copyText() {
    let testo;
    try {
      testo = this.toText();
    } catch (err) {
      this.#fail(err);
      return false;
    }
    const riuscito = await scriviNegliAppunti(testo);
    this.#flashCopy(riuscito);
    return riuscito;
  }

  /** Torna ai valori di partenza. */
  reset() {
    this.set({ ...DEFAULTS, ...(this.config.options || {}) });
  }

  /** Ricalcola l anteprima. Debounced: gli slider sparano decine di eventi. */
  render() {
    if (!this.source) return;
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
    if (!this.source) throw new Error(this.t('ui.noImage'));
    const { image } = processImage(this.source, this.options);
    return this.#toCanvas(image);
  }

  /** @returns {Promise<Blob>} il PNG a piena risoluzione. */
  toBlob(type = 'image/png', quality) {
    const canvas = this.renderFull();
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error(this.t('ui.exportFailed')))),
        type,
        quality,
      );
    });
  }

  /** Scarica il risultato come PNG. */
  async download(filename) {
    this.#status(this.t('ui.preparing'));
    const blob = await this.toBlob();
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = filename || this.#defaultFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.render();
  }

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  }

  /** Smonta il widget e libera i listener. */
  destroy() {
    if (this._pending) cancelAnimationFrame(this._pending);
    for (const [event, fn] of this._rootListeners || []) {
      this.root.removeEventListener(event, fn);
    }
    this.root.replaceChildren();
    this.root.classList.remove('dbx', 'is-loaded', 'is-dragging');
    if (this.config.theme) this.root.removeAttribute('data-theme');
  }

  // ------------------------------------------------------- costruzione UI

  #build() {
    const root = this.root;
    root.classList.add('dbx');
    if (this.config.theme) root.setAttribute('data-theme', this.config.theme);
    root.replaceChildren();

    root.append(this.#buildStage(), this.#buildPanel());
    this.#wireDropZone();
    this.#syncControls();
    this.#syncView();
  }

  #buildStage() {
    const t = this.t;
    const stage = el('div', 'dbx__stage');

    // Barra delle viste: immagine, oppure la stessa foto scritta coi
    // caratteri. Sta sopra il contenuto invece che sovrapposta, cosi' non
    // copre mai un angolo dell'immagine.
    stage.appendChild(this.#buildViewBar());

    const area = el('div', 'dbx__area');
    this.canvas = el('canvas', 'dbx__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.textPane = el('pre', 'dbx__text', { tabindex: '0', 'aria-label': t('ui.textHint') });
    this.textPane.hidden = true;
    area.append(this.canvas, this.textPane);

    const drop = el('div', 'dbx__drop');
    const invito = el('button', 'dbx__drop-button', {
      type: 'button', text: t('ui.dropButton'),
    });
    invito.addEventListener('click', () => this.fileInput.click());
    drop.append(
      this.#cameraIcon(),
      el('p', 'dbx__drop-title', { text: t('ui.dropTitle') }),
      invito,
      el('p', 'dbx__drop-sub', { text: t('ui.dropHint') }),
    );
    area.appendChild(drop);
    stage.appendChild(area);

    this.statusEl = el('div', 'dbx__status', { role: 'status', 'aria-live': 'polite' });
    stage.appendChild(this.statusEl);
    return stage;
  }

  /** Le tre viste, piu' i comandi che servono solo a quelle testuali. */
  #buildViewBar() {
    const t = this.t;
    const bar = el('div', 'dbx__viewbar');

    this.viewButtons = new Map();
    const viste = [
      ['image', t('ui.viewImage')],
      ['ascii', t('mode.ascii')],
      ['braille', t('mode.braille')],
    ];
    const gruppo = el('div', 'dbx__views', { role: 'tablist', 'aria-label': t('ui.view') });
    for (const [chiave, etichetta] of viste) {
      const b = el('button', 'dbx__view', {
        type: 'button', role: 'tab', text: etichetta,
      });
      b.addEventListener('click', () => this.setView(chiave));
      gruppo.appendChild(b);
      this.viewButtons.set(chiave, b);
    }
    bar.appendChild(gruppo);

    // Comandi della vista testo: quante colonne, e il pulsante per copiare.
    this.textTools = el('div', 'dbx__texttools');

    const etichettaCol = el('label', 'dbx__viewlabel', { text: t('ui.columns') });
    this.colsInput = el('input', 'dbx__cols', {
      type: 'range', min: 20, max: 200, step: 4, value: String(this.textCols),
    });
    this.colsValue = el('output', 'dbx__viewvalue', { text: String(this.textCols) });
    this.colsInput.addEventListener('input', () => {
      this.textCols = Number(this.colsInput.value);
      this.colsValue.textContent = String(this.textCols);
      this.render();
    });
    etichettaCol.appendChild(this.colsInput);

    this.copyButton = el('button', 'dbx__button dbx__button--copy', {
      type: 'button', text: t('ui.copy'),
    });
    this.copyButton.addEventListener('click', () => this.copyText());

    this.textTools.append(etichettaCol, this.colsValue, this.copyButton);
    bar.appendChild(this.textTools);
    return bar;
  }

  /**
   * Il pannello e' diviso in tre fasce: la sorgente in cima e le azioni in
   * fondo restano sempre visibili, solo i parametri scorrono. Prima scorreva
   * tutto, e su schermi bassi il pulsante per aprire la foto finiva sotto il
   * taglio: c'era, ma nessuno lo trovava.
   */
  #buildPanel() {
    const panel = el('div', 'dbx__panel');
    panel.append(this.#buildSourceBar(), this.#buildScroller(), this.#buildActions());
    return panel;
  }

  #buildSourceBar() {
    const t = this.t;
    const bar = el('div', 'dbx__source');

    // Il campo file vero, dentro una label: cosi' il clic funziona su tutta
    // la riga e la tastiera ci arriva senza trucchi.
    const field = el('label', 'dbx__file-field');
    this.fileInput = el('input', 'dbx__file-input', { type: 'file', accept: 'image/*' });
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files && this.fileInput.files[0];
      if (file) this.load(file).catch(() => {});
      this.fileInput.value = '';
    });
    this.fileName = el('span', 'dbx__file-name', { text: t('ui.noFile') });
    field.append(
      this.fileInput,
      el('span', 'dbx__file-label', { text: t('ui.open') }),
      this.fileName,
    );
    bar.appendChild(field);

    this.cameraInput = el('input', 'dbx__file-input', {
      type: 'file', accept: 'image/*', capture: 'environment',
    });
    this.cameraInput.addEventListener('change', () => {
      const file = this.cameraInput.files && this.cameraInput.files[0];
      if (file) this.load(file).catch(() => {});
      this.cameraInput.value = '';
    });
    const shoot = el('button', 'dbx__button dbx__button--camera', {
      type: 'button', text: t('ui.shoot'), title: t('ui.shoot'),
    });
    shoot.addEventListener('click', () => this.cameraInput.click());
    bar.append(shoot, this.cameraInput);

    if (this.config.languagePicker) {
      const scelta = el('select', 'dbx__lang', { 'aria-label': t('ui.language'), title: t('ui.language') });
      for (const l of LOCALES) {
        scelta.appendChild(el('option', null, { value: l, text: LOCALE_NAMES[l] }));
      }
      scelta.value = this.locale;
      scelta.addEventListener('change', () => this.setLocale(scelta.value));
      bar.appendChild(scelta);
    }

    return bar;
  }

  #buildScroller() {
    const t = this.t;
    const scroller = el('div', 'dbx__scroll');

    if (this.config.presets) {
      scroller.appendChild(this.#buildSection(t('ui.presets'), this.#buildPresetChips()));
    }
    scroller.appendChild(this.#buildSection(t('ui.colours'), this.#buildPaletteChips()));

    const groups = new Map();
    for (const param of PARAMS) {
      // La palette ha gia' il suo selettore a campioni qui sopra.
      if (param.key === 'palette') continue;
      if (!groups.has(param.group)) {
        const body = el('div', 'dbx__controls');
        groups.set(param.group, body);
        scroller.appendChild(this.#buildSection(groupLabel(param.group, t), body));
      }
      groups.get(param.group).appendChild(this.#buildControl(param));
    }
    return scroller;
  }

  #buildSection(title, body) {
    const section = el('section', 'dbx__group');
    section.append(el('h3', 'dbx__group-title', { text: title }), body);
    return section;
  }

  #buildPresetChips() {
    const t = this.t;
    const bar = el('div', 'dbx__chips');
    for (const key of Object.keys(PRESETS)) {
      const b = el('button', 'dbx__chip', { type: 'button', text: presetLabel(key, t) });
      b.addEventListener('click', () => this.set(applyPreset(key, this.options)));
      bar.appendChild(b);
    }
    return bar;
  }

  /**
   * Selettore delle palette a campioni di colore: un elenco a discesa non
   * dice niente, mentre qui si sceglie guardando le tinte.
   */
  #buildPaletteChips() {
    const t = this.t;
    const wrap = el('div', 'dbx__palettes');
    // La palette ha il suo selettore a campioni invece del controllo
    // generico, ma resta un parametro come gli altri e si marca uguale.
    wrap.dataset.param = 'palette';
    this.paletteButtons = new Map();

    const aggiungi = (key, label, colors) => {
      const b = el('button', 'dbx__palette', { type: 'button', title: label });
      const swatch = el('span', 'dbx__swatch');
      for (const c of colors.slice(0, 8)) {
        const dot = el('span', 'dbx__swatch-dot');
        dot.style.background = typeof c === 'string' ? c : rgbToHex(c);
        swatch.appendChild(dot);
      }
      b.append(swatch, el('span', 'dbx__palette-name', { text: label }));
      b.addEventListener('click', () => this.set({ palette: key }));
      wrap.appendChild(b);
      this.paletteButtons.set(key, b);
      return b;
    };

    for (const [key, entry] of Object.entries(PALETTES)) {
      aggiungi(key, paletteLabel(key, t), entry.colors);
    }

    // Voce personalizzata: si aggiorna insieme all'editor qui sotto.
    this.customButton = aggiungi('__custom__', t('palette.custom'), this.customColors);
    this.customButton.addEventListener('click', () => {
      this.set({ palette: stringifyPalette(this.customColors) });
    });

    wrap.appendChild(this.#buildCustomEditor());
    return wrap;
  }

  /** Editor della palette personalizzata: una fila di selettori colore. */
  #buildCustomEditor() {
    const t = this.t;
    const editor = el('div', 'dbx__custom');
    this.customList = el('div', 'dbx__custom-list');

    const ridisegna = () => {
      this.customList.replaceChildren();
      this.customColors.forEach((colore, i) => {
        const cella = el('span', 'dbx__custom-cell');
        const input = el('input', 'dbx__custom-color', { type: 'color', value: colore });
        input.addEventListener('input', () => {
          this.customColors[i] = input.value;
          this.#refreshCustomSwatch();
          this.set({ palette: stringifyPalette(this.customColors) });
        });
        cella.appendChild(input);

        if (this.customColors.length > 2) {
          const togli = el('button', 'dbx__custom-remove', {
            type: 'button', text: '×', title: t('ui.removeColour'),
          });
          togli.addEventListener('click', () => {
            this.customColors.splice(i, 1);
            ridisegna();
            this.#refreshCustomSwatch();
            this.set({ palette: stringifyPalette(this.customColors) });
          });
          cella.appendChild(togli);
        }
        this.customList.appendChild(cella);
      });
    };

    const aggiungi = el('button', 'dbx__custom-add', {
      type: 'button', text: '+', title: t('ui.addColour'),
    });
    aggiungi.addEventListener('click', () => {
      if (this.customColors.length >= 16) return;
      this.customColors.push('#888888');
      ridisegna();
      this.#refreshCustomSwatch();
      this.set({ palette: stringifyPalette(this.customColors) });
    });

    // Riempie l'editor coi colori della palette selezionata: e' il modo piu'
    // naturale di partire da una predefinita e poi ritoccarla.
    const copia = el('button', 'dbx__custom-add', {
      type: 'button', text: '⧉', title: t('ui.copyPalette'),
    });
    copia.addEventListener('click', () => {
      const { colors } = paletteInfo(this.options.palette);
      this.customColors = colors.slice(0, 16).map(rgbToHex);
      ridisegna();
      this.#refreshCustomSwatch();
      this.set({ palette: stringifyPalette(this.customColors) });
    });

    this._redrawCustom = ridisegna;
    ridisegna();
    editor.append(this.customList, aggiungi, copia);
    return editor;
  }

  #refreshCustomSwatch() {
    if (!this.customButton) return;
    const swatch = this.customButton.querySelector('.dbx__swatch');
    swatch.replaceChildren();
    for (const c of this.customColors.slice(0, 8)) {
      const dot = el('span', 'dbx__swatch-dot');
      dot.style.background = c;
      swatch.appendChild(dot);
    }
  }

  #buildControl(param) {
    const t = this.t;
    const id = `dbx-${param.key}-${Math.random().toString(36).slice(2, 7)}`;
    const wrap = el('div', `dbx__control dbx__control--${param.type}`);
    // Il nome del parametro anche nel DOM: serve a chi vuole dare stile a un
    // controllo preciso dalla pagina che ospita il widget, e serve ai test
    // per contare i controlli senza frugare dentro l'oggetto.
    wrap.dataset.param = param.key;
    const label = el('label', 'dbx__label', { for: id, text: paramLabel(param, t) });
    const hint = paramHint(param, t);
    if (hint) label.title = hint;
    wrap.appendChild(label);

    let input;
    let value = null;

    if (param.type === 'enum') {
      input = el('select', 'dbx__select', { id });
      for (const v of param.values) {
        input.appendChild(el('option', null, { value: v, text: enumLabel(param, v, t) }));
      }
      input.addEventListener('change', () => this.set({ [param.key]: input.value }));
    } else if (param.type === 'bool') {
      input = el('input', 'dbx__checkbox', { id, type: 'checkbox' });
      input.addEventListener('change', () => this.set({ [param.key]: input.checked }));
    } else if (param.type === 'number') {
      // Un campo da scrivere, non un cursore: 1920 a gradini non si mette.
      // Vuoto vuol dire "decidila tu", che nelle opzioni e' zero.
      input = el('input', 'dbx__number', {
        id, type: 'number', min: param.min, max: param.max, step: 1,
      });
      input.placeholder = this.t('value.auto');
      input.addEventListener('change', () => {
        const scritto = input.value.trim();
        this.set({ [param.key]: scritto === '' ? 0 : Number(scritto) });
      });
    } else {
      // Il cursore lavora sull'indice del passo, non sul valore: e' l'unico
      // modo per far scorrere allo stesso modo una scala regolare e una a
      // gradini scelti a mano come quella dei megapixel.
      const steps = paramSteps(param);
      input = el('input', 'dbx__range', {
        id, type: 'range', min: 0, max: steps.length - 1, step: 1,
      });
      value = el('output', 'dbx__value', { for: id });
      input.addEventListener('input', () => {
        this.set({ [param.key]: steps[Number(input.value)] });
      });
      label.addEventListener('dblclick', () => this.set({ [param.key]: param.default }));
    }

    if (hint) input.title = hint;
    wrap.appendChild(input);
    if (value) wrap.appendChild(value);

    this.controls.set(param.key, { param, input, value });
    return wrap;
  }

  #buildActions() {
    const t = this.t;
    const actions = el('div', 'dbx__actions');

    const save = el('button', 'dbx__button dbx__button--primary', {
      type: 'button', text: t('ui.download'),
    });
    save.addEventListener('click', () => this.download().catch((e) => this.#fail(e)));

    const reset = el('button', 'dbx__button dbx__button--ghost', {
      type: 'button', text: t('ui.reset'),
    });
    reset.addEventListener('click', () => this.reset());

    actions.append(save, reset);
    return actions;
  }

  #cameraIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'dbx__drop-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
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
          this.#fail(new Error(this.t('ui.notAnImage')));
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
    this._rootListeners = listeners;
  }

  // ------------------------------------------------------------ interni

  #syncControls() {
    for (const [key, { param, input, value }] of this.controls) {
      const v = this.options[key];
      if (param.type === 'bool') {
        input.checked = Boolean(v);
      } else if (param.type === 'range') {
        input.value = stepIndex(param, v);
      } else if (param.type === 'number') {
        // Zero e' "auto": si mostra come campo vuoto col suggerimento, non
        // come uno zero, che sembrerebbe una misura di zero pixel.
        input.value = v > 0 ? String(v) : '';
      } else {
        input.value = v;
      }

      // I megapixel sono l'unico comando il cui limite utile dipende dalla
      // foto caricata: chiederne piu' di quanti ne ha non fa niente. Il
      // cursore si accorcia fino al primo gradino che copre la foto, cosi'
      // ogni posizione cambia davvero qualcosa, e il numero accanto dice
      // quello che si otterra' e non quello che si e' chiesto.
      if (key === 'megapixels' && this.source) {
        const propri = (this.source.width * this.source.height) / 1e6;
        const tetto = usefulStepCeiling(param, propri);
        input.max = String(tetto);
        if (Number(input.value) > tetto) input.value = String(tetto);
        if (value) {
          value.textContent = formatValue(
            param, effectiveMegapixels(this.source.width, this.source.height, v), this.t,
          );
        }
        continue;
      }

      if (value) value.textContent = formatValue(param, v, this.t);
    }

    if (this.paletteButtons) {
      const attiva = isCustomPalette(this.options.palette)
        ? '__custom__'
        : this.options.palette;
      for (const [key, button] of this.paletteButtons) {
        button.classList.toggle('is-active', key === attiva);
        button.setAttribute('aria-pressed', String(key === attiva));
      }
    }
  }

  /**
   * L'immagine su cui lavora l'anteprima.
   *
   * Deve subire la stessa riduzione in megapixel del risultato finale, se no
   * l'anteprima resta nitida mentre il file scaricato esce sgranato: si
   * sceglierebbe alla cieca.
   */
  #previewSource() {
    const { megapixels } = this.options;
    if (this.previewCache && this.previewCache.megapixels === megapixels) {
      return this.previewCache.image;
    }
    const target = targetSize(this.source.width, this.source.height, megapixels);
    const base = this.previewBase;
    const k = Math.min(1, base.width / target.width, base.height / target.height);
    const image = k < 1 || target.width < base.width
      ? resampleBox(
        base,
        Math.max(1, Math.round(target.width * k)),
        Math.max(1, Math.round(target.height * k)),
      )
      : base;
    this.previewCache = { megapixels, image };
    return image;
  }

  #draw() {
    if (this.view !== 'image') return this.#drawText();
    const started = performance.now();
    // Con una misura chiesta a mano non si pre-riduce: la riduzione la fa il
    // motore per arrivare esatto a quella misura, e farla due volte con due
    // arrotondamenti diversi fa mancare il bersaglio di un pixel.
    const chieste = requestedSize(this.source.width, this.source.height, this.options);
    const source = chieste ? this.source : this.#previewSource();
    // Senza misura chiesta i megapixel li ha gia' applicati #previewSource, e
    // qui si dice al motore di non ridurre una seconda volta.
    const { image } = processImage(source, chieste ? this.options : {
      ...this.options,
      megapixels: (source.width * source.height) / 1e6,
    });
    this.ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    this.#showCanvas(image);

    // La misura vera del file, non solo quella che deciderebbero i megapixel:
    // con un ritaglio, un rapporto o una misura chiesta a mano le due cose
    // non coincidono, e questa riga diceva l'altra.
    const out = exportSize(this.source.width, this.source.height, this.options);
    const mp = ((out.width * out.height) / 1e6).toFixed(2);
    const ms = Math.round(performance.now() - started);
    this.#status(
      `${this.source.width}×${this.source.height} → ${out.width}×${out.height} (${mp} MP) · ${ms} ms`,
    );
  }

  /** Rende la foto come testo e la mette nel riquadro, con la misura del
   *  carattere calcolata perche' le colonne ci stiano tutte. */
  #drawText() {
    const started = performance.now();
    const testo = imageToText(this.source, {
      ...this.options, mode: this.view, cols: this.textCols,
    });
    this.textPane.textContent = testo;
    this.#fitText();

    const righe = testo.split('\n').length;
    const ms = Math.round(performance.now() - started);
    this.#status(`${this.textCols}×${righe} · ${testo.length} ${this.t('ui.chars')} · ${ms} ms`);
  }

  /** La larghezza di un carattere non e' nota a priori: la si misura una
   *  volta e da li' si ricava la dimensione che fa entrare le colonne. */
  #fitText() {
    const pane = this.textPane;
    const utile = pane.clientWidth - 16;
    if (utile <= 0) return;
    pane.style.fontSize = '20px';
    const prima = pane.scrollWidth;
    const perCarattere = prima / this.textCols / 20;
    pane.style.fontSize = '';
    if (!perCarattere) return;
    const dimensione = Math.max(3, Math.min(16, utile / this.textCols / perCarattere));
    pane.style.fontSize = `${dimensione.toFixed(2)}px`;
  }

  /** Accende la vista scelta e spegne le altre. */
  #syncView() {
    const testuale = this.view !== 'image';
    if (this.canvas) this.canvas.hidden = testuale;
    if (this.textPane) this.textPane.hidden = !testuale;
    if (this.textTools) this.textTools.hidden = !testuale;
    if (this.viewButtons) {
      for (const [chiave, b] of this.viewButtons) {
        const attiva = chiave === this.view;
        b.classList.toggle('is-active', attiva);
        b.setAttribute('aria-selected', String(attiva));
      }
    }
  }

  /** Conferma visiva sul pulsante, senza aprire finestre. */
  #flashCopy(riuscito) {
    if (!this.copyButton) return;
    const t = this.t;
    this.copyButton.textContent = t(riuscito ? 'ui.copied' : 'ui.copyFailed');
    this.copyButton.classList.toggle('is-done', riuscito);
    clearTimeout(this._copyTimer);
    this._copyTimer = setTimeout(() => {
      this.copyButton.textContent = t('ui.copy');
      this.copyButton.classList.remove('is-done');
    }, 1600);
  }

  #showCanvas(image) {
    if (this.canvas.width !== image.width || this.canvas.height !== image.height) {
      this.canvas.width = image.width;
      this.canvas.height = image.height;
      this.ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    }
  }

  #toCanvas(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').putImageData(
      new ImageData(image.data, image.width, image.height), 0, 0,
    );
    return canvas;
  }

  #defaultFilename() {
    const base = this.sourceName
      ? this.sourceName.replace(/\.[^.]+$/, '')
      : 'ditherbox';
    const palette = isCustomPalette(this.options.palette) ? 'custom' : this.options.palette;
    return `${base}-${palette}-${this.options.algorithm}.png`;
  }

  #status(text) {
    if (this.statusEl) this.statusEl.textContent = text || '';
  }

  #fail(err) {
    this.#status(this.t('ui.error', { msg: err.message }));
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
 * piu' data-src, data-lang e data-theme, che opzioni non sono.
 * Per una palette personalizzata basta un elenco di colori:
 * `data-palette="#0a0c10,#c2fe0b"`.
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
    boxes.push(new DitherBox(node, {
      options,
      src: node.dataset.src || undefined,
      lang: node.dataset.lang || undefined,
      // Se l'attributo c'e' gia' nell'HTML lo legge direttamente il foglio
      // di stile; qui serve solo perche' il widget sappia di averlo.
      theme: node.dataset.theme || undefined,
    }));
  }
  return boxes;
}

export { PARAMS, PRESETS, PALETTES, DEFAULTS, processImage };
export default DitherBox;
