// Motor de texturizado 2D (Atlas 2048x2048) para el modelo 3D shirt_baked.glb.
// Mapea zonas de confección (frente, espalda, mangas, cuello), patrones sublimados y estampados.
import { images } from './state.js';

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

// Centros UV del área de estampado para frente y espalda
export const SIDE_CENTER = {
  front: { u: 0.26, v: 0.375 },
  back: { u: 0.742, v: 0.375 },
};

// Convierte UV del GLB -> lado y coordenadas de diseño (x: derecha, y: abajo)
export function uvToDesign(u, v, forceSide = null) {
  let side = forceSide;
  if (!side) {
    if (v > 0.721) return null;
    side = u < 0.502 ? 'front' : 'back';
  }
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

export function getBounds(el) {
  const b = localSize(el);
  return { w: (b.w * el.s) / 100, h: (b.h * el.s) / 100 };
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

// ---------- Patrones textiles estilo Spized ----------
function drawPattern(ctx, rect, pattern, color, alpha) {
  if (!pattern || pattern === 'solid' || alpha <= 0) return;
  const x = rect.u0 * ATLAS_SIZE;
  const y = rect.v0 * ATLAS_SIZE;
  const w = (rect.u1 - rect.u0) * ATLAS_SIZE;
  const h = (rect.v1 - rect.v0) * ATLAS_SIZE;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  switch (pattern) {
    case 'gradient-v': {
      const g = ctx.createLinearGradient(x, y + h * 0.15, x, y + h * 0.95);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      break;
    }
    case 'gradient-d': {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, color);
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      break;
    }
    case 'stripes-v': {
      const n = 9;
      const step = w / n;
      for (let i = 0; i < n; i += 2) {
        ctx.fillRect(x + i * step + step * 0.15, y, step * 0.45, h);
      }
      break;
    }
    case 'stripes-h': {
      const n = 10;
      const step = h / n;
      for (let i = 1; i < n; i += 2) {
        ctx.fillRect(x, y + i * step, w, step * 0.42);
      }
      break;
    }
    case 'band-chest': {
      const by = y + h * 0.34;
      const bh = h * 0.18;
      ctx.fillRect(x, by, w, bh);
      ctx.fillRect(x, by - bh * 0.22, w, bh * 0.1);
      ctx.fillRect(x, by + bh * 1.12, w, bh * 0.1);
      break;
    }
    case 'chevron': {
      const cx = x + w * 0.5;
      for (let k = 0; k < 3; k++) {
        const y0 = y + h * (0.28 + k * 0.13);
        const thick = h * 0.065;
        ctx.beginPath();
        ctx.moveTo(x, y0 - h * 0.12);
        ctx.lineTo(cx, y0 + h * 0.08);
        ctx.lineTo(x + w, y0 - h * 0.12);
        ctx.lineTo(x + w, y0 - h * 0.12 + thick);
        ctx.lineTo(cx, y0 + h * 0.08 + thick);
        ctx.lineTo(x, y0 - h * 0.12 + thick);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'split': {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.62, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w * 0.18, y + h);
      ctx.closePath();
      ctx.fill();
      // línea acento paralela
      ctx.lineWidth = w * 0.022;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.55, y);
      ctx.lineTo(x + w * 0.11, y + h);
      ctx.stroke();
      break;
    }
    case 'hex': {
      const r = 34;
      const dx = r * 1.5;
      const dy = r * Math.sqrt(3);
      ctx.lineWidth = 3.5;
      for (let row = -1; row < h / dy + 2; row++) {
        for (let col = -1; col < w / dx + 2; col++) {
          const hx = x + col * dx;
          const hy = y + row * dy + (col % 2 ? dy / 2 : 0);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            const px = hx + (r - 4) * Math.cos(a);
            const py = hy + (r - 4) * Math.sin(a);
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      break;
    }
    case 'camo': {
      // Polígonos geométricos modernos deterministas
      let seed = 42;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      for (let i = 0; i < 48; i++) {
        const px = x + rnd() * w;
        const py = y + rnd() * h;
        const s = 45 + rnd() * 130;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + (rnd() - 0.3) * s, py + (rnd() - 0.5) * s);
        ctx.lineTo(px + (rnd() - 0.5) * s, py + (rnd() + 0.2) * s);
        ctx.lineTo(px - rnd() * s * 0.7, py + (rnd() - 0.2) * s);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

// ---------- Guías de edición ----------
const PAD = 0.04;
const HANDLE_R = 0.065;

function handlePositions(el) {
  const b = getBounds(el);
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
  const b = getBounds(el);
  const a = (-el.rot * Math.PI) / 180;
  const dx = pt.x - el.x;
  const dy = pt.y - el.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= b.w / 2 + 0.02 && Math.abs(ly) <= b.h / 2 + 0.02;
}

function drawGuides(ctx, el, cx, cy) {
  const b = getBounds(el);
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

function drawPrintArea(ctx, side) {
  const c = SIDE_CENTER[side];
  const cx = c.u * ATLAS_SIZE;
  const cy = c.v * ATLAS_SIZE;
  ctx.save();
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([16, 12]);
  const w = 1.48 * PPU;
  const h = 2.05 * PPU;
  ctx.strokeRect(cx - w / 2, cy - h / 2 - 0.08 * PPU, w, h);
  ctx.restore();
}

/** Pinta el atlas completo 2048x2048 de la camiseta 3D. */
export function paintAtlas(ctx, { elements, product, guides = true, selectedId = null }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const z = product.zones || {};
  const base = product.color || '#f5f5f2';

  // Fondo base para cubrir costuras/márgenes de sangrado
  ctx.fillStyle = z.front || base;
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  // Relleno por zona de confección
  const fillZone = (rect, col) => {
    ctx.fillStyle = col || base;
    ctx.fillRect(
      rect.u0 * ATLAS_SIZE,
      rect.v0 * ATLAS_SIZE,
      (rect.u1 - rect.u0) * ATLAS_SIZE,
      (rect.v1 - rect.v0) * ATLAS_SIZE,
    );
  };
  fillZone(UV_ZONES.front, z.front || base);
  fillZone(UV_ZONES.back, z.back || base);
  fillZone(UV_ZONES.sleeveR, z.sleeveR || base);
  fillZone(UV_ZONES.sleeveL, z.sleeveL || base);
  fillZone(UV_ZONES.collar, z.collar || base);

  // Patrón sublimado sobre cuerpo (frente y espalda) y sutil en mangas si aplica
  if (product.pattern && product.pattern !== 'solid') {
    const pCol = product.patternColor || '#132448';
    const pAlpha = product.patternAlpha ?? 0.85;
    drawPattern(ctx, UV_ZONES.front, product.pattern, pCol, pAlpha);
    drawPattern(ctx, UV_ZONES.back, product.pattern, pCol, pAlpha);
    if (['hex', 'camo', 'gradient-v', 'stripes-h'].includes(product.pattern)) {
      drawPattern(ctx, UV_ZONES.sleeveR, product.pattern, pCol, pAlpha * 0.7);
      drawPattern(ctx, UV_ZONES.sleeveL, product.pattern, pCol, pAlpha * 0.7);
    }
  }

  // Estampados en frente y espalda (recortados a su zona UV para no invadir la otra cara)
  for (const side of ['front', 'back']) {
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

    for (const el of elements[side]) {
      drawElement(ctx, el, PPU, cx, cy);
    }
    if (guides) {
      drawPrintArea(ctx, side);
      const sel = elements[side].find((e) => e.id === selectedId);
      if (sel) drawGuides(ctx, sel, cx, cy);
    }
    ctx.restore();
  }
}

/** Exporta sólo el arte de un lado (PNG transparente recortado a las estampas). */
export function exportArt(elements, side, scale = 2.5) {
  const list = elements[side].filter((e) => !e.hidden);
  if (!list.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const el of list) {
    const b = getBounds(el);
    const a = (el.rot * Math.PI) / 180;
    const ex = (Math.abs(b.w * Math.cos(a)) + Math.abs(b.h * Math.sin(a))) / 2;
    const ey = (Math.abs(b.w * Math.sin(a)) + Math.abs(b.h * Math.cos(a))) / 2;
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
  for (const el of list) drawElement(ctx, el, ppu, -x0 * ppu, -y0 * ppu);
  return c;
}
