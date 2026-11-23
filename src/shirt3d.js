// Geometría procedural de la camiseta (sin modelos externos).
// Sistema de coordenadas: x hacia la derecha, y hacia arriba, z hacia el frente (unidades arbitrarias).
import * as THREE from 'three';

export const TOP_Y = 1.42;
export const HEM_Y = -1.4;
export const NECK_W = 0.36;

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

export const fitK = (fit) => (fit === 'oversize' ? 1.1 : 1);

/** Semi-ancho del cuerpo en la altura y (el cuerpo incluye la línea de hombros y sisa). */
export function bodyHalfWidth(y, fit = 'regular') {
  const k = fitK(fit);
  const pts = [
    [HEM_Y, 0.9 * k],
    [-0.4, 0.855 * k],
    [0.6, 0.85 * k],
    [1.2, 1.15 * k],
    [TOP_Y, NECK_W],
  ];
  if (y <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (y <= pts[i + 1][0]) {
      const t = (y - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return lerp(pts[i][1], pts[i + 1][1], t);
    }
  }
  return NECK_W;
}

/** Profundidad del escote bajo TOP_Y en la posición x. side: 'front' | 'back'. */
export function neckDepth(x, neck, side) {
  const a = Math.abs(x) / NECK_W;
  if (a >= 1) return 0;
  if (side === 'back') return 0.09 * Math.sqrt(1 - a * a);
  if (neck === 'v') return 0.64 * (1 - a);
  return 0.4 * Math.pow(1 - Math.pow(a, 2.2), 1 / 2.2);
}

function bodyDepth(y, fit) {
  const d0 = 0.3 * (fit === 'oversize' ? 1.1 : 1);
  return d0 * (1 - 0.42 * smooth((y - 0.95) / 0.47));
}

/** Altura (z) de la superficie del cuerpo en (x, y), siempre >= 0. */
export function surfaceZ(x, y, fit) {
  const hw = bodyHalfWidth(y, fit);
  const u = Math.abs(x / hw);
  if (u >= 1) return 0;
  const n = 2.6;
  const f = Math.pow(1 - Math.pow(u, n), 1 / n);
  const wrinkle =
    0.007 * (Math.sin(x * 7 + y * 4 + 0.5) + 0.6 * Math.sin(x * 13 - y * 9 + 2) + 0.4 * Math.sin(y * 17 + x * 3)) +
    0.012 * Math.sin(x * 5 + 1) * smooth((-0.2 - y) / 1.0);
  return bodyDepth(y, fit) * f + wrinkle * f;
}

function panelGeometry(sign, fit) {
  const R = 170;
  const C = 100;
  const pos = new Float32Array((R + 1) * (C + 1) * 3);
  const uv = new Float32Array((R + 1) * (C + 1) * 2);
  let p = 0;
  let q = 0;
  for (let j = 0; j <= R; j++) {
    const y = lerp(HEM_Y, TOP_Y, j / R);
    const hw = bodyHalfWidth(y, fit);
    for (let i = 0; i <= C; i++) {
      const x = (-1 + (2 * i) / C) * hw;
      pos[p++] = x;
      pos[p++] = y;
      pos[p++] = sign * surfaceZ(x, y, fit);
      let u = (x + 1.5) / 3;
      if (sign < 0) u = 1 - u;
      uv[q++] = u;
      uv[q++] = (y + 1.5) / 3;
    }
  }
  const idx = [];
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < C; i++) {
      const a = j * (C + 1) + i;
      const b = a + 1;
      const c = a + C + 1;
      const d = c + 1;
      if (sign > 0) idx.push(a, b, d, a, d, c);
      else idx.push(a, d, b, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function sleeveGeometries(sleeve, fit) {
  const k = fitK(fit);
  const S = new THREE.Vector2(1.15 * k, 1.2);
  const A = new THREE.Vector2(0.85 * k, 0.6);
  const center = S.clone().add(A).multiplyScalar(0.5);
  const L = S.distanceTo(A);
  const p = S.clone().sub(A).divideScalar(L);
  const axis = new THREE.Vector2(p.y, -p.x);
  const theta0 = Math.atan2(axis.y, axis.x);

  const long = sleeve === 'long';
  const len = long ? 1.45 : 0.5;
  const bend = long ? -0.8 : -0.12;
  const taper = long ? 0.72 : 0.88;
  const a1 = L / 2;
  const a2 = 0.2 * k;
  const inset = 0.06;
  const rings = 28;
  const segs = 40;

  const pos = [];
  const uv = [];
  const idx = [];
  let cx = center.x - axis.x * inset;
  let cy = center.y - axis.y * inset;
  const total = len + inset;
  const ds = total / rings;
  let last;
  for (let r = 0; r <= rings; r++) {
    const s = Math.max(0, r * ds - inset);
    const th = theta0 + bend * (s / len);
    const tx = Math.cos(th);
    const ty = Math.sin(th);
    const nx = -ty;
    const ny = tx;
    const sc = lerp(1, taper, s / len);
    const A1 = a1 * sc;
    const A2 = a2 * lerp(1, 0.9, s / len);
    last = { cx, cy, tx, ty, nx, ny, A1, A2 };
    for (let i = 0; i <= segs; i++) {
      const ph = (i / segs) * Math.PI * 2;
      const c = Math.cos(ph) * A1;
      const sn = Math.sin(ph) * A2;
      pos.push(cx + nx * c, cy + ny * c, sn);
      uv.push((r * ds) / 3, (i / segs) * 0.7);
    }
    cx += tx * ds;
    cy += ty * ds;
  }
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < segs; i++) {
      const a = r * (segs + 1) + i;
      const b = a + 1;
      const c = a + segs + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  sg.setIndex(idx);
  sg.computeVertexNormals();

  // Tapa oscura (interior de la manga) para dar profundidad al puño.
  const cpos = [last.cx - last.tx * 0.07, last.cy - last.ty * 0.07, 0];
  const cidx = [];
  for (let i = 0; i <= segs; i++) {
    const ph = (i / segs) * Math.PI * 2;
    const c = Math.cos(ph) * last.A1 * 0.97;
    const sn = Math.sin(ph) * last.A2 * 0.97;
    cpos.push(last.cx - last.tx * 0.03 + last.nx * c, last.cy - last.ty * 0.03 + last.ny * c, sn);
    if (i > 0) cidx.push(0, i, i + 1);
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  cap.setIndex(cidx);
  cap.computeVertexNormals();
  return { sleeve: sg, cap };
}

function collarGeometry(neck, fit) {
  const pts = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const x = -NECK_W + (2 * NECK_W * i) / n;
    const y = TOP_Y - neckDepth(x, neck, 'front');
    pts.push(new THREE.Vector3(x, y, surfaceZ(x, y, fit) + 0.004));
  }
  for (let i = n - 1; i >= 1; i--) {
    const x = -NECK_W + (2 * NECK_W * i) / n;
    const y = TOP_Y - neckDepth(x, neck, 'back');
    pts.push(new THREE.Vector3(x, y, -surfaceZ(x, y, fit) - 0.004));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return new THREE.TubeGeometry(curve, 220, 0.026, 10, true);
}

export function buildShirtGeometries({ neck = 'round', sleeve = 'short', fit = 'regular' } = {}) {
  const sl = sleeveGeometries(sleeve, fit);
  return {
    front: panelGeometry(1, fit),
    back: panelGeometry(-1, fit),
    sleeve: sl.sleeve,
    cap: sl.cap,
    collar: collarGeometry(neck, fit),
  };
}
