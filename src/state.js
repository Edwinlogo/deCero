// Estado global del editor + eventos + historial (deshacer / rehacer).
import { CONFIG, getLine, getReference, getSizesForAudience } from './config.js';

const listeners = {};
export const on = (ev, fn) => {
  (listeners[ev] ||= []).push(fn);
};
export const emit = (ev, ...args) => (listeners[ev] || []).forEach((f) => f(...args));

export function defaultProduct() {
  const white = CONFIG.colors.find((c) => c.name === 'Blanco')?.hex || '#f7f7f5';
  const black = CONFIG.colors.find((c) => c.name === 'Negro')?.hex || '#17181b';
  return {
    line: 'basica',
    audience: 'Hombre',
    reference: 'algodon-175',
    color: white,
    collarColor: black,
    size: 'M',
    qty: 1,
  };
}

export function normalizeProduct(p) {
  const validAudiences = ['Hombre', 'Mujer', 'Niños'];
  if (!validAudiences.includes(p.audience)) {
    p.audience = 'Hombre';
  }
  let line = getLine(p.line);
  if (!line.audiences.includes(p.audience)) {
    line = CONFIG.productLines.find((l) => l.audiences.includes(p.audience)) || CONFIG.productLines[0];
    p.line = line.id;
  } else {
    p.line = line.id;
  }
  let ref = line.references.find((r) => r.id === p.reference && r.audiences.includes(p.audience));
  if (!ref) {
    ref = line.references.find((r) => r.audiences.includes(p.audience)) || line.references[0];
    p.reference = ref.id;
  }
  const sizes = getSizesForAudience(p.audience);
  if (!sizes.includes(p.size)) {
    p.size = p.audience === 'Niños' ? sizes[1] : 'M';
  }
  if (!CONFIG.colors.some((c) => c.hex.toLowerCase() === (p.color || '').toLowerCase())) {
    p.color = CONFIG.colors.find((c) => c.name === 'Blanco')?.hex || CONFIG.colors[0].hex;
  }
  if (!CONFIG.colors.some((c) => c.hex.toLowerCase() === (p.collarColor || '').toLowerCase())) {
    p.collarColor = CONFIG.colors.find((c) => c.name === 'Negro')?.hex || CONFIG.colors[0].hex;
  }
  return p;
}

export const state = {
  product: defaultProduct(),
  elements: { front: [], back: [] },
  selectedId: null,
  side: 'front', // lado que mira a la cámara ('front' | 'back')
  guides: true,
  bg: '#eceff4',
};

/** Banco de imágenes: id -> { src, img, w, h } (los elementos sólo guardan el id). */
export const images = new Map();

let uid = 1;
export const newId = (p = 'e') => p + Date.now().toString(36) + (uid++).toString(36);

export const allElements = () => [...state.elements.front, ...state.elements.back];
export const findElement = (id) => allElements().find((e) => e.id === id) || null;
export const selected = () => (state.selectedId ? findElement(state.selectedId) : null);

// ---------- Historial ----------
const undoStack = [];
const redoStack = [];
const snap = () => JSON.stringify({ elements: state.elements, selectedId: state.selectedId });

/** Llamar ANTES de una modificación para poder deshacerla. */
export function commit() {
  undoStack.push(snap());
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  emit('history');
}
function restore(s) {
  const d = JSON.parse(s);
  state.elements = d.elements;
  state.selectedId = d.selectedId && findElement(d.selectedId) ? d.selectedId : null;
  changed(true);
  emit('history');
}
export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snap());
  restore(undoStack.pop());
}
export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snap());
  restore(redoStack.pop());
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
export function resetHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  emit('history');
}

/** Notifica un cambio. structural=true cuando cambian capas/selección. side: lado afectado (opcional). */
export function changed(structural = false, side = null) {
  emit('design', side);
  if (structural) emit('layers');
}

