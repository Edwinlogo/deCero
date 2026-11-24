// Genera 3 modelos GLB reales (mujer, niños con menos pliegues y crop top de mujer)
// a partir de public/models/shirt_baked.glb, usando suavizado proyectado en la normal
// para eliminar pliegues SIN deslizar vértices tangencialmente (cero distorsión de UVs/estampados).
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('public/models/shirt_baked.glb');
const OUT_DIR = path.resolve('public/models');

function readGLB(filePath) {
  const buf = fs.readFileSync(filePath);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHeaderOffset = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binHeaderOffset);
  const bin = buf.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLen);

  function getAccessor(i) {
    const acc = gltf.accessors[i];
    const bv = gltf.bufferViews[acc.bufferView];
    const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const nc = acc.type === 'VEC3' ? 3 : acc.type === 'VEC2' ? 2 : 1;
    const len = acc.count * nc;
    if (acc.componentType === 5126) {
      const out = new Float32Array(len);
      for (let k = 0; k < len; k++) out[k] = bin.readFloatLE(off + k * 4);
      return out;
    }
    if (acc.componentType === 5125) {
      const out = new Uint32Array(len);
      for (let k = 0; k < len; k++) out[k] = bin.readUInt32LE(off + k * 4);
      return out;
    }
    const out = new Uint32Array(len);
    for (let k = 0; k < len; k++) out[k] = bin.readUInt16LE(off + k * 2);
    return out;
  }

  return {
    pos: getAccessor(0),
    uv: getAccessor(2),
    idx: getAccessor(3),
  };
}

