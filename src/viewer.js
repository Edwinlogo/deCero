// Escena 3D fotorrealista: 4 modelos GLB reales (hombre, mujer, niños sin pliegues, crop top),
// PBR textil, iluminación HDR de estudio y edición directa por raycasting UV.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ATLAS_SIZE, paintAtlas, uvToDesign, hitHandle, hitElement } from './render2d.js';
import { state, on, emit, selected, selectElement, removeElement, commit, changed } from './state.js';
import { getReference } from './config.js';

const MODEL_SPECS = {
  male: {
    url: '/models/shirt_baked.glb',
    ao: 0.95,
    normal: 1.15,
    yOffset: 0.04,
    shadowY: -1.44,
    shadowScale: [1, 1],
  },
  women: {
    url: '/models/shirt_women.glb',
    ao: 0.72,
    normal: 0.95,
    yOffset: 0.05,
    shadowY: -1.42,
    shadowScale: [0.92, 0.94],
  },
  kids: {
    url: '/models/shirt_kids.glb',
    ao: 0.22,
    normal: 0.55,
    yOffset: 0.06,
    shadowY: -1.28,
    shadowScale: [0.85, 0.88],
  },
  crop: {
    url: '/models/shirt_crop.glb',
    ao: 0.68,
    normal: 0.95,
    yOffset: 0.12,
    shadowY: -0.96,
    shadowScale: [0.88, 0.88],
  },
};

function resolveModelKey() {
  const ref = getReference(state.product.line, state.product.reference);
  if (ref.fit === 'crop') return 'crop';
  if (state.product.audience === 'Niños') return 'kids';
  if (state.product.audience === 'Mujer') return 'women';
  return 'male';
}

function createSoftShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
  g.addColorStop(0, 'rgba(15, 23, 42, 0.28)');
  g.addColorStop(0.55, 'rgba(15, 23, 42, 0.11)');
  g.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new THREE.Scene();

  // Entorno HDRI de estudio fotográfico
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.48;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  camera.position.set(0, 0.05, 6.2);

  // Iluminación de estudio de 3 puntos (Key + Fill + Rim)
  const key = new THREE.DirectionalLight(0xfffaf2, 1.55);
  key.position.set(1.2, 6.2, 4.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.2;
  key.shadow.camera.right = 2.2;
  key.shadow.camera.top = 2.2;
  key.shadow.camera.bottom = -2.2;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdbeafe, 0.55);
  fill.position.set(-4.2, 2.0, 2.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.85);
  rim.position.set(0.5, 3.2, -5.0);
  scene.add(rim);

  // Sombra de contacto suave + ShadowMaterial en el suelo
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 1.25),
    new THREE.MeshBasicMaterial({ map: createSoftShadowTexture(), transparent: true, depthWrite: false }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = -1.44;
  scene.add(contactShadow);

  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ opacity: 0.055 }),
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = -1.45;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  // ---------- Atlas dinámico 2048x2048 ----------
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const atlasCv = document.createElement('canvas');
  atlasCv.width = atlasCv.height = ATLAS_SIZE;
  const atlasCtx = atlasCv.getContext('2d');

  const atlasTex = new THREE.CanvasTexture(atlasCv);
  atlasTex.flipY = false; // glTF usa v=0 arriba
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = maxAniso;

  // ---------- Gestión multi-modelo GLB ----------
  const shirtGroup = new THREE.Group();
  scene.add(shirtGroup);

  const loader = new GLTFLoader();
  const loadedModels = new Map(); // key -> { root, mesh, material }
  const loadingPromises = new Map();
  let sharedMaps = { normalMap: null, aoMap: null };
  let baseScale = 4.35; // calibrado al cargar el modelo base male
  let activeModelKey = null;
  let activeMesh = null;
  const targetScaleVec = new THREE.Vector3(1, 1, 1);

  function loadGLTF(url) {
    return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  }

  async function ensureModel(modelKey) {
    if (loadedModels.has(modelKey)) return loadedModels.get(modelKey);
    if (loadingPromises.has(modelKey)) return loadingPromises.get(modelKey);

    const spec = MODEL_SPECS[modelKey] || MODEL_SPECS.male;
    const p = (async () => {
      const gltf = await loadGLTF(spec.url);
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      if (modelKey === 'male') {
        baseScale = 2.65 / (size.y || 0.61);
      }

      let mesh = null;
      let material = null;
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        mesh = obj;
        if (obj.geometry.attributes.uv && !obj.geometry.attributes.uv1) {
          obj.geometry.setAttribute('uv1', obj.geometry.attributes.uv);
        }
        const orig = obj.material;
        if (modelKey === 'male') {
          if (orig?.normalMap) {
            orig.normalMap.anisotropy = maxAniso;
            sharedMaps.normalMap = orig.normalMap;
          }
          if (orig?.aoMap) {
            sharedMaps.aoMap = orig.aoMap;
          }
        }
        material = new THREE.MeshPhysicalMaterial({
          map: atlasTex,
          normalMap: sharedMaps.normalMap,
          normalScale: new THREE.Vector2(spec.normal, spec.normal),
          aoMap: sharedMaps.aoMap,
          aoMapIntensity: spec.ao,
          roughness: 0.88,
          metalness: 0.0,
          sheen: 0.16,
          sheenRoughness: 0.82,
          sheenColor: new THREE.Color(0xdbe4f0),
          side: THREE.DoubleSide,
        });
        obj.material = material;
        obj.castShadow = true;
        obj.receiveShadow = true;
      });

      root.position.set(-center.x * baseScale, -center.y * baseScale + spec.yOffset, -center.z * baseScale);
      root.scale.setScalar(baseScale);
      root.visible = false;
      shirtGroup.add(root);

      const entry = { root, mesh, material, spec };
      loadedModels.set(modelKey, entry);
      loadingPromises.delete(modelKey);
      return entry;
    })();

    loadingPromises.set(modelKey, p);
    return p;
  }

  let switchToken = 0;
  async function syncModel() {
    const key = resolveModelKey();
    const ref = getReference(state.product.line, state.product.reference);

    // Ajuste fino de silueta según referencia (oversize, pesada, regular)
    if (key === 'male' || key === 'women') {
      if (ref.fit === 'oversize') targetScaleVec.set(1.08, 1.04, 1.09);
      else if (ref.fit === 'heavy') targetScaleVec.set(1.03, 1.01, 1.04);
      else if (ref.fit === 'fitted') targetScaleVec.set(0.97, 0.99, 0.97);
      else targetScaleVec.set(1, 1, 1);
    } else if (key === 'kids') {
      targetScaleVec.set(0.94, 0.94, 0.94);
    } else {
      // crop top
      targetScaleVec.set(1.02, 1.02, 1.02);
    }

    if (key === activeModelKey && loadedModels.has(key)) return;
    const token = ++switchToken;
    try {
      const entry = await ensureModel(key);
      if (token !== switchToken) return;
      for (const [k, item] of loadedModels.entries()) {
        item.root.visible = k === key;
      }
      activeModelKey = key;
      activeMesh = entry.mesh;
      contactShadow.position.y = entry.spec.shadowY;
      contactShadow.scale.set(entry.spec.shadowScale[0], entry.spec.shadowScale[1], 1);
      shadowFloor.position.y = entry.spec.shadowY - 0.01;
      dirty = true;
    } catch (err) {
      console.error(`Error cargando modelo ${key}:`, err);
    }
  }

  // Cargar modelo base primero (extrae mapas PBR compartidos) y precargar variantes en segundo plano
  const ready = (async () => {
    await ensureModel('male');
    await syncModel();
    dirty = true;
    flush();
    // Precarga silenciosa de las otras 3 variantes para cambio instantáneo
    Promise.all(['women', 'kids', 'crop'].map((k) => ensureModel(k).catch(() => null)));
  })();

  // ---------- Pintado de textura ----------
  let dirty = true;
  let paintGuides = true;

  function paintNow(guides = true) {
    paintAtlas(atlasCtx, {
      elements: state.elements,
      product: state.product,
      guides: guides && state.guides,
      selectedId: state.selectedId,
    });
    atlasTex.needsUpdate = true;
    dirty = false;
  }

  function flush() {
    if (!dirty) return;
    paintNow(paintGuides);
  }

  on('design', () => {
    dirty = true;
  });
  on('product', () => {
    syncModel();
    dirty = true;
  });

  // ---------- Cámara ----------
  const controls = { obj: null };
  let fitDist = 6.2;
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
    fitDist = Math.max(3.35 / t, 3.25 / (t * camera.aspect));
    if (controls.obj) {
      controls.obj.minDistance = fitDist * 0.38;
      controls.obj.maxDistance = fitDist * 1.75;
      const ratio = fitDist / old;
      if (old !== 6.2 && isFinite(ratio)) {
        camera.position.multiplyScalar(ratio);
      }
    }
  }
  new ResizeObserver(resize).observe(container);

  // ---------- Interacción directa 3D (Raycasting UV) ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(e, forceSide = null) {
    if (!activeMesh) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(activeMesh, false)[0];
    if (!hit || !hit.uv) return null;
    return uvToDesign(hit.uv.x, hit.uv.y, forceSide);
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
      if (drag) endDrag();
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
        el.x = Math.max(-1.2, Math.min(1.2, pt.x + drag.off.x));
        el.y = Math.max(-1.35, Math.min(1.35, pt.y + drag.off.y));
      } else if (drag.mode === 'scale') {
        const d = Math.hypot(pt.x - el.x, pt.y - el.y);
        el.s = Math.max(0.08, Math.min(8, drag.s0 * (d / drag.d0)));
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
      endDrag();
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
  orbit.dampingFactor = 0.075;
  orbit.enablePan = false;
  orbit.rotateSpeed = 0.85;
  orbit.autoRotateSpeed = 2.6;
  orbit.minPolarAngle = Math.PI * 0.14;
  orbit.maxPolarAngle = Math.PI * 0.86;
  orbit.target.set(0, 0, 0);

  // ---------- Vistas cinemáticas ----------
  const VIEW_ANGLES = {
    front: { az: 0, polar: Math.PI / 2 - 0.03, rMul: 1 },
    back: { az: Math.PI, polar: Math.PI / 2 - 0.03, rMul: 1 },
    left: { az: Math.PI / 2, polar: Math.PI / 2 - 0.02, rMul: 0.96 },
    right: { az: -Math.PI / 2, polar: Math.PI / 2 - 0.02, rMul: 0.96 },
  };

  let tween = null;
  function setView(viewName, animate = true) {
    const cfg = VIEW_ANGLES[viewName] || VIEW_ANGLES.front;
    const off = camera.position.clone().sub(orbit.target);
    tmpSph.setFromVector3(off);
    const from = { az: tmpSph.theta, polar: tmpSph.phi, r: tmpSph.radius };
    let toAz = cfg.az;
    while (toAz - from.az > Math.PI) toAz -= Math.PI * 2;
    while (toAz - from.az < -Math.PI) toAz += Math.PI * 2;
    const to = { az: toAz, polar: cfg.polar, r: fitDist * cfg.rMul };
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
    tween.t = Math.min(1, tween.t + dt / 0.65);
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

  // ---------- Bucle de animación ----------
  let lastT = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(((now ?? performance.now()) - lastT) / 1000, 0.05);
    lastT = now ?? performance.now();
    stepTween(dt);
    shirtGroup.scale.lerp(targetScaleVec, Math.min(1, dt * 10));
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

  // ---------- Capturas HD ----------
  function capture(side = 'front', size = 1000, transparent = false) {
    paintGuides = false;
    paintNow(false);
    const cam = new THREE.PerspectiveCamera(camera.fov, 1, 0.1, 60);
    cam.position.set(0, 0.06, side === 'front' ? 6.4 : -6.4);
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
    dirty = true;
    resize();
    return out;
  }

  resize();
  setView('front', false);

  return {
    ready,
    capture,
    setView,
    setAutoRotate,
    resize,
    get autoRotate() { return autoRotate; },
    get modelKey() { return activeModelKey; },
  };
}
