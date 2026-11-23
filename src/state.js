// Estado global del editor + eventos + historial (deshacer / rehacer).
import { CONFIG } from './config.js';

const listeners = {};
export const on = (ev, fn) => {
  (listeners[ev] ||= []).push(fn);
};
export const emit = (ev, ...args) => (listeners[ev] || []).forEach((f) => f(...args));

export const state = {
  product: { color: CONFIG.colors[0].hex, neck: 'round', sleeve: 'short', fit: 'regular', size: 'M', qty: 1 },
  elements: { front: [], back: [] },
  selectedId: null,
  side: 'front', // lado que mira a la cámara
  guides: true,
  bg: '#e8ecf3',
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
export function addElement(el) {
  commit();
  el.id = newId();
  el.side = state.side;
  el.x ??= 0;
  el.y ??= -0.25;
  el.rot ??= 0;
  el.s ??= 1;
  el.opacity ??= 1;
  state.elements[el.side].push(el);
  state.selectedId = el.id;
  changed(true);
  return el;
}

export function removeElement(id) {
  const el = findElement(id);
  if (!el) return;
  commit();
  const list = state.elements[el.side];
  list.splice(list.indexOf(el), 1);
  if (state.selectedId === id) state.selectedId = null;
  changed(true);
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
  changed(true);
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
  changed(true);
}

export function clearSide(side) {
  if (!state.elements[side].length) return;
  commit();
  state.elements[side] = [];
  if (selected() === null) state.selectedId = null;
  changed(true);
}

// ---------- Precio ----------
export function priceInfo() {
  const P = CONFIG.prices;
  const p = state.product;
  const lines = [{ label: 'Camisa lisa', amount: P.base }];
  if (p.sleeve === 'long') lines.push({ label: 'Manga larga', amount: P.longSleeve });
  if (p.fit === 'oversize') lines.push({ label: 'Ajuste oversize', amount: P.oversize });
  const sides = ['front', 'back'].filter((s) => state.elements[s].some((e) => !e.hidden));
  if (sides.length) {
    lines.push({
      label: `Estampado ${sides.length === 2 ? 'frente + espalda' : sides[0] === 'front' ? 'frente' : 'espalda'}`,
      amount: P.printSide * sides.length,
    });
  }
  const unit = lines.reduce((a, l) => a + l.amount, 0);
  const qty = p.qty;
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
    v: 1,
    product: { ...state.product },
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
  state.product = { ...state.product, ...data.product };
  state.elements = { front: data.elements?.front || [], back: data.elements?.back || [] };
  state.selectedId = null;
  resetHistory();
  emit('product');
  changed(true);
}
