// Motor de texturizado 2D (Atlas 2048x2048) para el modelo 3D shirt_baked.glb.
// Pinta color de prenda, color de cuello (para referencias de cuello en color) y estampados HD.
import { images } from './state.js';
import { getReference, getPrintSpace } from './config.js';

export const ATLAS_SIZE = 2048;
export const UV_UNIT = 0.165; // 1 unidad de diseño = 0.165 en espacio UV (proporción 1:1)
export const PPU = UV_UNIT * ATLAS_SIZE;

// Islas UV exactas de shirt_baked.glb (flipY = false: v=0 arriba, v=1 abajo)
export const UV_ZONES = {
  front: { u0: 0.0, v0: 0.0, u1: 0.502, v1: 0.721 },
  back: { u0: 0.502, v0: 0.0, u1: 1.0, v1: 0.721 },
  sleeveR: { u0: 0.0, v0: 0.721, u1: 0.385, v1: 0.941 },
  sleeveL: { u0: 0.385, v0: 0.721, u1: 0.765, v1: 0.941 },
  collar: { u0: 0.0, v0: 0.941, u1: 0.55, v1: 1.0 },
};

// Centros UV del área de estampado para frente, espalda y mangas
export const SIDE_CENTER = {
  front: { u: 0.26, v: 0.375 },
  back: { u: 0.742, v: 0.375 },
  sleeveR: { u: 0.1925, v: 0.831 },
  sleeveL: { u: 0.575, v: 0.831 },
};

const PRINTABLE_SIDES = ['front', 'back', 'sleeveL', 'sleeveR'];

// Convierte UV del GLB -> lado y coordenadas de diseño (x: derecha, y: abajo)
export function uvToDesign(u, v, forceSide = null) {
  let side = forceSide;
  if (!side) {
    if (v <= 0.721) side = u < 0.502 ? 'front' : 'back';
    else if (v <= 0.941) side = u < 0.385 ? 'sleeveR' : u <= 0.765 ? 'sleeveL' : null;
    else return null;
  }
  if (!side || !SIDE_CENTER[side]) return null;
  const c = SIDE_CENTER[side];
  return {
    side,
    pt: { x: (u - c.u) / UV_UNIT, y: (v - c.v) / UV_UNIT },
  };
}

// Tamaño base (en centésimas de unidad de diseño) con s = 1
export const BASE = { image: 65, shape: 52, emoji: 44, text: 22 };
const TEXT_PX = 100;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const measureCtx = document.createElement('canvas').getContext('2d');

// ---------- Texto ----------
function textLayout(el) {
  const ctx = measureCtx;
  ctx.font = `${TEXT_PX}px "${el.font}", sans-serif`;
  const lines = String(el.text || ' ').split('\n');
  const spacing = el.spacing || 0;
  const widths = lines.map((l) => {
    let w = ctx.measureText(l).width;
    w += spacing * Math.max(0, [...l].length - 1);
    return w;
  });
  const maxW = Math.max(...widths, 1);
  const lineH = TEXT_PX * 1.08;
  return { lines, widths, maxW, lineH, h: lines.length * lineH };
}

function localSize(el) {
  switch (el.type) {
    case 'image': {
      const rec = images.get(el.imgId);
      const ratio = rec ? rec.h / rec.w : 1;
      return { w: BASE.image, h: BASE.image * ratio };
    }
    case 'shape':
      return { w: BASE.shape, h: BASE.shape * (el.ratio || 1) };
    case 'emoji':
      return { w: BASE.emoji, h: BASE.emoji };
    case 'text': {
      const k = BASE.text / TEXT_PX;
      const t = textLayout(el);
      let w = t.maxW * k;
      let h = t.h * k;
      const curve = el.curve || 0;
      if (curve) {
        const sweep = (Math.abs(curve) / 100) * Math.PI;
        const R = t.maxW / sweep;
        const half = Math.min(sweep / 2, Math.PI);
        w = Math.max(2 * R * Math.sin(Math.min(half, Math.PI / 2)), 10) * k;
        h = h + R * (1 - Math.cos(half)) * k;
      }
      return { w: Math.max(w, 4), h: Math.max(h, 4) };
    }
    default:
      return { w: 40, h: 40 };
  }
}

