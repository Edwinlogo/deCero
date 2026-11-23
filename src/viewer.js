// Escena 3D: camiseta, iluminación, cámara orbital y edición directa sobre el modelo.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShirtGeometries, HEM_Y } from './shirt3d.js';
import { SIZE, paintSide, hitHandle, hitElement } from './render2d.js';
import { state, on, emit, selected, selectElement, removeElement, commit, changed } from './state.js';

function fabricBumpTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const weave = ((x >> 1) + (y >> 1)) % 2 ? 22 : -22;
      const v = 128 + weave + (Math.random() - 0.5) * 40;
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 12);
  return t;
}

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 0.1, 8);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.2, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  fill.position.set(-4, 2, -5);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = HEM_Y - 0.25;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- Texturas (una por lado) ----------
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const sides = {};
  for (const side of ['front', 'back']) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    sides[side] = { cv, ctx: cv.getContext('2d'), tex };
  }
  const bump = fabricBumpTexture();
  const common = {
    roughness: 0.92,
    metalness: 0,
    sheen: 0.7,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0x6a6a6a),
    bumpMap: bump,
    bumpScale: 1.4,
    side: THREE.DoubleSide,
  };
  const panelMat = {
    front: new THREE.MeshPhysicalMaterial({ ...common, map: sides.front.tex, alphaTest: 0.5 }),
    back: new THREE.MeshPhysicalMaterial({ ...common, map: sides.back.tex, alphaTest: 0.5 }),
  };
  const solidMat = new THREE.MeshPhysicalMaterial({ ...common, color: new THREE.Color(state.product.color) });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1, side: THREE.DoubleSide });

  // ---------- Camiseta ----------
  const shirt = new THREE.Group();
  scene.add(shirt);
  let meshes = {};
  let geoKey = '';

  function rebuild() {
    const { neck, sleeve, fit } = state.product;
    const k = `${neck}|${sleeve}|${fit}`;
    if (k === geoKey) return;
    geoKey = k;
    shirt.children.slice().forEach((m) => {
      shirt.remove(m);
      m.geometry?.dispose();
    });
    const g = buildShirtGeometries({ neck, sleeve, fit });
    const front = new THREE.Mesh(g.front, panelMat.front);
    const back = new THREE.Mesh(g.back, panelMat.back);
    const collar = new THREE.Mesh(g.collar, solidMat);
    const sR = new THREE.Mesh(g.sleeve, solidMat);
    const sL = new THREE.Mesh(g.sleeve.clone(), solidMat);
    sL.scale.x = -1;
    const cR = new THREE.Mesh(g.cap, capMat);
    const cL = new THREE.Mesh(g.cap.clone(), capMat);
    cL.scale.x = -1;
    for (const m of [front, back, collar, sR, sL]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    shirt.add(front, back, collar, sR, sL, cR, cL);
    meshes = { front, back };
  }

  function applyProduct() {
    const c = new THREE.Color(state.product.color);
    solidMat.color.copy(c);
    capMat.color.copy(c).multiplyScalar(0.22);
    rebuild();
  }

  // ---------- Pintado de texturas ----------
  const dirty = { front: true, back: true };
  let paintGuides = true;
  function paintAll(guides = true) {
    for (const side of ['front', 'back']) {
      paintSide(sides[side].ctx, side, {
        elements: state.elements,
        product: state.product,
        guides: guides && state.guides,
        selectedId: state.selectedId,
      });
      sides[side].tex.needsUpdate = true;
      dirty[side] = false;
    }
  }
  function flush() {
    for (const side of ['front', 'back']) {
      if (!dirty[side]) continue;
      paintSide(sides[side].ctx, side, {
        elements: state.elements,
        product: state.product,
        guides: paintGuides && state.guides,
        selectedId: state.selectedId,
      });
      sides[side].tex.needsUpdate = true;
      dirty[side] = false;
    }
  }
  on('design', (side) => {
    if (side) dirty[side] = true;
    else dirty.front = dirty.back = true;
  });
  on('product', () => {
    applyProduct();
    dirty.front = dirty.back = true;
  });

  // ---------- Cámara ----------
  const controls = { obj: null };
  let fitDist = 8;
  const tmpSph = new THREE.Spherical();

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const old = fitDist;
    fitDist = Math.max(3.7 / t, 4.1 / (t * camera.aspect));
    if (controls.obj) {
      controls.obj.minDistance = fitDist * 0.3;
      controls.obj.maxDistance = fitDist * 1.8;
      // mantener el zoom relativo si ya existía
      const ratio = fitDist / old;
      if (old !== 8 && isFinite(ratio)) {
        camera.position.multiplyScalar(ratio);
      }
    }
  }
  new ResizeObserver(resize).observe(container);

  // ---------- Interacción ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(e, only) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = only ? [meshes[only]] : [meshes.front, meshes.back];
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit || !hit.uv) return null;
    return {
      side: hit.object === meshes.front ? 'front' : 'back',
      pt: { x: hit.uv.x * 3 - 1.5, y: 1.5 - hit.uv.y * 3 },
    };
  }

  let drag = null;
  let tap = null;
  let pointers = 0;
  const snapAngle = (deg) => {
    const m = Math.round(deg / 15) * 15;
    return Math.abs(deg - m) < 3 ? m : deg;
  };

  canvas.addEventListener('pointerdown', (e) => {
    pointers++;
    if (pointers > 1) {
      if (drag) endDrag(e);
      return;
    }
    if (!state.guides || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const hit = pick(e);
    tap = { x: e.clientX, y: e.clientY, onShirt: !!hit };
    if (!hit) return;
    const { side, pt } = hit;
    const sel = selected();
    if (sel && sel.side === side) {
      const h = hitHandle(sel, pt);
      if (h === 'delete') {
        e.stopImmediatePropagation();
        removeElement(sel.id);
        tap = null;
        return;
      }
      if (h) {
        e.stopImmediatePropagation();
        commit();
        drag = {
          mode: h,
          id: sel.id,
          side,
          s0: sel.s,
          rot0: sel.rot,
          d0: Math.max(0.05, Math.hypot(pt.x - sel.x, pt.y - sel.y)),
          a0: Math.atan2(pt.y - sel.y, pt.x - sel.x),
        };
        startDrag(e);
        return;
      }
    }
    const list = state.elements[side];
    for (let i = list.length - 1; i >= 0; i--) {
      if (hitElement(list[i], pt)) {
        e.stopImmediatePropagation();
        selectElement(list[i].id);
        commit();
        drag = { mode: 'move', id: list[i].id, side, off: { x: list[i].x - pt.x, y: list[i].y - pt.y } };
        startDrag(e);
        return;
      }
    }
  });

  function startDrag(e) {
    controls.obj.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    tap = null;
  }
  function endDrag() {
    drag = null;
    controls.obj.enabled = true;
    canvas.style.cursor = '';
  }

  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const el = selected();
      if (!el || el.id !== drag.id) return;
      const hit = pick(e, drag.side);
      if (!hit) return;
      const { pt } = hit;
      if (drag.mode === 'move') {
        el.x = Math.max(-1.4, Math.min(1.4, pt.x + drag.off.x));
        el.y = Math.max(-1.4, Math.min(1.4, pt.y + drag.off.y));
      } else if (drag.mode === 'scale') {
        const d = Math.hypot(pt.x - el.x, pt.y - el.y);
        el.s = Math.max(0.05, Math.min(10, drag.s0 * (d / drag.d0)));
      } else if (drag.mode === 'rotate') {
        const a = Math.atan2(pt.y - el.y, pt.x - el.x);
        let r = drag.rot0 + ((a - drag.a0) * 180) / Math.PI;
        r = ((((r + 180) % 360) + 360) % 360) - 180;
        el.rot = snapAngle(r);
      }
      changed(false, el.side);
      return;
    }
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 5) tap.moved = true;
    if (pointers === 0 && e.pointerType === 'mouse' && state.guides) hover(e);
  });

  let hoverQueued = false;
  function hover(e) {
    if (hoverQueued) return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      const hit = pick(e);
      let cur = '';
      if (hit) {
        const sel = selected();
        const h = sel && sel.side === hit.side ? hitHandle(sel, hit.pt) : null;
        if (h === 'scale') cur = 'nwse-resize';
        else if (h) cur = 'pointer';
        else if (state.elements[hit.side].some((el) => hitElement(el, hit.pt))) cur = 'grab';
      }
      canvas.style.cursor = cur;
    });
  }

  const release = (e) => {
    pointers = Math.max(0, pointers - 1);
    if (drag) {
      endDrag(e);
      emit('layers');
    } else if (tap && !tap.moved && e.type === 'pointerup' && pointers === 0 && state.guides) {
      if (state.selectedId) selectElement(null);
    }
    tap = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const orbit = new OrbitControls(camera, canvas);
  controls.obj = orbit;
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.enablePan = false;
  orbit.rotateSpeed = 0.9;
  orbit.autoRotateSpeed = 3;
  orbit.minPolarAngle = Math.PI * 0.12;
  orbit.maxPolarAngle = Math.PI * 0.88;
  orbit.target.set(0, 0, 0);

  // ---------- Vistas ----------
  let tween = null;
  function setView(side, animate = true) {
    const az = side === 'back' ? Math.PI : 0;
    const off = camera.position.clone().sub(orbit.target);
    tmpSph.setFromVector3(off);
    const from = { az: tmpSph.theta, polar: tmpSph.phi, r: tmpSph.radius };
    let toAz = az;
    while (toAz - from.az > Math.PI) toAz -= Math.PI * 2;
    while (toAz - from.az < -Math.PI) toAz += Math.PI * 2;
    const to = { az: toAz, polar: Math.PI / 2 - 0.04, r: fitDist };
    if (!animate) {
      tween = null;
      tmpSph.set(to.r, to.polar, to.az);
      camera.position.setFromSpherical(tmpSph).add(orbit.target);
      orbit.update();
      return;
    }
    tween = { from, to, t: 0 };
  }
  function stepTween(dt) {
    if (!tween) return;
    tween.t = Math.min(1, tween.t + dt / 0.7);
    const k = 1 - Math.pow(1 - tween.t, 3);
    const { from, to } = tween;
    tmpSph.set(
      from.r + (to.r - from.r) * k,
      from.polar + (to.polar - from.polar) * k,
      from.az + (to.az - from.az) * k,
    );
    camera.position.setFromSpherical(tmpSph).add(orbit.target);
    if (tween.t >= 1) tween = null;
  }
  orbit.addEventListener('start', () => (tween = null));

  let autoRotate = false;
  function setAutoRotate(v) {
    autoRotate = v;
    orbit.autoRotate = v;
  }

  // ---------- Bucle ----------
  let lastT = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(((now ?? performance.now()) - lastT) / 1000, 0.05);
    lastT = now ?? performance.now();
    stepTween(dt);
    orbit.update();
    const az = orbit.getAzimuthalAngle();
    const side = Math.abs(az) < Math.PI / 2 ? 'front' : 'back';
    if (side !== state.side) {
      state.side = side;
      emit('side', side);
    }
    flush();
    renderer.render(scene, camera);
  });

  // ---------- Capturas ----------
  function capture(side = 'front', size = 900, transparent = false) {
    paintGuides = false;
    paintAll(false);
    const cam = new THREE.PerspectiveCamera(camera.fov, 1, 0.1, 60);
    cam.position.set(0, 0.05, side === 'front' ? 8.2 : -8.2);
    cam.lookAt(0, 0, 0);
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.render(scene, cam);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const ctx = out.getContext('2d');
    if (!transparent) {
      ctx.fillStyle = state.bg;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.drawImage(canvas, 0, 0, size, size);
    paintGuides = true;
    dirty.front = dirty.back = true;
    resize();
    return out;
  }

  applyProduct();
  resize();
  setView('front', false);

  return { capture, setView, setAutoRotate, resize, get autoRotate() { return autoRotate; } };
}
