// Interfaz de usuario: zonas, patrones, presets, capas, propiedades, carrito, pedidos y exportación.
import { CONFIG, money } from './config.js';
import {
  state, defaultProduct, on, emit, images, selected, addElement, removeElement, selectElement, duplicateElement, moveLayer, clearSide,
  commit, changed, undo, redo, canUndo, canRedo, priceInfo, registerImage, newId, serializeDesign, loadDesign, loadImage,
} from './state.js';
import { exportArt } from './render2d.js';
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

const SHAPE_ICONS = {
  rect: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  triangle: '<path d="M12 3 22 21H2z"/>',
  star: '<path d="m12 2 3 7 7.5.6-5.7 5 1.8 7.4L12 18l-6.6 4 1.8-7.4-5.7-5L9 9z"/>',
  heart: '<path d="M12 21C5 15 2 11.5 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 3.500-3 7-10 13z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 10-13h-7z"/>',
};
const shapeSvg = (t) => `<svg viewBox="0 0 24 24">${SHAPE_ICONS[t]}</svg>`;
const SHAPE_GLYPH = { rect: '▭', circle: '●', triangle: '▲', star: '★', heart: '♥', bolt: '⚡' };

export function initUI(viewer) {
  const stage = $('#stage');

  // ---------------- Pestañas ----------------
  function showTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---------------- Presets ----------------
  const presetsGrid = $('#presets-grid');
  CONFIG.presets.forEach((pr) => {
    const z = pr.product.zones;
    presetsGrid.append(
      h('button', {
        class: 'preset-card',
        onclick: () => {
          Object.assign(state.product, {
            ...pr.product,
            zones: { ...pr.product.zones },
          });
          if (pr.bg) setStageBg(pr.bg);
          emit('product');
          toast(`Estilo «${pr.name}» aplicado`);
        },
      },
      h('div', { class: 'preset-swatch' },
        h('span', { style: `background:${z.front}` }),
        h('span', { style: `background:${pr.product.pattern !== 'solid' ? pr.product.patternColor : z.sleeveL}` }),
        h('span', { style: `background:${z.collar}` }),
      ),
      h('small', { text: pr.name })),
    );
  });

  // ---------------- Zonas y Colores ----------------
  const segZone = $('#seg-zone');
  CONFIG.zones.forEach((z) => {
    segZone.append(h('button', {
      'data-z': z.id,
      text: z.label,
      onclick: () => {
        state.activeZone = z.id;
        if (z.id === 'front') viewer.setView('front');
        else if (z.id === 'back') viewer.setView('back');
        else if (z.id === 'sleeves') viewer.setView('left');
        renderProduct();
      },
    }));
  });

  function currentZoneColor() {
    const p = state.product;
    const z = p.zones;
    switch (state.activeZone) {
      case 'front': return z.front;
      case 'back': return z.back;
      case 'sleeves': return z.sleeveL;
      case 'collar': return z.collar;
      default: return p.color;
    }
  }

  function applyZoneColor(hex) {
    const p = state.product;
    const z = p.zones;
    switch (state.activeZone) {
      case 'front': z.front = hex; break;
      case 'back': z.back = hex; break;
      case 'sleeves': z.sleeveL = hex; z.sleeveR = hex; break;
      case 'collar': z.collar = hex; break;
      default:
        p.color = hex;
        z.front = z.back = z.sleeveL = z.sleeveR = z.collar = hex;
        break;
    }
    emit('product');
  }

  const sw = $('#swatches');
  CONFIG.colors.forEach((c) => {
    sw.append(h('button', {
      class: 'swatch', style: `background:${c.hex}`, title: c.name, 'data-hex': c.hex, 'aria-label': c.name,
      onclick: () => applyZoneColor(c.hex),
    }));
  });
  const custom = h('input', { type: 'color', hidden: true, value: '#2563eb', oninput: (e) => applyZoneColor(e.target.value) });
  sw.append(h('label', { class: 'swatch', title: 'Color personalizado', style: 'background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red);cursor:pointer' }, custom));

  // ---------------- Patrones (Spized) ----------------
  const patternGrid = $('#pattern-grid');
  CONFIG.patterns.forEach((pt) => {
    patternGrid.append(h('button', {
      class: 'pattern-btn',
      'data-pat': pt.id,
      text: pt.label,
      onclick: () => {
        state.product.pattern = pt.id;
        emit('product');
      },
    }));
  });

  const patSw = $('#pattern-swatches');
  CONFIG.colors.forEach((c) => {
    patSw.append(h('button', {
      class: 'swatch', style: `background:${c.hex}`, title: c.name, 'data-phex': c.hex, 'aria-label': c.name,
      onclick: () => { state.product.patternColor = c.hex; emit('product'); },
    }));
  });
  const customPat = h('input', { type: 'color', hidden: true, value: '#06b6d4', oninput: (e) => { state.product.patternColor = e.target.value; emit('product'); } });
  patSw.append(h('label', { class: 'swatch', title: 'Color libre', style: 'background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red);cursor:pointer' }, customPat));

  $('#pattern-alpha').addEventListener('input', (e) => {
    state.product.patternAlpha = +e.target.value;
    $('#pattern-alpha-out').textContent = Math.round(state.product.patternAlpha * 100) + '%';
    emit('product');
  });

  // ---------------- Ajuste y Tallas ----------------
  $('#sizes').append(...CONFIG.sizes.map((s) => h('button', { 'data-v': s, text: s, onclick: () => setProduct({ size: s }) })));
  $$('#seg-fit button').forEach((b) => b.addEventListener('click', () => setProduct({ fit: b.dataset.v })));
  $('#tab-product .muted.small').textContent = $('#tab-product .muted.small').textContent.replace('{{min}}', CONFIG.prices.bulkMinQty);

  function setProduct(patch) {
    Object.assign(state.product, patch);
    emit('product');
  }

  function renderProduct() {
    const p = state.product;
    $$('#seg-zone button').forEach((b) => b.classList.toggle('active', b.dataset.z === state.activeZone));

    const activeHex = (currentZoneColor() || p.color).toLowerCase();
    $$('#swatches .swatch[data-hex]').forEach((b) => b.classList.toggle('active', b.dataset.hex.toLowerCase() === activeHex));
    const known = CONFIG.colors.find((c) => c.hex.toLowerCase() === activeHex);
    const zoneLabel = CONFIG.zones.find((z) => z.id === state.activeZone)?.label || 'Toda';
    $('#color-name').textContent = `${zoneLabel}: ${known ? known.name : activeHex}`;

    $$('#pattern-grid .pattern-btn').forEach((b) => b.classList.toggle('active', b.dataset.pat === p.pattern));
    $('#pattern-controls').hidden = p.pattern === 'solid';
    $$('#pattern-swatches .swatch[data-phex]').forEach((b) => b.classList.toggle('active', b.dataset.phex.toLowerCase() === (p.patternColor || '').toLowerCase()));
    $('#pattern-alpha').value = p.patternAlpha ?? 0.85;
    $('#pattern-alpha-out').textContent = Math.round((p.patternAlpha ?? 0.85) * 100) + '%';

    $$('#seg-fit button').forEach((b) => b.classList.toggle('active', b.dataset.v === p.fit));
    $$('#sizes button').forEach((b) => b.classList.toggle('active', b.dataset.v === p.size));
    renderPrice();
  }

  function renderPrice() {
    const info = priceInfo();
    const ul = $('#price-lines');
    ul.innerHTML = '';
    info.lines.forEach((l) => ul.append(h('li', {}, h('span', { text: l.label }), h('span', { text: money(l.amount) }))));
    if (info.qty > 1) ul.append(h('li', {}, h('span', { text: `Cantidad × ${info.qty}` }), h('span', { text: money(info.subtotal) })));
    if (info.discount) ul.append(h('li', { class: 'disc' }, h('span', { text: `Descuento por volumen (${Math.round(info.discount * 100)}%)` }), h('span', { text: '−' + money(info.subtotal * info.discount) })));
    ul.append(h('li', { class: 'total' }, h('span', { text: 'Total' }), h('span', { text: money(info.total) })));
    $('#buy-total').textContent = money(info.total);
    $('#buy-sub').textContent = `${info.qty} × ${money(info.unit)} · talla ${state.product.size}`;
    $('#qty-val').textContent = info.qty;
  }
  $('#qty-minus').onclick = () => { state.product.qty = Math.max(1, state.product.qty - 1); renderPrice(); };
  $('#qty-plus').onclick = () => { state.product.qty = Math.min(99, state.product.qty + 1); renderPrice(); };
  on('product', renderProduct);
  on('layers', renderPrice);

  // ---------------- Añadir ----------------
  $('#shape-grid').append(...CONFIG.shapes.map((s) => h('button', { title: s.label, html: shapeSvg(s.type) + `<span>${s.label}</span>`, onclick: () => addShape(s.type) })));
  $('#sticker-grid').append(...CONFIG.stickers.map((c) => h('button', { text: c, onclick: () => addElement({ type: 'emoji', char: c }) })));

  $('#btn-add-text').onclick = () => {
    const baseHex = state.side === 'back' ? state.product.zones.back : state.product.zones.front;
    addElement({
      type: 'text', text: 'TU TEXTO', font: 'Anton', color: contrastInk(baseHex), strokeColor: '#000000',
      strokeW: 0, curve: 0, spacing: 2, align: 'center', y: -0.25, s: 1.2,
    });
  };

  $('#btn-add-chest').onclick = () => {
    viewer.setView('front');
    addElement({
      type: 'shape', shape: 'star', fill: '#facc15', stroke: '#0f172a', strokeW: 3, ratio: 1, radius: 0.15,
      x: 0.36, y: -0.58, s: 0.55,
    }, 'front');
    toast('Escudo añadido en el pecho izquierdo');
  };

  $('#btn-add-dorsal').onclick = () => {
    viewer.setView('back');
    const ink = contrastInk(state.product.zones.back);
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

  function addShape(type) {
    const baseHex = state.side === 'back' ? state.product.zones.back : state.product.zones.front;
    const dark = lum(baseHex) < 0.5;
    addElement({ type: 'shape', shape: type, fill: dark ? '#fbbf24' : '#e11d48', stroke: '#000000', strokeW: 0, ratio: 1, radius: 0.15 });
  }

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
      addElement({ type: 'image', imgId: id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 24), y: -0.25, s: 1.1 });
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

  // ---------------- Capas y propiedades ----------------
  const layersEl = $('#layers');
  const propsEl = $('#props');
  let binders = [];
  let editKey = null;
  const begin = (k) => { if (editKey !== k) { commit(); editKey = k; } };
  document.addEventListener('change', () => (editKey = null));
  document.addEventListener('focusout', () => (editKey = null));
  document.addEventListener('pointerup', () => setTimeout(() => (editKey = null), 0));

  const layerLabel = (el) => {
    if (el.type === 'text') return (el.text || '').split('\n')[0] || 'Texto';
    if (el.type === 'image') return el.name || 'Imagen';
    if (el.type === 'shape') return CONFIG.shapes.find((s) => s.type === el.shape)?.label || 'Forma';
    return 'Sticker';
  };
  const layerThumb = (el) => {
    if (el.type === 'image') return h('img', { src: images.get(el.imgId)?.src || '', alt: '' });
    if (el.type === 'text') return h('span', { text: 'T', style: `font-family:"${el.font}";font-weight:700` });
    if (el.type === 'emoji') return h('span', { text: el.char });
    return h('span', { text: SHAPE_GLYPH[el.shape], style: `color:${el.fill}` });
  };

  function renderLayers() {
    $('#side-label').textContent = state.side === 'front' ? 'Frente' : 'Espalda';
    layersEl.innerHTML = '';
    const list = state.elements[state.side];
    [...list].reverse().forEach((el) => {
      const li = h('li', { class: 'layer' + (el.id === state.selectedId ? ' active' : '') + (el.hidden ? ' off' : ''), 'data-id': el.id, onclick: () => selectElement(el.id) },
        h('div', { class: 'thumb' }, layerThumb(el)),
        h('div', { class: 'name', text: layerLabel(el) }),
        h('button', {
          class: 'eye', title: el.hidden ? 'Mostrar' : 'Ocultar', text: el.hidden ? '🚫' : '👁',
          onclick: (e) => { e.stopPropagation(); commit(); el.hidden = !el.hidden; changed(true); },
        }));
      layersEl.append(li);
    });
  }

  const fld = (label, ...ctrl) => h('div', { class: 'field' }, h('span', { class: 'lbl' }, label), ...ctrl);

  function range(el, key, label, min, max, step, fmt = (v) => v) {
    const out = h('output');
    const input = h('input', { type: 'range', min, max, step });
    const sync = () => { input.value = el[key] ?? 0; out.textContent = fmt(+input.value); };
    input.addEventListener('input', () => {
      begin(el.id + key);
      el[key] = +input.value;
      out.textContent = fmt(el[key]);
      changed(false, el.side);
    });
    binders.push(sync);
    sync();
    return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label, out), input);
  }

  const QUICK = ['#ffffff', '#111111', '#e11d48', '#f59e0b', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
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

  function renderProps() {
    binders = [];
    propsEl.innerHTML = '';
    const el = selected();
    if (!el) {
      propsEl.append(h('p', { class: 'muted small', text: 'Selecciona una capa, o toca un diseño sobre la camiseta 3D, para moverlo, escalarlo o rotarlo.' }));
      return;
    }
    const card = h('div', { class: 'prop-card' });

    if (el.type === 'text') {
      const ta = h('textarea', { rows: 2, spellcheck: false });
      ta.addEventListener('input', () => {
        begin(el.id + 'text');
        el.text = ta.value;
        changed(false, el.side);
        const name = $(`.layer[data-id="${el.id}"] .name`);
        if (name) name.textContent = layerLabel(el);
      });
      const syncText = () => { if (document.activeElement !== ta) ta.value = el.text; };
      binders.push(syncText);
      syncText();
      card.append(fld('Texto', ta));

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
      card.append(fld('Tipografía', grid));
      card.append(colorField(el, 'color', 'Color'));
      card.append(colorField(el, 'strokeColor', 'Color del contorno'));
      card.append(range(el, 'strokeW', 'Grosor del contorno', 0, 14, 0.5));
      card.append(range(el, 'curve', 'Curvatura', -100, 100, 1, (v) => v + '%'));
      card.append(range(el, 'spacing', 'Espaciado de letras', -10, 60, 1));
      card.append(miniSeg(el, 'align', 'Alineación', [['left', '⇤'], ['center', '↔'], ['right', '⇥']]));
    }

    if (el.type === 'shape') {
      card.append(miniSeg(el, 'shape', 'Forma', CONFIG.shapes.map((s) => [s.type, SHAPE_GLYPH[s.type]])));
      card.append(colorField(el, 'fill', 'Relleno'));
      card.append(miniSeg(el, 'noFill', 'Relleno activo', [['false', 'Con relleno'], ['true', 'Sólo contorno']], () => { el.noFill = el.noFill === 'true' || el.noFill === true; if (el.noFill && !(el.strokeW > 0)) el.strokeW = 6; }));
      card.append(colorField(el, 'stroke', 'Color del contorno'));
      card.append(range(el, 'strokeW', 'Grosor del contorno', 0, 14, 0.5));
      if (['rect', 'circle'].includes(el.shape)) card.append(range(el, 'ratio', 'Proporción alto/ancho', 0.2, 2, 0.01));
      if (el.shape === 'rect') card.append(range(el, 'radius', 'Esquinas redondeadas', 0, 1, 0.01, (v) => Math.round(v * 100) + '%'));
    }

    card.append(range(el, 's', 'Tamaño', 0.1, 4.5, 0.01, (v) => Math.round(v * 100) + '%'));
    card.append(range(el, 'rot', 'Rotación', -180, 180, 1, (v) => v + '°'));
    card.append(range(el, 'opacity', 'Opacidad', 0.1, 1, 0.01, (v) => Math.round(v * 100) + '%'));

    const act = h('div', { class: 'actions' },
      h('button', { class: 'btn', text: 'Centrar', onclick: () => { commit(); el.x = 0; changed(false, el.side); } }),
      el.type === 'image' && h('button', { class: 'btn', text: 'Voltear', onclick: () => { commit(); el.flipX = !el.flipX; changed(false, el.side); } }),
      h('button', { class: 'btn', text: '▲ Subir', onclick: () => moveLayer(el.id, 1) }),
      h('button', { class: 'btn', text: '▼ Bajar', onclick: () => moveLayer(el.id, -1) }),
      h('button', { class: 'btn', text: 'Duplicar', onclick: () => duplicateElement(el.id) }),
      h('button', { class: 'btn danger', text: 'Eliminar', onclick: () => removeElement(el.id) }));
    card.append(act);
    propsEl.append(card);
  }

  let lastSel = null;
  on('layers', () => {
    renderLayers();
    renderProps();
    if (state.selectedId && state.selectedId !== lastSel) showTab('edit');
    lastSel = state.selectedId;
  });
  on('design', () => binders.forEach((f) => f()));
  on('side', renderLayers);
  $('#btn-clear-side').onclick = () => clearSide(state.side);

  // ---------------- Barra del visor y fondos ----------------
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
    viewer.setAutoRotate(!viewer.autoRotate);
    e.currentTarget.classList.toggle('active', viewer.autoRotate);
  };
  $('#btn-guides').onclick = (e) => {
    state.guides = !state.guides;
    e.currentTarget.classList.toggle('active', state.guides);
    emit('design');
  };
  $('#bg-color').oninput = (e) => setStageBg(e.target.value);
  setStageBg(state.bg);
  setTimeout(() => $('#stage-hint').classList.add('fade'), 9000);

  // ---------------- Historial ----------------
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
    else if (e.key === 'Escape' && el) selectElement(null);
    else if (el && e.key.startsWith('Arrow')) {
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
    const pat = CONFIG.patterns.find((x) => x.id === p.pattern)?.label || 'Liso';
    return `Talla ${p.size} · ${p.fit === 'oversize' ? 'Oversize' : 'Regular'} · Patrón ${pat}`;
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
          h('b', { text: 'Camisa personalizada Pro' }),
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

  function unitFor(design) {
    const P = CONFIG.prices;
    const p = design.product;
    const sides = ['front', 'back'].filter((s) => design.elements[s].some((e) => !e.hidden));
    return {
      sides,
      unit: P.base + (p.pattern && p.pattern !== 'solid' ? P.pattern : 0) + (p.fit === 'oversize' ? P.oversize : 0) + P.printSide * sides.length,
    };
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

  $('#btn-add-cart').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const design = serializeDesign();
      const { sides, unit } = unitFor(design);
      const jpg = (c) => c.toDataURL('image/jpeg', 0.88);
      const thumbFront = jpg(viewer.capture('front', 400));
      const thumbBack = sides.includes('back') ? jpg(viewer.capture('back', 400)) : null;
      const qty = state.product.qty;
      cart.push({ id: newId('c'), createdAt: Date.now(), design, sides, unit, qty, total: itemTotal(unit, qty), thumbFront, thumbBack });
      await saveCart();
      renderCart();
      toast('Añadido al carrito', 'Ver carrito', () => dlgCart.showModal());
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
    const lines = order.items.map((i) => `• ${i.qty}× Camisa ${describe(i.design.product)} — ${money(i.total)}`);
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
  renderProps();
  syncHistory();
  return { showTab };
}
