// Genera los iconos PNG de la PWA (sin dependencias) y el favicon SVG.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('public', { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Silueta de camiseta en un lienzo de 100x100
const neck = [];
for (let i = 0; i <= 16; i++) {
  const a = (i / 16) * Math.PI;
  neck.push([50 + 12 * Math.cos(a), 17 + 11 * Math.sin(a)]);
}
const shirt = [[38, 17], [20, 26], [5, 42], [17, 53], [26, 47], [26, 84], [74, 84], [74, 47], [83, 53], [95, 42], [80, 26], [62, 17], ...neck];
const star = [];
for (let i = 0; i < 10; i++) {
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  const r = i % 2 ? 5 : 12;
  star.push([50 + Math.cos(a) * r, 56 + Math.sin(a) * r]);
}

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function render(size, { maskable = false, rounded = true } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3;
  const scale = maskable ? 0.72 : 0.9;
  const R = size * 0.22;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const X = px + (sx + 0.5) / SS;
          const Y = py + (sy + 0.5) / SS;
          // fondo (esquinas redondeadas salvo maskable)
          let inBg = true;
          if (rounded && !maskable) {
            const cx = Math.min(Math.max(X, R), size - R);
            const cy = Math.min(Math.max(Y, R), size - R);
            inBg = (X - cx) ** 2 + (Y - cy) ** 2 <= R * R;
          }
          if (!inBg) continue;
          const t = (X + Y) / (2 * size);
          let col = [79 + (139 - 79) * t, 70 + (92 - 70) * t, 229 + (246 - 229) * t];
          const u = ((X / size - 0.5) / scale) * 100 + 50;
          const v = ((Y / size - 0.5) / scale) * 100 + 50;
          if (inside(shirt, u, v)) col = inside(star, u, v) ? [251, 191, 36] : [255, 255, 255];
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      if (a === 0) continue;
      const cnt = a / 255;
      buf[i] = r / cnt; buf[i + 1] = g / cnt; buf[i + 2] = b / cnt; buf[i + 3] = a / n;
    }
  }
  return png(size, size, buf);
}

writeFileSync('public/pwa-192x192.png', render(192));
writeFileSync('public/pwa-512x512.png', render(512));
writeFileSync('public/pwa-maskable-512x512.png', render(512, { maskable: true }));
writeFileSync('public/apple-touch-icon.png', render(180, { maskable: true }));

const pts = (p) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(#g)"/><g transform="translate(5 5) scale(.9)"><polygon points="${pts(shirt)}" fill="#fff"/><polygon points="${pts(star)}" fill="#fbbf24"/></g></svg>`,
);
console.log('Iconos generados en /public');