// ---------- Operaciones sobre elementos ----------
export function addElement(el, targetSide = null) {
  commit();
  el.id = newId();
  el.side = targetSide || state.side;
  el.x ??= 0;
  el.y ??= -0.15;
  el.rot ??= 0;
  el.s ??= 1;
  el.opacity ??= 1;
  state.elements[el.side].push(el);
  state.selectedId = el.id;
  changed(true, el.side);
  return el;
}

export function removeElement(id) {
  const el = findElement(id);
  if (!el) return;
  commit();
  const list = state.elements[el.side];
  list.splice(list.indexOf(el), 1);
  if (state.selectedId === id) state.selectedId = null;
  changed(true, el.side);
}

export function selectElement(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  changed(true);
}

export function duplicateElement(id) {
  const el = findElement(id);
  if (!el) return;
  commit();
  const copy = { ...JSON.parse(JSON.stringify(el)), id: newId(), x: el.x + 0.08, y: el.y + 0.08 };
  state.elements[el.side].push(copy);
  state.selectedId = copy.id;
  changed(true, el.side);
}

/** dir: 1 = subir, -1 = bajar, 'top' / 'bottom' */
export function moveLayer(id, dir) {
  const el = findElement(id);
  if (!el) return;
  const list = state.elements[el.side];
  const i = list.indexOf(el);
  let j = i;
  if (dir === 'top') j = list.length - 1;
  else if (dir === 'bottom') j = 0;
  else j = Math.min(list.length - 1, Math.max(0, i + dir));
  if (j === i) return;
  commit();
  list.splice(i, 1);
  list.splice(j, 0, el);
  changed(true, el.side);
}

export function clearSide(side) {
  if (!state.elements[side].length) return;
  commit();
  state.elements[side] = [];
  if (selected() === null) state.selectedId = null;
  changed(true, side);
}

// ---------- Precio ----------
export function priceInfo(product = state.product, elements = state.elements) {
  const P = CONFIG.prices;
  const line = getLine(product.line);
  const ref = getReference(product.line, product.reference);
  const lines = [{ label: `${line.shortLabel} · ${ref.label}`, amount: ref.price }];
  const sides = ['front', 'back'].filter((s) => elements[s].some((e) => !e.hidden));
  if (sides.length) {
    lines.push({
      label: `Estampado ${sides.length === 2 ? 'frente + espalda' : sides[0] === 'front' ? 'frente' : 'espalda'}`,
      amount: P.printSide * sides.length,
    });
  }
  const unit = lines.reduce((a, l) => a + l.amount, 0);
  const qty = product.qty;
  const discount = qty >= P.bulkMinQty ? P.bulkDiscount : 0;
  const subtotal = unit * qty;
  const total = subtotal * (1 - discount);
  return { lines, unit, qty, discount, subtotal, total, sides };
}

// ---------- Serialización ----------
export function usedImages(elements = state.elements) {
  const ids = new Set();
  [...elements.front, ...elements.back].forEach((e) => e.type === 'image' && ids.add(e.imgId));
  const out = {};
  ids.forEach((id) => images.has(id) && (out[id] = images.get(id).src));
  return out;
}

export function serializeDesign() {
  return {
    v: 3,
    product: JSON.parse(JSON.stringify(state.product)),
    elements: JSON.parse(JSON.stringify(state.elements)),
    images: usedImages(),
  };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function registerImage(id, src) {
  if (images.has(id)) return images.get(id);
  const img = await loadImage(src);
  const rec = { src, img, w: img.naturalWidth, h: img.naturalHeight };
  images.set(id, rec);
  return rec;
}

export async function loadDesign(data) {
  for (const [id, src] of Object.entries(data.images || {})) {
    try {
      await registerImage(id, src);
    } catch {
      /* imagen corrupta: se ignora */
    }
  }
  const base = defaultProduct();
  state.product = normalizeProduct({ ...base, ...(data.product || {}) });
  state.elements = { front: data.elements?.front || [], back: data.elements?.back || [] };
  state.selectedId = null;
  resetHistory();
  emit('product');
  changed(true);
}