function writeGLB(filePath, name, pos, norm, uv, idx) {
  const nVerts = pos.length / 3;
  const nIdx = idx.length;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < nVerts; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const useU32 = nVerts > 65535;
  const idxBuf = useU32 ? Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength) : (() => {
    const u16 = new Uint16Array(nIdx);
    for (let i = 0; i < nIdx; i++) u16[i] = idx[i];
    return Buffer.from(u16.buffer, u16.byteOffset, u16.byteLength);
  })();

  const pad4 = (n) => (n + 3) & ~3;
  const posBuf = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength);
  const normBuf = Buffer.from(norm.buffer, norm.byteOffset, norm.byteLength);
  const uvBuf = Buffer.from(uv.buffer, uv.byteOffset, uv.byteLength);

  const off0 = 0;
  const off1 = pad4(off0 + posBuf.length);
  const off2 = pad4(off1 + normBuf.length);
  const off3 = pad4(off2 + uvBuf.length);
  const binLen = pad4(off3 + idxBuf.length);

  const bin = Buffer.alloc(binLen);
  posBuf.copy(bin, off0);
  normBuf.copy(bin, off1);
  uvBuf.copy(bin, off2);
  idxBuf.copy(bin, off3);

  const gltf = {
    asset: { version: '2.0', generator: 'deCero3D-model-builder' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{
      name,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    materials: [{
      name: 'fabric',
      doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.88 },
    }],
    buffers: [{ byteLength: binLen }],
    bufferViews: [
      { buffer: 0, byteOffset: off0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: off1, byteLength: normBuf.length, target: 34962 },
      { buffer: 0, byteOffset: off2, byteLength: uvBuf.length, target: 34962 },
      { buffer: 0, byteOffset: off3, byteLength: idxBuf.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nVerts, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      { bufferView: 1, componentType: 5126, count: nVerts, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: nVerts, type: 'VEC2' },
      { bufferView: 3, componentType: useU32 ? 5125 : 5123, count: nIdx, type: 'SCALAR' },
    ],
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = pad4(jsonBuf.length) - jsonBuf.length;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const totalLen = 12 + 8 + jsonBuf.length + 8 + bin.length;
  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(out, 20);
  const binChunkOff = 20 + jsonBuf.length;
  out.writeUInt32LE(bin.length, binChunkOff);
  out.writeUInt32LE(0x004e4942, binChunkOff + 4);
  bin.copy(out, binChunkOff + 8);

  fs.writeFileSync(filePath, out);
  console.log(`Generated ${path.basename(filePath)}: ${nVerts} verts, ${nIdx / 3} tris, ${(out.length / 1024).toFixed(1)} KB`);
}

function buildWeld(pos, idx) {
  const nV = pos.length / 3;
  const map = new Map();
  const vToU = new Int32Array(nV);
  const uPos = [];
  const scale = 1e4;
  for (let i = 0; i < nV; i++) {
    const key = `${Math.round(pos[i * 3] * scale)},${Math.round(pos[i * 3 + 1] * scale)},${Math.round(pos[i * 3 + 2] * scale)}`;
    let u = map.get(key);
    if (u === undefined) {
      u = uPos.length / 3;
      map.set(key, u);
      uPos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    }
    vToU[i] = u;
  }
  const nU = uPos.length / 3;
  const adj = Array.from({ length: nU }, () => new Set());
  const edgeCount = new Map();
  const addEdge = (a, b) => {
    if (a === b) return;
    adj[a].add(b);
    adj[b].add(a);
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
  };
  for (let i = 0; i < idx.length; i += 3) {
    const a = vToU[idx[i]], b = vToU[idx[i + 1]], c = vToU[idx[i + 2]];
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  const isBoundary = new Uint8Array(nU);
  for (const [k, count] of edgeCount.entries()) {
    if (count === 1) {
      const [a, b] = k.split('_').map(Number);
      isBoundary[a] = 1;
      isBoundary[b] = 1;
    }
  }
  return { nU, vToU, uPos: new Float32Array(uPos), adj: adj.map((s) => [...s]), isBoundary };
}

function computeUniqueNormals(uPos, vToU, idx, nU) {
  const acc = new Float32Array(nU * 3);
  for (let i = 0; i < idx.length; i += 3) {
    const ua = vToU[idx[i]], ub = vToU[idx[i + 1]], uc = vToU[idx[i + 2]];
    const ax = uPos[ua * 3], ay = uPos[ua * 3 + 1], az = uPos[ua * 3 + 2];
    const bx = uPos[ub * 3], by = uPos[ub * 3 + 1], bz = uPos[ub * 3 + 2];
    const cx = uPos[uc * 3], cy = uPos[uc * 3 + 1], cz = uPos[uc * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    acc[ua * 3] += nx; acc[ua * 3 + 1] += ny; acc[ua * 3 + 2] += nz;
    acc[ub * 3] += nx; acc[ub * 3 + 1] += ny; acc[ub * 3 + 2] += nz;
    acc[uc * 3] += nx; acc[uc * 3 + 1] += ny; acc[uc * 3 + 2] += nz;
  }
  for (let u = 0; u < nU; u++) {
    const nx = acc[u * 3], ny = acc[u * 3 + 1], nz = acc[u * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    acc[u * 3] = nx / l;
    acc[u * 3 + 1] = ny / l;
    acc[u * 3 + 2] = nz / l;
  }
  return acc;
}

// Suavizado SOLO a lo largo de la normal: elimina pliegues/arrugas sin deslizar vértices
// tangencialmente, preservando 100% la nitidez de las letras y estampados UV.
function normalOnlySmooth(pos, idx, iterations = 40, strength = 0.45, antiShrink = -0.32) {
  const { nU, vToU, uPos, adj, isBoundary } = buildWeld(pos, idx);
  const cur = new Float32Array(uPos);
  const next = new Float32Array(uPos.length);

  const step = (factor, normals) => {
    for (let u = 0; u < nU; u++) {
      const nbrs = adj[u];
      if (!nbrs.length || isBoundary[u]) {
        next[u * 3] = cur[u * 3];
        next[u * 3 + 1] = cur[u * 3 + 1];
        next[u * 3 + 2] = cur[u * 3 + 2];
        continue;
      }
      let ax = 0, ay = 0, az = 0;
      for (let j = 0; j < nbrs.length; j++) {
        const nb = nbrs[j];
        ax += cur[nb * 3];
        ay += cur[nb * 3 + 1];
        az += cur[nb * 3 + 2];
      }
      const inv = 1 / nbrs.length;
      const dx = ax * inv - cur[u * 3];
      const dy = ay * inv - cur[u * 3 + 1];
      const dz = az * inv - cur[u * 3 + 2];
      const nx = normals[u * 3], ny = normals[u * 3 + 1], nz = normals[u * 3 + 2];
      const proj = (dx * nx + dy * ny + dz * nz) * factor;
      next[u * 3] = cur[u * 3] + nx * proj;
      next[u * 3 + 1] = cur[u * 3 + 1] + ny * proj;
      next[u * 3 + 2] = cur[u * 3 + 2] + nz * proj;
    }
    cur.set(next);
  };

  for (let it = 0; it < iterations; it++) {
    const normals = computeUniqueNormals(cur, vToU, idx, nU);
    step(strength, normals);
    if (antiShrink) step(antiShrink, normals);
  }

  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i++) {
    const u = vToU[i];
    out[i * 3] = cur[u * 3];
    out[i * 3 + 1] = cur[u * 3 + 1];
    out[i * 3 + 2] = cur[u * 3 + 2];
  }
  return out;
}

function computeWeldedNormals(pos, idx) {
  const { nU, vToU, uPos } = buildWeld(pos, idx);
  const uNorm = computeUniqueNormals(uPos, vToU, idx, nU);
  const norm = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i++) {
    const u = vToU[i];
    norm[i * 3] = uNorm[u * 3];
    norm[i * 3 + 1] = uNorm[u * 3 + 1];
    norm[i * 3 + 2] = uNorm[u * 3 + 2];
  }
  return norm;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const gauss = (x, mu, sig) => Math.exp(-0.5 * ((x - mu) / sig) ** 2);

// ---------- Deformación anatómica de mujer ----------
function sculptWomen(pos) {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i++) {
    let x = pos[i * 3];
    let y = pos[i * 3 + 1];
    let z = pos[i * 3 + 2];

    const ax = Math.abs(x);

    // 1) Hombros y mangas femeninas (suaves, sin pellizco en borde)
    const sleeveT = smoothstep(0.15, 0.25, ax) * smoothstep(-0.04, 0.09, y);
    if (sleeveT > 0) {
      x *= 1 - 0.11 * sleeveT;
      y += 0.018 * sleeveT;
      z *= 1 - 0.07 * sleeveT;
    }

    const shoulderT = smoothstep(0.06, 0.22, y) * (1 - sleeveT * 0.5);
    x *= 1 - 0.07 * shoulderT;

    // 2) Cintura entallada (reloj de arena) + cadera suave
    const waist = gauss(y, -0.12, 0.105);
    const hip = smoothstep(-0.18, -0.34, y);
    const torsoMask = 1 - smoothstep(0.15, 0.21, ax);
    x *= 1 - 0.16 * waist * torsoMask + 0.035 * hip;
    z *= 1 - 0.11 * waist * torsoMask + 0.02 * hip;

    // 3) Busto moldeado suavemente en 3D
    if (z > 0.01) {
      const bustSide = gauss(ax, 0.062, 0.05);
      const bustY = gauss(y, 0.048, 0.06);
      const frontFade = smoothstep(0.01, 0.06, z);
      const bust = bustSide * bustY * frontFade;
      z += 0.032 * bust;
      const underBust = gauss(y, -0.025, 0.035) * gauss(ax, 0.055, 0.07) * frontFade;
      z -= 0.007 * underBust;
    }

    // 4) Curvatura lumbar sutil en espalda
    if (z < -0.01) {
      const backFade = smoothstep(-0.01, -0.05, z);
      const lumbar = gauss(y, -0.12, 0.09) * gauss(ax, 0, 0.12) * backFade;
      z += 0.014 * lumbar;
    }

    // 5) Escote más abierto y femenino en el frente
    const neckFront = smoothstep(0.165, 0.245, y) * gauss(ax, 0, 0.062) * smoothstep(-0.01, 0.05, z);
    y -= 0.026 * neckFront;

    if (y < 0) y *= 0.96;

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

// ---------- Deformación de niños (muy pocos pliegues + proporciones infantiles) ----------
function sculptKids(pos) {
  // Primero aplanamos suavemente los pliegues macro en Z usando un perfil elíptico limpio del torso
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i++) {
    let x = pos[i * 3];
    let y = pos[i * 3 + 1];
    let z = pos[i * 3 + 2];

    const ax = Math.abs(x);
    // En el torso (|x| < 0.175, y < 0.17), mezclar Z hacia una superficie limpia libre de pliegues profundos
    const torsoCore = (1 - smoothstep(0.135, 0.185, ax)) * (1 - smoothstep(0.12, 0.20, y));
    if (torsoCore > 0) {
      const hw = 0.165;
      const u = clamp(ax / hw, 0, 0.99);
      const profile = Math.pow(1 - Math.pow(u, 2.4), 1 / 2.4);
      const targetZ = z >= 0 ? 0.108 * profile : -0.102 * profile;
      const blend = 0.58 * torsoCore * smoothstep(-0.36, -0.24, y);
      z = z * (1 - blend) + targetZ * blend;
    }

    // Proporción infantil más compacta y recta
    const sleeveT = smoothstep(0.15, 0.26, ax) * smoothstep(-0.04, 0.08, y);
    x *= 0.94 - 0.08 * sleeveT;
    y += 0.014 * sleeveT;

    if (y < 0.05) {
      y = 0.05 + (y - 0.05) * 0.84;
    }

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

// ---------- Corte limpio por plano y = yCut + dobladillo 3D para Crop Top ----------
function clipMeshAtY(pos, uv, idx, yCut) {
  const newPos = [];
  const newUv = [];
  const newIdx = [];
  const keptMap = new Map();
  const edgeMidMap = new Map();
  const cutEdges = [];

  const addVert = (x, y, z, u, v) => {
    const id = newPos.length / 3;
    newPos.push(x, y, z);
    newUv.push(u, v);
    return id;
  };

  const getKept = (oldI) => {
    let ni = keptMap.get(oldI);
    if (ni === undefined) {
      ni = addVert(pos[oldI * 3], pos[oldI * 3 + 1], pos[oldI * 3 + 2], uv[oldI * 2], uv[oldI * 2 + 1]);
      keptMap.set(oldI, ni);
    }
    return ni;
  };

  const getIntersect = (iAbove, iBelow) => {
    const key = `${iAbove}_${iBelow}`;
    let ni = edgeMidMap.get(key);
    if (ni !== undefined) return ni;
    const yA = pos[iAbove * 3 + 1];
    const yB = pos[iBelow * 3 + 1];
    const t = clamp((yA - yCut) / ((yA - yB) || 1e-6), 0, 1);
    const x = pos[iAbove * 3] + (pos[iBelow * 3] - pos[iAbove * 3]) * t;
    const z = pos[iAbove * 3 + 2] + (pos[iBelow * 3 + 2] - pos[iAbove * 3 + 2]) * t;
    const u = uv[iAbove * 2] + (uv[iBelow * 2] - uv[iAbove * 2]) * t;
    const v = uv[iAbove * 2 + 1] + (uv[iBelow * 2 + 1] - uv[iAbove * 2 + 1]) * t;
    ni = addVert(x, yCut, z, u, v);
    edgeMidMap.set(key, ni);
    return ni;
  };

  for (let i = 0; i < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    const above = tri.map((v) => pos[v * 3 + 1] >= yCut);
    const count = (above[0] ? 1 : 0) + (above[1] ? 1 : 0) + (above[2] ? 1 : 0);
    if (count === 0) continue;
    if (count === 3) {
      newIdx.push(getKept(tri[0]), getKept(tri[1]), getKept(tri[2]));
      continue;
    }
    if (count === 1) {
      const rot = above[0] ? 0 : above[1] ? 1 : 2;
      const a = tri[rot], b = tri[(rot + 1) % 3], c = tri[(rot + 2) % 3];
      const na = getKept(a);
      const ab = getIntersect(a, b);
      const ac = getIntersect(a, c);
      newIdx.push(na, ab, ac);
      cutEdges.push([ab, ac]);
    } else {
      const rot = !above[2] ? 0 : !above[0] ? 1 : 2;
      const a = tri[rot], b = tri[(rot + 1) % 3], c = tri[(rot + 2) % 3];
      const na = getKept(a);
      const nb = getKept(b);
      const bc = getIntersect(b, c);
      const ac = getIntersect(a, c);
      newIdx.push(na, nb, bc);
      newIdx.push(na, bc, ac);
      cutEdges.push([bc, ac]);
    }
  }

  // Dobladillo interior separado (vértices propios para no distorsionar normales exteriores del borde)
  const outerHemCopy = new Map();
  const innerHemMap = new Map();
  const getOuterCopy = (vi) => {
    let oi = outerHemCopy.get(vi);
    if (oi !== undefined) return oi;
    oi = addVert(newPos[vi * 3], newPos[vi * 3 + 1], newPos[vi * 3 + 2], newUv[vi * 2], newUv[vi * 2 + 1]);
    outerHemCopy.set(vi, oi);
    return oi;
  };
  const getInner = (vi) => {
    let hi = innerHemMap.get(vi);
    if (hi !== undefined) return hi;
    hi = addVert(newPos[vi * 3] * 0.96, newPos[vi * 3 + 1] + 0.008, newPos[vi * 3 + 2] * 0.93, newUv[vi * 2], newUv[vi * 2 + 1]);
    innerHemMap.set(vi, hi);
    return hi;
  };
  for (const [e0, e1] of cutEdges) {
    const o0 = getOuterCopy(e0), o1 = getOuterCopy(e1);
    const i0 = getInner(e0), i1 = getInner(e1);
    newIdx.push(o0, i0, i1);
    newIdx.push(o0, i1, o1);
  }

  return {
    pos: new Float32Array(newPos),
    uv: new Float32Array(newUv),
    idx: new Uint32Array(newIdx),
  };
}

// ---------- Generar las 3 variantes ----------
const base = readGLB(SRC);

// 1) Mujer: suavizado solo-normal (0 distorsión UV) + esculpido femenino
const womenSmooth = normalOnlySmooth(base.pos, base.idx, 18, 0.42, -0.32);
const womenPos = sculptWomen(womenSmooth);
const womenNorm = computeWeldedNormals(womenPos, base.idx);
writeGLB(path.join(OUT_DIR, 'shirt_women.glb'), 'T_Shirt_women', womenPos, womenNorm, base.uv, base.idx);

// 2) Niños: suavizado solo-normal fuerte + aplanado de pliegues macro + proporciones infantiles
const kidsPre = normalOnlySmooth(base.pos, base.idx, 65, 0.48, -0.30);
const kidsSculpted = sculptKids(kidsPre);
const kidsPos = normalOnlySmooth(kidsSculpted, base.idx, 35, 0.45, -0.32);
const kidsNorm = computeWeldedNormals(kidsPos, base.idx);
writeGLB(path.join(OUT_DIR, 'shirt_kids.glb'), 'T_Shirt_kids', kidsPos, kidsNorm, base.uv, base.idx);

// 3) Crop top de mujer: silueta femenina + corte limpio por encima de cintura
const cropBase = new Float32Array(womenPos.length);
for (let i = 0; i < womenPos.length / 3; i++) {
  let x = womenPos[i * 3];
  let y = womenPos[i * 3 + 1];
  let z = womenPos[i * 3 + 2];
  const lowT = smoothstep(0.02, -0.105, y);
  x *= 1 - 0.025 * lowT;
  z *= 1 - 0.025 * lowT;
  cropBase[i * 3] = x;
  cropBase[i * 3 + 1] = y;
  cropBase[i * 3 + 2] = z;
}
const clipped = clipMeshAtY(cropBase, base.uv, base.idx, -0.102);
const cropNorm = computeWeldedNormals(clipped.pos, clipped.idx);
writeGLB(path.join(OUT_DIR, 'shirt_crop.glb'), 'CropTop_women', clipped.pos, cropNorm, clipped.uv, clipped.idx);