export const CM_PER_UNIT = 20; // 1 unidad de diseño = 20 cm (Carta 1.08×1.4 = 21.6×28 cm)

export function getBounds(el) {
  const b = localSize(el);
  return { w: (b.w * el.s) / 100, h: (b.h * el.s) / 100 };
}

/** Dimensiones reales aproximadas del elemento en cm y área en cm². */
export function getElementSizeCm(el) {
  const b = getBounds(el);
  const wCm = Math.max(1, Math.round(b.w * CM_PER_UNIT * 10) / 10);
  const hCm = Math.max(1, Math.round(b.h * CM_PER_UNIT * 10) / 10);
  const areaCm2 = Math.max(1, Math.round(wCm * hCm));
  return { wCm, hCm, areaCm2 };
}

/** Espacio efectivo de impresión: adapta Tamaño Carta (horizontal/vertical) a la orientación real de la imagen (incluso rotada). */
export function getEffectiveSpace(el, fallbackSpaceId = null) {
  const sp = getPrintSpace(el?.space || fallbackSpaceId);
  if (!el || sp.unlimited || sp.w === sp.h) return sp;
  const b = localSize(el);
  const a = ((el.rot || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  const rotW = b.w * cos + b.h * sin;
  const rotH = b.w * sin + b.h * cos;
  const elIsLandscape = rotW > rotH;
  const spIsLandscape = sp.w > sp.h;
  if (elIsLandscape !== spIsLandscape) {
    return { ...sp, w: sp.h, h: sp.w, desc: `${sp.desc} horizontal` };
  }
  return { ...sp, desc: `${sp.desc} vertical` };
}

/** Escala máxima para maximizar un elemento dentro de su espacio de impresión seleccionado. */
export function maxScaleForElement(el, spaceId) {
  const sp = getEffectiveSpace({ ...el, space: spaceId || el?.space }, spaceId);
  const b = localSize(el);
  const a = ((el?.rot || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  const bw = (b.w * cos + b.h * sin) / 100;
  const bh = (b.w * sin + b.h * cos) / 100;
  if (bw <= 0 || bh <= 0) return 1.5;
  return Math.max(0.01, Math.min(sp.w / bw, sp.h / bh));
}

const SPACE_ORDER = ['pequeno', 'mediano', 'grande', 'especial'];

/** Determina el área de impresión más pequeña en la que cabe el elemento actual. */
export function fitPrintSpaceForElement(el) {
  const b = localSize(el);
  const a = ((el?.rot || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  const w = ((b.w * cos + b.h * sin) * (el.s || 0.01)) / 100;
  const h = ((b.w * sin + b.h * cos) * (el.s || 0.01)) / 100;
  const eps = 0.005;
  for (const id of ['pequeno', 'mediano', 'grande']) {
    const sp = getEffectiveSpace({ ...el, space: id }, id);
    if (w <= sp.w + eps && h <= sp.h + eps) return id;
  }
  return 'especial';
}

/** Al reducir la escala, baja automáticamente el área de impresión a una igual o inferior que contenga la imagen. */
export function autoDowngradePrintSpace(el, prevScale) {
  if (!el || !(el.s < prevScale)) return false;
  const curId = el.space || 'especial';
  const curIdx = SPACE_ORDER.indexOf(curId);
  const bestId = fitPrintSpaceForElement(el);
  const bestIdx = SPACE_ORDER.indexOf(bestId);
  if (bestIdx >= 0 && curIdx >= 0 && bestIdx < curIdx) {
    el.space = bestId;
    return true;
  }
  return false;
}

function drawTextLine(ctx, text, width, y, el, maxW) {
  const spacing = el.spacing || 0;
  const curve = el.curve || 0;
  let x0 = 0;
  if (el.align === 'left') x0 = -(maxW - width) / 2;
  else if (el.align === 'right') x0 = (maxW - width) / 2;

  const paint = (str, x, yy) => {
    if (el.strokeW > 0) ctx.strokeText(str, x, yy);
    ctx.fillText(str, x, yy);
  };

  if (!curve && !spacing) {
    ctx.textAlign = 'center';
    paint(text, x0, y);
    return;
  }
  ctx.textAlign = 'left';
  const chars = [...text];
  const cw = chars.map((c) => ctx.measureText(c).width);
  if (!curve) {
    let x = x0 - width / 2;
    chars.forEach((c, i) => {
      paint(c, x, y);
      x += cw[i] + spacing;
    });
    return;
  }
  const sweep = (Math.abs(curve) / 100) * Math.PI;
  const R = maxW / sweep;
  const sign = curve > 0 ? 1 : -1;
  const sag = R * (1 - Math.cos(Math.min(sweep / 2, Math.PI)));
  let pos = -width / 2;
  chars.forEach((c, i) => {
    const mid = pos + cw[i] / 2;
    const th = mid / R;
    ctx.save();
    ctx.translate(R * Math.sin(th), sign * (R * (1 - Math.cos(th)) - sag / 2));
    ctx.rotate(sign * th);
    ctx.textAlign = 'center';
    paint(c, 0, y);
    ctx.restore();
    pos += cw[i] + spacing;
  });
}

function drawText(ctx, el) {
  const t = textLayout(el);
  ctx.font = `${TEXT_PX}px "${el.font}", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = el.color;
  ctx.strokeStyle = el.strokeColor || '#000';
  ctx.lineWidth = (el.strokeW || 0) * 2;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.scale(BASE.text / TEXT_PX, BASE.text / TEXT_PX);
  t.lines.forEach((line, i) => {
    const y = (i - (t.lines.length - 1) / 2) * t.lineH;
    drawTextLine(ctx, line, t.widths[i], y, el, t.maxW);
  });
}

// ---------- Formas ----------
function shapePath(ctx, type, w, h, radius = 0) {
  const hw = w / 2;
  const hh = h / 2;
  ctx.beginPath();
  switch (type) {
    case 'rect': {
      const r = Math.min(hw, hh) * (radius || 0);
      if (r > 0 && ctx.roundRect) ctx.roundRect(-hw, -hh, w, h, r);
      else ctx.rect(-hw, -hh, w, h);
      break;
    }
    case 'circle':
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.closePath();
      break;
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.42;
        const px = Math.cos(a) * hw * r;
        const py = Math.sin(a) * hh * r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'heart': {
      ctx.moveTo(0, hh);
      ctx.bezierCurveTo(-hw * 1.2, hh * 0.25, -hw * 1.05, -hh * 0.95, 0, -hh * 0.35);
      ctx.bezierCurveTo(hw * 1.05, -hh * 0.95, hw * 1.2, hh * 0.25, 0, hh);
      ctx.closePath();
      break;
    }
    case 'bolt': {
      const pts = [
        [0.15, -1], [-0.7, 0.1], [-0.05, 0.1], [-0.3, 1], [0.7, -0.2], [0.05, -0.2], [0.55, -1],
      ];
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * hw, py * hh) : ctx.moveTo(px * hw, py * hh)));
      ctx.closePath();
      break;
    }
  }
}

function drawShape(ctx, el) {
  const { w, h } = localSize(el);
  shapePath(ctx, el.shape, w, h, el.radius);
  if (el.fill !== null && el.fill !== undefined && !el.noFill) {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  if (el.strokeW > 0) {
    ctx.strokeStyle = el.stroke || '#000';
    ctx.lineWidth = el.strokeW;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

export function drawElement(ctx, el, ppu = PPU, cx = 0, cy = 0) {
  if (el.hidden) return;
  ctx.save();
  ctx.translate(cx + el.x * ppu, cy + el.y * ppu);
  ctx.rotate((el.rot * Math.PI) / 180);
  const k = (el.s * ppu) / 100;
  ctx.scale(k, k);
  ctx.globalAlpha = el.opacity ?? 1;
  switch (el.type) {
    case 'image': {
      const rec = images.get(el.imgId);
      if (rec) {
        const { w, h } = localSize(el);
        if (el.flipX) ctx.scale(-1, 1);
        ctx.drawImage(rec.img, -w / 2, -h / 2, w, h);
      }
      break;
    }
    case 'shape':
      drawShape(ctx, el);
      break;
    case 'emoji':
      ctx.font = `${BASE.emoji * 0.88}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.char, 0, 2);
      break;
    case 'text':
      drawText(ctx, el);
      break;
  }
  ctx.restore();
}

function visibleBounds(el) {
  const b = getBounds(el);
  const sp = getEffectiveSpace(el);
  if (sp.unlimited) return b;
  return { w: Math.min(b.w, sp.w), h: Math.min(b.h, sp.h) };
}

function drawClippedElement(ctx, el, ppu = PPU, cx = 0, cy = 0, fallbackSpaceId = null) {
  if (el.hidden) return;
  const sp = getEffectiveSpace(el, fallbackSpaceId);
  if (sp.unlimited) {
    drawElement(ctx, el, ppu, cx, cy);
    return;
  }
  const w = sp.w * ppu;
  const h = sp.h * ppu;
  const ex = cx + el.x * ppu;
  const ey = cy + el.y * ppu;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ex - w / 2, ey - h / 2, w, h);
  ctx.clip();
  drawElement(ctx, el, ppu, cx, cy);
  ctx.restore();
}

// ---------- Guías de edición ----------
const PAD = 0.04;
const HANDLE_R = 0.065;

function handlePositions(el) {
  const b = visibleBounds(el);
  const hw = b.w / 2 + PAD;
  const hh = b.h / 2 + PAD;
  return {
    scale: [hw, hh],
    rotate: [0, -hh - 0.16],
    delete: [-hw, -hh],
  };
}

function toWorld(el, [lx, ly]) {
  const a = (el.rot * Math.PI) / 180;
  return { x: el.x + lx * Math.cos(a) - ly * Math.sin(a), y: el.y + lx * Math.sin(a) + ly * Math.cos(a) };
}

export function hitHandle(el, pt) {
  const hp = handlePositions(el);
  for (const name of ['delete', 'rotate', 'scale']) {
    const w = toWorld(el, hp[name]);
    if (Math.hypot(pt.x - w.x, pt.y - w.y) <= HANDLE_R * 1.6) return name;
  }
  return null;
}

export function hitElement(el, pt) {
  if (el.hidden) return false;
  const sp = getEffectiveSpace(el);
  if (!sp.unlimited) {
    if (Math.abs(pt.x - el.x) > sp.w / 2 + 0.02 || Math.abs(pt.y - el.y) > sp.h / 2 + 0.02) return false;
  }
  const b = getBounds(el);
  const a = (-el.rot * Math.PI) / 180;
  const dx = pt.x - el.x;
  const dy = pt.y - el.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= b.w / 2 + 0.02 && Math.abs(ly) <= b.h / 2 + 0.02;
}

function drawGuides(ctx, el, cx, cy) {
  const b = visibleBounds(el);
  const hw = b.w / 2 + PAD;
  const hh = b.h / 2 + PAD;
  ctx.save();
  ctx.translate(cx + el.x * PPU, cy + el.y * PPU);
  ctx.rotate((el.rot * Math.PI) / 180);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(-hw * PPU, -hh * PPU, hw * 2 * PPU, hh * 2 * PPU);
  ctx.setLineDash([]);
  const hp = handlePositions(el);
  ctx.beginPath();
  ctx.moveTo(0, -hh * PPU);
  ctx.lineTo(hp.rotate[0] * PPU, hp.rotate[1] * PPU);
  ctx.stroke();
  const dot = (name, bg, fg, glyph) => {
    const [x, y] = hp[name];
    ctx.beginPath();
    ctx.arc(x * PPU, y * PPU, HANDLE_R * PPU, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = fg;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = `bold ${HANDLE_R * PPU * 1.3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x * PPU, y * PPU + 1);
  };
  dot('scale', '#ffffff', '#2563eb', '⤡');
  dot('rotate', '#ffffff', '#2563eb', '↻');
  dot('delete', '#ffffff', '#e11d48', '×');
  ctx.restore();
}

function drawElementSpaceLimit(ctx, el, cx, cy, fallbackSpaceId) {
  const sp = getEffectiveSpace(el, fallbackSpaceId);
  if (sp.unlimited) return;
  const w = sp.w * PPU;
  const h = sp.h * PPU;
  const ex = cx + el.x * PPU;
  const ey = cy + el.y * PPU;
  const x0 = ex - w / 2;
  const y0 = ey - h / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([12, 9]);
  ctx.strokeRect(x0, y0, w, h);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(37, 99, 235, 0.85)';
  ctx.font = '600 20px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${sp.label} · ${sp.desc}`, ex, y0 + h + 8);
  ctx.restore();
}

/** Pinta el atlas completo 2048x2048 de la camiseta 3D. */
export function paintAtlas(ctx, { elements, product, guides = true, selectedId = null }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const base = product.color || '#f7f7f5';
  const ref = getReference(product.line, product.reference);

  // Color base de toda la prenda
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  // Cuello de color independiente para referencias "Cuello colores normal / crop top"
  if (ref.customCollar && product.collarColor) {
    const colRect = UV_ZONES.collar;
    ctx.fillStyle = product.collarColor;
    ctx.fillRect(
      colRect.u0 * ATLAS_SIZE,
      colRect.v0 * ATLAS_SIZE,
      (colRect.u1 - colRect.u0) * ATLAS_SIZE,
      (colRect.v1 - colRect.v0) * ATLAS_SIZE,
    );
  }

  // Estampados en frente, espalda y mangas (recortados a su zona UV)
  for (const side of PRINTABLE_SIDES) {
    const list = elements[side] || [];
    if (!list.length) continue;
    const rect = UV_ZONES[side];
    const c = SIDE_CENTER[side];
    const cx = c.u * ATLAS_SIZE;
    const cy = c.v * ATLAS_SIZE;
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      rect.u0 * ATLAS_SIZE,
      rect.v0 * ATLAS_SIZE,
      (rect.u1 - rect.u0) * ATLAS_SIZE,
      (rect.v1 - rect.v0) * ATLAS_SIZE,
    );
    ctx.clip();

    for (const el of list) {
      drawClippedElement(ctx, el, PPU, cx, cy, product?.printSpace);
    }
    if (guides) {
      const sel = list.find((e) => e.id === selectedId);
      if (sel) {
        drawElementSpaceLimit(ctx, sel, cx, cy, product?.printSpace);
        drawGuides(ctx, sel, cx, cy);
      }
    }
    ctx.restore();
  }
}

/** Exporta sólo el arte de un lado (PNG transparente recortado a las estampas). */
export function exportArt(elements, side, scale = 2.5) {
  const list = (elements[side] || []).filter((e) => !e.hidden);
  if (!list.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const el of list) {
    const sp = getEffectiveSpace(el);
    const b = getBounds(el);
    const a = (el.rot * Math.PI) / 180;
    let ex = (Math.abs(b.w * Math.cos(a)) + Math.abs(b.h * Math.sin(a))) / 2;
    let ey = (Math.abs(b.w * Math.sin(a)) + Math.abs(b.h * Math.cos(a))) / 2;
    if (!sp.unlimited) {
      ex = Math.min(ex, sp.w / 2);
      ey = Math.min(ey, sp.h / 2);
    }
    x0 = Math.min(x0, el.x - ex);
    x1 = Math.max(x1, el.x + ex);
    y0 = Math.min(y0, el.y - ey);
    y1 = Math.max(y1, el.y + ey);
  }
  const ppu = PPU * scale;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil((x1 - x0) * ppu));
  c.height = Math.max(1, Math.ceil((y1 - y0) * ppu));
  const ctx = c.getContext('2d');
  for (const el of list) drawClippedElement(ctx, el, ppu, -x0 * ppu, -y0 * ppu);
  return c;
}
