// Dibujo 2D de las estampas sobre el lienzo (textura) de cada lado de la camiseta.
// Espacio de diseño: unidades de la camiseta, origen en el centro del lienzo, x -> derecha, y -> ABAJO.
// El lienzo cubre [-1.5, 1.5] en ambos ejes. 1 unidad = PPU píxeles.
import { images } from './state.js';
import { bodyHalfWidth, neckDepth, NECK_W, TOP_Y } from './shirt3d.js';

export const SIZE = 1536;
export const PPU = SIZE / 3;
// Tamaño base (en centésimas de unidad) de cada tipo de elemento con s = 1.
export const BASE = { image: 60, shape: 50, emoji: 40, text: 20 };
const TEXT_PX = 100; // los textos se dibujan a 100px y se escalan
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
  const lineH = TEXT_PX * 1.1;
  return { lines, widths, maxW, lineH, h: lines.length * lineH };
}

/** Caja local (antes de escalar por s) en centésimas de unidad. */
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

/** Caja en unidades de la camiseta (ya escalada). */
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

export function drawElement(ctx, el, ppu = PPU, ox = 0, oy = 0) {
  if (el.hidden) return;
  ctx.save();
  ctx.translate((el.x + 1.5) * ppu - ox, (el.y + 1.5) * ppu - oy);
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

// ---------- Guías de edición ----------
const PAD = 0.03;
const HANDLE_R = 0.055;

function handlePositions(el) {
  const b = getBounds(el);
  const hw = b.w / 2 + PAD;
  const hh = b.h / 2 + PAD;
  return {
    scale: [hw, hh],
    rotate: [0, -hh - 0.14],
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
    if (Math.hypot(pt.x - w.x, pt.y - w.y) <= HANDLE_R * 1.5) return name;
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
  return Math.abs(lx) <= b.w / 2 + 0.01 && Math.abs(ly) <= b.h / 2 + 0.01;
}

function drawGuides(ctx, el) {
  const b = getBounds(el);
  const hw = b.w / 2 + PAD;
  const hh = b.h / 2 + PAD;
  ctx.save();
  ctx.translate((el.x + 1.5) * PPU, (el.y + 1.5) * PPU);
  ctx.rotate((el.rot * Math.PI) / 180);
  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 9]);
  ctx.strokeRect(-hw * PPU, -hh * PPU, hw * 2 * PPU, hh * 2 * PPU);
  ctx.setLineDash([]);
  const hp = handlePositions(el);
  // línea hacia el control de rotación
  ctx.beginPath();
  ctx.moveTo(0, -hh * PPU);
  ctx.lineTo(hp.rotate[0] * PPU, hp.rotate[1] * PPU);
  ctx.stroke();
  const dot = (name, bg, glyph) => {
    const [x, y] = hp[name];
    ctx.beginPath();
    ctx.arc(x * PPU, y * PPU, HANDLE_R * PPU, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#4f46e5';
    ctx.stroke();
    ctx.fillStyle = '#4f46e5';
    ctx.font = `bold ${HANDLE_R * PPU * 1.3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x * PPU, y * PPU + 1);
  };
  dot('scale', '#fff', '⤡');
  dot('rotate', '#fff', '↻');
  dot('delete', '#fff', '×');
  ctx.restore();
}

function drawPrintArea(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(79,70,229,.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 16]);
  const x = -0.62;
  const y = -0.95;
  const w = 1.24;
  const h = 1.75;
  ctx.strokeRect((x + 1.5) * PPU, (y + 1.5) * PPU, w * PPU, h * PPU);
  ctx.restore();
}

function drawStitches(ctx, color, fit) {
  const hw = bodyHalfWidth(-1.33, fit);
  const yA = (1.5 + 1.33) * PPU;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,.16)';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 7]);
  for (const dy of [0, 10]) {
    ctx.beginPath();
    ctx.moveTo((1.5 - hw + 0.02) * PPU, yA + dy);
    ctx.lineTo((1.5 + hw - 0.02) * PPU, yA + dy);
    ctx.stroke();
  }
  ctx.restore();
}

/** Pinta el lado completo de la camiseta en ctx (lienzo SIZE x SIZE). */
export function paintSide(ctx, side, { elements, product, guides = true, selectedId = null }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = product.color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  drawStitches(ctx, product.color, product.fit);
  for (const el of elements[side]) drawElement(ctx, el);

  // recorte del escote (alfa 0, la geometría usa alphaTest)
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  ctx.beginPath();
  const n = 60;
  const yTop = 1.5 - TOP_Y; // (y_diseño + 1.5) del borde superior del escote
  for (let i = 0; i <= n; i++) {
    const x = -NECK_W + (2 * NECK_W * i) / n;
    const y = yTop + neckDepth(x, product.neck, side);
    const px = (x + 1.5) * PPU;
    i ? ctx.lineTo(px, y * PPU) : ctx.moveTo(px, y * PPU);
  }
  ctx.lineTo((NECK_W + 1.5) * PPU, -10);
  ctx.lineTo((-NECK_W + 1.5) * PPU, -10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (guides) {
    drawPrintArea(ctx);
    const sel = elements[side].find((e) => e.id === selectedId);
    if (sel) drawGuides(ctx, sel);
  }
}

/** Exporta sólo el arte de un lado (PNG transparente recortado a las estampas). */
export function exportArt(elements, side, scale = 2) {
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
  for (const el of list) drawElement(ctx, el, ppu, (x0 + 1.5) * ppu, (y0 + 1.5) * ppu);
  return c;
}
