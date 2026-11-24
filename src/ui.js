// Interfaz de usuario: flotantes laterales, maximizar 3D, prenda por línea, diseño, capas y liquidación de precio.
import { CONFIG, getLine, getReference, getSizesForAudience, getPrintSpace, getPrintSpacePrice, money } from './config.js';
import {
  state, defaultProduct, normalizeProduct, on, emit, images, selected, addElement, removeElement, selectElement, duplicateElement, moveLayer, clearSide,
  commit, changed, undo, redo, canUndo, canRedo, priceInfo, registerImage, newId, serializeDesign, loadDesign, loadImage,
} from './state.js';
import { exportArt, maxScaleForElement } from './render2d.js';
import { kvGet, kvSet } from './storage.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

export function toast(msg, actionLabel, action) {
  const t = h('div', { class: 'toast' }, msg);
  if (actionLabel) t.append(h('button', { text: actionLabel, onclick: () => { action?.(); t.remove(); } }));
  $('#toasts').append(t);
  setTimeout(() => t.remove(), actionLabel ? 6000 : 3200);
}

const lum = (hex) => {
  const n = parseInt((hex || '#ffffff').slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const contrastInk = (hex) => (lum(hex) > 0.55 ? '#111827' : '#ffffff');

function download(canvasOrBlob, name) {
  const go = (blob) => {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  if (canvasOrBlob instanceof Blob) go(canvasOrBlob);
  else canvasOrBlob.toBlob((b) => b && go(b), 'image/png');
}

const SHAPE_GLYPH = { rect: '▭', circle: '●', triangle: '▲', star: '★', heart: '♥', bolt: '⚡' };
const PLAY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6,4 20,12 6,20"/></svg>';
const PAUSE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
const MAX_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
const MIN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
const PENCIL_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
const LOCK_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const TRASH_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

export function initUI(viewer) {
  const app = $('#app');
  const stage = $('#stage');

  // ---------------- Pestañas ----------------
  let currentTab = 'product';
  function showTab(name) {
    currentTab = name;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    $('#buybar').hidden = name === 'price';
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  $('#btn-go-price').onclick = () => showTab('price');

  // ---------------- Maximizar visor 3D ----------------
  const btnMax = $('#btn-maximize');
  function setMaximized(val) {
    app.classList.toggle('maximized', val);
    btnMax.classList.toggle('active', val);
    btnMax.innerHTML = val ? MIN_SVG : MAX_SVG;
    btnMax.title = val ? 'Mostrar panel de edición' : 'Maximizar visor 3D';
    btnMax.setAttribute('aria-label', btnMax.title);
    requestAnimationFrame(() => viewer.resize());
  }
  btnMax.onclick = () => setMaximized(!app.classList.contains('maximized'));

  // ---------------- Público, Línea de producto, Referencia y Colores ----------------
  const AUDIENCES = ['Hombre', 'Mujer', 'Niños'];
  const segAud = $('#seg-audience');
  AUDIENCES.forEach((aud) => {
    segAud.append(h('button', {
      'data-aud': aud,
      text: aud,
      onclick: () => {
        state.product.audience = aud;
        normalizeProduct(state.product);
        emit('product');
      },
    }));
  });

  const segLine = $('#seg-line');
  CONFIG.productLines.forEach((line) => {
    segLine.append(h('button', {
      'data-line': line.id,
      text: line.shortLabel,
      title: line.label,
      onclick: () => {
        state.product.line = line.id;
        normalizeProduct(state.product);
        emit('product');
      },
    }));
  });

  const sw = $('#swatches');
  CONFIG.colors.forEach((c) => {
    sw.append(h('button', {
      class: 'swatch', style: `background:${c.hex}`, title: c.name, 'data-hex': c.hex, 'aria-label': c.name,
      onclick: () => { state.product.color = c.hex; emit('product'); },
    }));
  });

  const collarSw = $('#collar-swatches');
  CONFIG.colors.forEach((c) => {
    collarSw.append(h('button', {
      class: 'swatch', style: `background:${c.hex}`, title: c.name, 'data-chex': c.hex, 'aria-label': c.name,
      onclick: () => { state.product.collarColor = c.hex; emit('product'); },
    }));
  });

  const colorLabel = (hex) => CONFIG.colors.find((c) => c.hex.toLowerCase() === (hex || '').toLowerCase())?.name || hex;

  function renderProduct() {
    const p = normalizeProduct(state.product);
    const line = getLine(p.line);
    const ref = getReference(p.line, p.reference);

    // Público (arriba de Línea de producto)
    $$('#seg-audience button').forEach((b) => b.classList.toggle('active', b.dataset.aud === p.audience));

    // Línea de producto (Media y Premium deshabilitadas para Niños)
    $$('#seg-line button').forEach((b) => {
      const l = getLine(b.dataset.line);
      const allowed = l.audiences.includes(p.audience);
      b.disabled = !allowed;
      b.title = allowed ? l.label : `${l.label} (no aplica para niños)`;
      b.classList.toggle('active', b.dataset.line === line.id);
    });

    // Referencias aplicables a la línea y público seleccionados
    const refGrid = $('#ref-grid');
    refGrid.innerHTML = '';
    const refs = line.references.filter((r) => r.audiences.includes(p.audience));
    refs.forEach((r) => {
      refGrid.append(h('button', {
        class: 'ref-btn' + (r.id === ref.id ? ' active' : ''),
        onclick: () => {
          state.product.reference = r.id;
          normalizeProduct(state.product);
          emit('product');
        },
      },
      h('b', { text: r.label }),
      h('small', { text: money(r.price) })));
    });

    // Color principal (solo las 17 opciones)
    const activeHex = p.color.toLowerCase();
    $$('#swatches .swatch[data-hex]').forEach((b) => b.classList.toggle('active', b.dataset.hex.toLowerCase() === activeHex));
    $('#color-name').textContent = colorLabel(p.color);

    // Color del cuello (solo en referencias Cuello colores normal / crop top)
    const collarBlock = $('#collar-color-block');
    collarBlock.hidden = !ref.customCollar;
    if (ref.customCollar) {
      const cHex = (p.collarColor || p.color).toLowerCase();
      $$('#collar-swatches .swatch[data-chex]').forEach((b) => b.classList.toggle('active', b.dataset.chex.toLowerCase() === cHex));
      $('#collar-color-name').textContent = colorLabel(p.collarColor);
    }

    // Tallas (niños vs adulto)
    const sizesBox = $('#sizes');
    sizesBox.innerHTML = '';
    const sizes = getSizesForAudience(p.audience);
    sizes.forEach((s) => {
      sizesBox.append(h('button', {
        class: s === p.size ? 'active' : '',
        text: s,
        onclick: () => { state.product.size = s; emit('product'); },
      }));
    });

    renderPrice();
    renderLayers();
  }

  function renderPrice() {
    const p = state.product;
    const line = getLine(p.line);
    const ref = getReference(p.line, p.reference);
    const info = priceInfo();

    // Resumen de prenda en pestaña Precio
    const sumBox = $('#product-summary');
    sumBox.innerHTML = '';
    const rows = [
      ['Público', p.audience],
      ['Línea', line.label],
      ['Referencia', ref.label],
      ['Color', colorLabel(p.color)],
      ...(ref.customCollar ? [['Color del cuello', colorLabel(p.collarColor)]] : []),
      ['Talla', p.size],
      ['Estampados', (() => {
        const count = [...state.elements.front, ...state.elements.back].filter((e) => !e.hidden).length;
        return count ? `${count} ${count === 1 ? 'diseño' : 'diseños'}` : 'Sin estampado';
      })()],
    ];
    rows.forEach(([k, v]) => sumBox.append(h('div', { class: 'summary-row' }, h('span', { text: k }), h('b', { text: v }))));

    const ul = $('#price-lines');
    ul.innerHTML = '';
    info.lines.forEach((l) => ul.append(h('li', {}, h('span', { text: l.label }), h('span', { text: money(l.amount) }))));
    if (info.qty > 1) ul.append(h('li', {}, h('span', { text: `Cantidad × ${info.qty}` }), h('span', { text: money(info.subtotal) })));
    if (info.discount) ul.append(h('li', { class: 'disc' }, h('span', { text: `Descuento por volumen (${Math.round(info.discount * 100)}%)` }), h('span', { text: '−' + money(info.subtotal * info.discount) })));
    ul.append(h('li', { class: 'total' }, h('span', { text: 'Total a pagar' }), h('span', { text: money(info.total) })));

    $('#buy-total').textContent = money(info.total);
    $('#buy-sub').textContent = `${info.qty} × ${money(info.unit)} · ${p.audience} · talla ${p.size}`;
    $('#qty-val').textContent = info.qty;
    $('#qty-unit-hint').textContent = `${money(info.unit)} c/u`;
  }
  $('#qty-minus').onclick = () => { state.product.qty = Math.max(1, state.product.qty - 1); renderPrice(); };
  $('#qty-plus').onclick = () => { state.product.qty = Math.min(99, state.product.qty + 1); renderPrice(); };
  on('product', renderProduct);
  on('layers', renderPrice);

  // ---------------- Diseño (antes Añadir) ----------------
  $('#btn-add-text').onclick = () => {
    addElement({
      type: 'text', text: 'TU TEXTO', font: 'Anton', color: contrastInk(state.product.color), strokeColor: '#000000',
      strokeW: 0, curve: 0, spacing: 2, align: 'center', y: -0.25, s: 1.2,
    });
  };

  $('#btn-add-chest').onclick = () => {
    viewer.setView('front');
    addElement({
      type: 'shape', shape: 'star', fill: '#f2c629', stroke: '#17181b', strokeW: 3, ratio: 1, radius: 0.15,
      x: 0.36, y: -0.58, s: 0.55,
    }, 'front');
    toast('Escudo añadido en el pecho izquierdo');
  };

  $('#btn-add-dorsal').onclick = () => {
    viewer.setView('back');
    const ink = contrastInk(state.product.color);
    addElement({
      type: 'text', text: 'DECERO', font: 'Bebas Neue', color: ink, strokeColor: '#000000',
      strokeW: 0, curve: 0, spacing: 8, align: 'center', x: 0, y: -0.62, s: 1.35,
    }, 'back');
    addElement({
      type: 'text', text: '10', font: 'Anton', color: ink, strokeColor: '#000000',
      strokeW: 0, curve: 0, spacing: 2, align: 'center', x: 0, y: 0.05, s: 3.1,
    }, 'back');
    toast('Nombre y dorsal añadidos en la espalda');
  };

  async function processFile(file) {
    if (!file || !file.type.startsWith('image/')) return toast('Ese archivo no es una imagen');
    if (file.size > 25e6) return toast('La imagen pesa más de 25 MB');
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      let w = img.naturalWidth || 1000;
      let hh = img.naturalHeight || 1000;
      const isSvg = file.type === 'image/svg+xml';
      const k = isSvg ? 1400 / Math.max(w, hh) : Math.min(1, 1600 / Math.max(w, hh));
      w = Math.max(1, Math.round(w * k));
      hh = Math.max(1, Math.round(hh * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = hh;
      c.getContext('2d').drawImage(img, 0, 0, w, hh);
      const src = file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
      const id = newId('img');
      await registerImage(id, src);
      const spId = state.product.printSpace;
      const imgEl = { type: 'image', imgId: id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 24), space: spId, y: -0.25, s: 1.1 };
      const maxS = maxScaleForElement(imgEl, spId);
      imgEl.s = Math.min(imgEl.s, maxS * 0.92);
      addElement(imgEl);
    } catch {
      toast('No se pudo leer la imagen');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const fileInput = $('#file-input');
  fileInput.addEventListener('change', () => {
    [...fileInput.files].slice(0, 1).forEach(processFile);
    fileInput.value = '';
  });
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragover'); });
  stage.addEventListener('dragleave', (e) => { if (e.target === stage || e.target.id === 'drop-overlay') stage.classList.remove('dragover'); });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('dragover');
    processFile(e.dataTransfer.files[0]);
  });
  document.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) processFile(f);
  });

  // ---------------- Capas y propiedades por elemento ----------------
  const layersEl = $('#layers');
  let binders = [];
  let editKey = null;
  let expandedId = null;
  const begin = (k) => { if (editKey !== k) { commit(); editKey = k; } };
  document.addEventListener('change', () => (editKey = null));
  document.addEventListener('focusout', () => (editKey = null));
  document.addEventListener('pointerup', () => setTimeout(() => (editKey = null), 0));

  const layerLabel = (el) => {
    if (el.type === 'text') return (el.text || '').split('\n')[0] || 'Texto';
    if (el.type === 'image') return el.name || 'Imagen';
    if (el.type === 'shape') return CONFIG.shapes.find((s) => s.type === el.shape)?.label || 'Escudo';
    return 'Elemento';
  };
  const layerThumb = (el) => {
    if (el.type === 'image') return h('img', { src: images.get(el.imgId)?.src || '', alt: '' });
    if (el.type === 'text') return h('span', { text: 'T', style: `font-family:"${el.font}";font-weight:700` });
    if (el.type === 'emoji') return h('span', { text: el.char });
    return h('span', { text: SHAPE_GLYPH[el.shape] || '★', style: `color:${el.fill}` });
  };

  const fld = (label, ...ctrl) => h('div', { class: 'field' }, h('span', { class: 'lbl' }, label), ...ctrl);

  function range(el, key, label, min, max, step, fmt = (v) => v, normalize = null) {
    const out = h('output');
    const input = h('input', { type: 'range', min, max, step });
    const getVal = () => {
      let v = el[key] ?? min;
      if (key === 'rot') v = ((v % 360) + 360) % 360;
      return v;
    };
    const sync = () => {
      const v = getVal();
      input.value = v;
      out.textContent = fmt(+input.value);
    };
    input.addEventListener('input', () => {
      begin(el.id + key);
      let v = +input.value;
      if (normalize) v = normalize(v);
      el[key] = v;
      input.value = v;
      out.textContent = fmt(v);
      changed(false, el.side);
    });
    binders.push(sync);
    sync();
    return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label, out), input);
  }

  const QUICK = ['#ffffff', '#111111', '#c81e2b', '#f2c629', '#1f7a4c', '#2563c9', '#ec6b9e', '#661a2b', '#155e63', '#5c3b28'];
  function colorField(el, key, label) {
    const input = h('input', { type: 'color' });
    const sync = () => { input.value = /^#[0-9a-f]{6}$/i.test(el[key]) ? el[key] : '#000000'; };
    input.addEventListener('input', () => { begin(el.id + key); el[key] = input.value; changed(false, el.side); });
    binders.push(sync);
    sync();
    const row = h('div', { class: 'color-row' },
      ...QUICK.map((c) => h('button', { class: 'mini', style: `background:${c}`, 'aria-label': c, onclick: () => { commit(); el[key] = c; sync(); changed(false, el.side); } })),
      input);
    return fld(label, row);
  }

  function miniSeg(el, key, label, options, after) {
    const wrap = h('div', { class: 'mini-seg' });
    const btns = options.map(([v, text]) => h('button', { text, title: text, 'data-v': v, onclick: () => { commit(); el[key] = v; sync(); after?.(); changed(false, el.side); } }));
    const sync = () => btns.forEach((b) => b.classList.toggle('active', b.dataset.v === String(el[key])));
    wrap.append(...btns);
    binders.push(sync);
    sync();
    return fld(label, wrap);
  }

  function buildLayerProps(el) {
    const panel = h('div', { class: 'layer-props' });

    if (el.type === 'text') {
      const ta = h('textarea', { rows: 2, spellcheck: false });
      ta.addEventListener('input', () => {
        begin(el.id + 'text');
        el.text = ta.value;
        changed(false, el.side);
        const name = $(`.layer-card[data-id="${el.id}"] .name`);
        if (name) name.textContent = layerLabel(el);
      });
      const syncText = () => { if (document.activeElement !== ta) ta.value = el.text; };
      binders.push(syncText);
      syncText();
      panel.append(fld('Texto', ta));

      const grid = h('div', { class: 'font-grid' });
      const fb = CONFIG.fonts.map((f) => h('button', {
        text: f.label, style: `font-family:"${f.family}"`,
        onclick: async () => {
          commit();
          el.font = f.family;
          syncFonts();
          try { await document.fonts.load(`100px "${f.family}"`); } catch { /* sin red */ }
          changed(false, el.side);
        },
      }));
      const syncFonts = () => fb.forEach((b, i) => b.classList.toggle('active', CONFIG.fonts[i].family === el.font));
      grid.append(...fb);
      binders.push(syncFonts);
      panel.append(fld('Tipografía', grid));
      panel.append(colorField(el, 'color', 'Color'));
      panel.append(colorField(el, 'strokeColor', 'Color del contorno'));
      panel.append(range(el, 'strokeW', 'Grosor del contorno', 0, 14, 0.5));
      panel.append(range(el, 'curve', 'Curvatura', -100, 100, 1, (v) => v + '%'));
      panel.append(range(el, 'spacing', 'Espaciado de letras', -10, 60, 1));
      panel.append(miniSeg(el, 'align', 'Alineación', [['left', '⇤'], ['center', '↔'], ['right', '⇥']]));
    }

    if (el.type === 'shape') {
      panel.append(colorField(el, 'fill', 'Relleno'));
      panel.append(miniSeg(el, 'noFill', 'Relleno activo', [['false', 'Con relleno'], ['true', 'Sólo contorno']], () => { el.noFill = el.noFill === 'true' || el.noFill === true; if (el.noFill && !(el.strokeW > 0)) el.strokeW = 6; }));
      panel.append(colorField(el, 'stroke', 'Color del contorno'));
      panel.append(range(el, 'strokeW', 'Grosor del contorno', 0, 14, 0.5));
    }

    // Opciones principales: Tamaño (1% al 200%), Rotación (0° a 360°) y Opacidad (10% al 100%)
    panel.append(range(
      el,
      's',
      'Tamaño',
      0.01,
      2,
      0.01,
      (v) => Math.round(v * 100) + '%',
      (v) => Math.min(v, maxScaleForElement(el, el.space || state.product.printSpace)),
    ));
    panel.append(range(el, 'rot', 'Rotación', 0, 360, 1, (v) => Math.round(v) + '°'));
    panel.append(range(el, 'opacity', 'Opacidad', 0.1, 1, 0.01, (v) => Math.round(v * 100) + '%'));

    const act = h('div', { class: 'actions' },
      h('button', { class: 'btn', text: 'Centrar', onclick: () => { commit(); el.x = 0; changed(false, el.side); } }),
      el.type === 'image' && h('button', { class: 'btn', text: 'Voltear', onclick: () => { commit(); el.flipX = !el.flipX; changed(false, el.side); } }),
      h('button', { class: 'btn', text: '▲ Subir', onclick: () => moveLayer(el.id, 1) }),
      h('button', { class: 'btn', text: '▼ Bajar', onclick: () => moveLayer(el.id, -1) }),
      h('button', { class: 'btn', text: 'Duplicar', onclick: () => duplicateElement(el.id) }));
    panel.append(act);
    return panel;
  }

  function renderLayers() {
    binders = [];
    $('#side-label').textContent = state.side === 'front' ? 'Frente' : 'Espalda';
    layersEl.innerHTML = '';
    const list = state.elements[state.side];
    if (expandedId && !list.some((e) => e.id === expandedId)) expandedId = null;

    [...list].reverse().forEach((el) => {
      const isSelected = el.id === state.selectedId;
      const isExpanded = el.id === expandedId;

      const sizeSel = h('select', {
        'aria-label': 'Tamaño límite',
        onclick: (e) => e.stopPropagation(),
        onchange: (e) => {
          commit();
          el.space = e.target.value;
          const maxS = maxScaleForElement(el, el.space);
          if (el.s > maxS) el.s = maxS;
          selectElement(el.id);
          changed(true, el.side);
        },
      }, ...CONFIG.printSpaces.map((sp) => {
        const priceTxt = sp.unlimited
          ? `${money(getPrintSpacePrice(sp.id, state.product.size, state.product.audience))}`
          : money(sp.price);
        return h('option', {
          value: sp.id,
          text: `${sp.label} · ${sp.desc} (${priceTxt})`,
          selected: (el.space || state.product.printSpace) === sp.id,
        });
      }));

      const card = h('li', {
        class: 'layer-card' + (isSelected ? ' active' : '') + (el.hidden ? ' off' : ''),
        'data-id': el.id,
      },
      h('div', { class: 'layer-head', onclick: () => selectElement(el.id) },
        h('div', { class: 'thumb' }, layerThumb(el)),
        h('div', { class: 'name', text: layerLabel(el) }),
        h('div', { class: 'layer-actions' },
          h('button', {
            class: 'layer-icon' + (isExpanded ? ' active' : ''),
            title: isExpanded ? 'Ocultar opciones' : 'Editar opciones',
            'aria-label': isExpanded ? 'Ocultar opciones' : 'Editar opciones',
            html: PENCIL_SVG,
            onclick: (e) => {
              e.stopPropagation();
              expandedId = isExpanded ? null : el.id;
              if (!isExpanded && state.selectedId !== el.id) selectElement(el.id);
              else renderLayers();
            },
          }),
          h('button', {
            class: 'layer-icon',
            title: el.hidden ? 'Mostrar' : 'Ocultar',
            text: el.hidden ? '🚫' : '👁',
            onclick: (e) => { e.stopPropagation(); commit(); el.hidden = !el.hidden; changed(true); },
          }),
          h('button', {
            class: 'layer-icon danger',
            title: 'Eliminar',
            'aria-label': 'Eliminar',
            html: TRASH_SVG,
            onclick: (e) => { e.stopPropagation(); removeElement(el.id); },
          }),
        )),
      h('div', { class: 'layer-size-row' }, h('span', { text: 'Tamaño' }), sizeSel),
      isExpanded ? buildLayerProps(el) : null);

      layersEl.append(card);
    });
  }

  let lastSel = null;
  on('layers', () => {
    renderLayers();
    if (state.selectedId && state.selectedId !== lastSel) showTab('add');
    lastSel = state.selectedId;
  });
  on('design', () => binders.forEach((f) => f()));
  on('side', renderLayers);
  $('#btn-clear-side').onclick = () => clearSide(state.side);

  // ---------------- Controles flotantes: Menús de Vistas y Fondo ----------------
  const viewPopover = $('#view-popover');
  const btnViewToggle = $('#btn-view-toggle');
  const bgPopover = $('#bg-popover');
  const btnBgToggle = $('#btn-bg-toggle');

  function setViewMenuOpen(open) {
    viewPopover.hidden = !open;
    btnViewToggle.classList.toggle('active', open);
    btnViewToggle.setAttribute('aria-expanded', String(open));
    if (open && !bgPopover.hidden) setBgOpen(false);
  }
  function setBgOpen(open) {
    bgPopover.hidden = !open;
    btnBgToggle.classList.toggle('active', open);
    btnBgToggle.setAttribute('aria-expanded', String(open));
    if (open && !viewPopover.hidden) setViewMenuOpen(false);
  }

  btnViewToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setViewMenuOpen(viewPopover.hidden);
  });
  viewPopover.addEventListener('click', (e) => e.stopPropagation());

  btnBgToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setBgOpen(bgPopover.hidden);
  });
  bgPopover.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', () => {
    if (!viewPopover.hidden) setViewMenuOpen(false);
    if (!bgPopover.hidden) setBgOpen(false);
  });

  function setStageBg(hex) {
    state.bg = hex;
    stage.style.setProperty('--stage-bg', hex);
    $('#bg-color').value = hex;
    $$('.bg-dot').forEach((d) => d.classList.toggle('active', d.dataset.bg.toLowerCase() === hex.toLowerCase()));
  }

  const bgDots = $('#bg-dots');
  CONFIG.stageBgs.forEach((b) => {
    bgDots.append(h('button', {
      class: 'bg-dot',
      'data-bg': b.hex,
      title: b.name,
      style: `background:${b.hex}`,
      onclick: () => setStageBg(b.hex),
    }));
  });
  $('#bg-color').oninput = (e) => setStageBg(e.target.value);
  setStageBg(state.bg);

  $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
    viewer.setView(b.dataset.view);
    $$('[data-view]').forEach((x) => x.classList.toggle('active', x === b));
  }));
  on('side', (s) => {
    const curActive = $('[data-view].active')?.dataset.view;
    if (curActive === 'front' || curActive === 'back') {
      $$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === s));
    }
  });
  $('#btn-rotate').onclick = (e) => {
    const next = !viewer.autoRotate;
    viewer.setAutoRotate(next);
    e.currentTarget.classList.toggle('active', next);
    e.currentTarget.innerHTML = `${next ? PAUSE_SVG : PLAY_SVG}<span>${next ? 'Pausar' : 'Girar'}</span>`;
  };
  $('#btn-guides').onclick = (e) => {
    state.guides = !state.guides;
    const btn = e.currentTarget;
    btn.classList.toggle('active', state.guides);
    btn.innerHTML = state.guides ? PENCIL_SVG : LOCK_SVG;
    btn.title = state.guides ? 'Edición activa (pulsar para bloquear)' : 'Diseño bloqueado (pulsar para editar)';
    btn.setAttribute('aria-label', state.guides ? 'Edición activa' : 'Diseño bloqueado');
    emit('design');
  };
  setTimeout(() => $('#stage-hint').classList.add('fade'), 9000);

  // ---------------- Historial y Atajos ----------------
  const syncHistory = () => { $('#btn-undo').disabled = !canUndo(); $('#btn-redo').disabled = !canRedo(); };
  on('history', syncHistory);
  $('#btn-undo').onclick = undo;
  $('#btn-redo').onclick = redo;

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.matches?.('input, textarea, select') || t.isContentEditable) return;
    const mod = e.ctrlKey || e.metaKey;
    const el = selected();
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === 'd' && el) { e.preventDefault(); duplicateElement(el.id); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && el) { e.preventDefault(); removeElement(el.id); }
    else if (e.key === 'Escape') {
      if (!viewPopover.hidden) setViewMenuOpen(false);
      else if (!bgPopover.hidden) setBgOpen(false);
      else if (el) selectElement(null);
      else if (app.classList.contains('maximized')) setMaximized(false);
    } else if (el && e.key.startsWith('Arrow')) {
      e.preventDefault();
      begin('nudge' + el.id);
      const d = e.shiftKey ? 0.05 : 0.01;
      if (e.key === 'ArrowLeft') el.x -= d;
      if (e.key === 'ArrowRight') el.x += d;
      if (e.key === 'ArrowUp') el.y -= d;
      if (e.key === 'ArrowDown') el.y += d;
      changed(false, el.side);
    }
  });
  document.addEventListener('keyup', () => (editKey = null));

  // ---------------- Diálogos ----------------
  $$('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  });

  // ---- Carrito ----
  let cart = [];
  const dlgCart = $('#dlg-cart');
  const saveCart = () => kvSet('cart', cart);
  const cartTotal = () => cart.reduce((a, i) => a + i.total, 0);
  const describe = (p) => {
    const line = getLine(p.line);
    const ref = getReference(p.line, p.reference);
    const collarPart = ref.customCollar ? ` · Cuello ${colorLabel(p.collarColor)}` : '';
    return `${line.label} · ${ref.label} · ${p.audience} · Talla ${p.size} · ${colorLabel(p.color)}${collarPart}`;
  };

  function renderCart() {
    $('#cart-count').textContent = cart.reduce((a, i) => a + i.qty, 0);
    const box = $('#cart-items');
    const foot = $('#cart-foot');
    box.innerHTML = '';
    foot.innerHTML = '';
    if (!cart.length) {
      box.append(h('div', { class: 'cart-empty', html: '<div style="font-size:42px">🛒</div><p>Tu carrito está vacío.<br/>Diseña tu camisa y añádela.</p>' }));
      return;
    }
    cart.forEach((it) => {
      const row = h('div', { class: 'cart-item' },
        h('div', { class: 'cart-thumbs' }, h('img', { src: it.thumbFront, alt: 'Frente' }), it.thumbBack && h('img', { src: it.thumbBack, alt: 'Espalda' })),
        h('div', { class: 'cart-info' },
          h('b', { text: getReference(it.design.product.line, it.design.product.reference).label }),
          h('div', { class: 'meta', text: describe(it.design.product) + ` · estampado: ${it.sides.length === 2 ? 'frente y espalda' : it.sides[0] === 'front' ? 'frente' : it.sides[0] === 'back' ? 'espalda' : 'ninguno'}` }),
          h('div', { class: 'row' },
            h('div', { class: 'qty' },
              h('button', { text: '−', onclick: () => changeQty(it, -1) }), h('span', { text: it.qty }), h('button', { text: '＋', onclick: () => changeQty(it, 1) })),
            h('span', { class: 'price', text: money(it.total) })),
          h('div', { class: 'row' },
            h('button', { class: 'btn tiny', text: 'Editar diseño', onclick: () => editItem(it) }),
            h('button', { class: 'btn tiny danger', text: 'Quitar', onclick: () => { cart = cart.filter((x) => x !== it); saveCart(); renderCart(); } }))));
      box.append(row);
    });
    foot.append(
      h('div', { class: 'cart-sum' }, h('span', { text: 'Total' }), h('span', { text: money(cartTotal()) })),
      h('button', { class: 'btn primary big', text: 'Finalizar pedido', onclick: openCheckout }));
  }

  function itemTotal(unit, qty) {
    const P = CONFIG.prices;
    return unit * qty * (qty >= P.bulkMinQty ? 1 - P.bulkDiscount : 1);
  }
  function changeQty(it, d) {
    it.qty = Math.max(1, Math.min(99, it.qty + d));
    it.total = itemTotal(it.unit, it.qty);
    it.design.product.qty = it.qty;
    saveCart();
    renderCart();
  }
  async function editItem(it) {
    cart = cart.filter((x) => x !== it);
    saveCart();
    renderCart();
    dlgCart.close();
    await loadDesign(it.design);
    toast('Diseño cargado. Vuelve a añadirlo al carrito al terminar.');
  }

  function buildCurrentCartItem() {
    const design = serializeDesign();
    const { sides, unit } = priceInfo(design.product, design.elements);
    const jpg = (c) => c.toDataURL('image/jpeg', 0.88);
    const thumbFront = jpg(viewer.capture('front', 400));
    const thumbBack = sides.includes('back') ? jpg(viewer.capture('back', 400)) : null;
    const qty = state.product.qty;
    return { id: newId('c'), createdAt: Date.now(), design, sides, unit, qty, total: itemTotal(unit, qty), thumbFront, thumbBack };
  }

  $('#btn-add-cart').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      cart.push(buildCurrentCartItem());
      await saveCart();
      renderCart();
      toast('Añadido al carrito', 'Ver carrito', () => dlgCart.showModal());
    } finally {
      btn.disabled = false;
    }
  };

  $('#btn-buy-now').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      cart.push(buildCurrentCartItem());
      await saveCart();
      renderCart();
      openCheckout();
    } finally {
      btn.disabled = false;
    }
  };

  $('#btn-cart').onclick = () => { renderCart(); dlgCart.showModal(); };

  // ---- Checkout ----
  const dlgCheckout = $('#dlg-checkout');
  function openCheckout() {
    $('#checkout-form').hidden = false;
    $('#checkout-done').hidden = true;
    $('#checkout-total').innerHTML = '';
    $('#checkout-total').append(h('span', { text: `Total (${cart.reduce((a, i) => a + i.qty, 0)} camisas)` }), h('span', { text: money(cartTotal()) }));
    dlgCart.close();
    dlgCheckout.showModal();
  }
  function orderText(order) {
    const lines = order.items.map((i) => `• ${i.qty}× ${describe(i.design.product)} — ${money(i.total)}`);
    return `Hola, quiero confirmar mi pedido ${order.id} en ${CONFIG.storeName}:\n${lines.join('\n')}\nTotal: ${money(order.total)}\nNombre: ${order.customer.name}\nDirección: ${order.customer.address}`;
  }
  $('#checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const order = { id: 'PED-' + Date.now().toString(36).toUpperCase(), date: new Date().toISOString(), customer: data, items: cart, total: cartTotal() };
    const orders = await kvGet('orders', []);
    orders.push(order);
    await kvSet('orders', orders);
    cart = [];
    await saveCart();
    renderCart();
    e.currentTarget.hidden = true;
    const done = $('#checkout-done');
    done.hidden = false;
    done.innerHTML = '';
    done.append(h('div', { class: 'done-box' },
      h('div', { class: 'ok', text: '✅' }),
      h('h2', { text: '¡Pedido registrado!' }),
      h('p', { html: `Tu número de pedido es <b>${order.id}</b>.<br/>Total: <b>${money(order.total)}</b>.` }),
      h('p', { class: 'muted small', text: 'Tu diseño quedó guardado. Te contactaremos para coordinar el pago y la entrega.' }),
      CONFIG.whatsapp && h('a', { class: 'btn primary big', target: '_blank', rel: 'noopener', text: 'Confirmar por WhatsApp', href: `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(orderText(order))}` }),
      h('button', { class: 'btn', text: 'Seguir diseñando', onclick: () => dlgCheckout.close() })));
  });

  // ---- Mis diseños ----
  const dlgDesigns = $('#dlg-designs');
  async function renderDesigns() {
    const list = await kvGet('designs', []);
    const grid = $('#designs-grid');
    grid.innerHTML = '';
    if (!list.length) grid.append(h('p', { class: 'muted small', text: 'Todavía no has guardado diseños.' }));
    list.forEach((d) => grid.append(h('div', { class: 'design-card' },
      h('img', { src: d.thumb, alt: d.name, onclick: async () => { await loadDesign(d.design); dlgDesigns.close(); toast(`«${d.name}» cargado`); } }),
      h('div', { class: 'meta' }, h('span', { text: d.name }),
        h('button', { title: 'Eliminar', text: '🗑', onclick: async () => { await kvSet('designs', list.filter((x) => x.id !== d.id)); renderDesigns(); } })))));
  }
  $('#btn-designs').onclick = () => { renderDesigns(); dlgDesigns.showModal(); };
  $('#save-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#design-name');
    const list = await kvGet('designs', []);
    const hasBack = state.elements.back.length && !state.elements.front.length;
    const thumb = viewer.capture(hasBack ? 'back' : 'front', 360).toDataURL('image/jpeg', 0.85);
    list.unshift({ id: newId('d'), name: input.value.trim(), date: Date.now(), thumb, design: serializeDesign() });
    await kvSet('designs', list);
    input.value = '';
    renderDesigns();
    toast('Diseño guardado');
  });
  $('#btn-new').onclick = async () => {
    if (!confirm('¿Empezar un diseño nuevo? Se borrará el diseño actual (los guardados no se tocan).')) return;
    await loadDesign({ product: defaultProduct(), elements: { front: [], back: [] }, images: {} });
    dlgDesigns.close();
  };

  // ---- Exportar ----
  const dlgExport = $('#dlg-export');
  $('#btn-export').onclick = () => dlgExport.showModal();
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => {
    const [kind, side] = b.dataset.export.split('-');
    const label = side === 'front' ? 'frente' : 'espalda';
    if (kind === 'mock') download(viewer.capture(side, 1600), `decero-${label}.png`);
    else {
      const c = exportArt(state.elements, side, 2.5);
      if (!c) return toast(`No hay diseños en ${label}`);
      download(c, `arte-${label}.png`);
    }
    dlgExport.close();
  }));

  // ---------------- PWA: instalación y conexión ----------------
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $('#btn-install').hidden = false;
  });
  $('#btn-install').onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('#btn-install').hidden = true;
  };
  window.addEventListener('appinstalled', () => ($('#btn-install').hidden = true));
  const net = () => ($('#offline-pill').hidden = navigator.onLine);
  window.addEventListener('online', net);
  window.addEventListener('offline', net);
  net();

  // ---------------- Inicio ----------------
  (async () => {
    cart = await kvGet('cart', []);
    renderCart();
  })();
  renderProduct();
  renderLayers();
  syncHistory();
  showTab(currentTab);
  return { showTab };
}
