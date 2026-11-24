import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/righteous/latin-400.css';
import '@fontsource/lobster/latin-400.css';
import '@fontsource/pacifico/latin-400.css';
import '@fontsource/permanent-marker/latin-400.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';

import { CONFIG } from './config.js';
import { state, on, emit, changed, serializeDesign, loadDesign, addElement, resetHistory } from './state.js';
import { createViewer } from './viewer.js';
import { initUI } from './ui.js';
import { kvGet, kvSet } from './storage.js';

registerSW({ immediate: true });

async function boot() {
  const viewer = createViewer(document.getElementById('viewport'));
  const ui = initUI(viewer);
  window.__estampa = { state, viewer };

  // Esperar modelo 3D y fuentes empaquetadas
  await Promise.all([
    viewer.ready,
    ...CONFIG.fonts.map((f) => document.fonts.load(`100px "${f.family}"`).catch(() => null)),
  ]);

  // Recupera el borrador anterior (v3) o carga el diseño inicial
  const draft = await kvGet('draft', null);
  if (draft && draft.v >= 3 && (draft.elements?.front?.length || draft.elements?.back?.length || draft.product)) {
    await loadDesign(draft);
  } else {
    // Diseño inicial limpio estilo estudio
    emit('product');
    addElement({
      type: 'text', text: 'DECERO\nSTUDIO', font: 'Anton', color: '#111827', strokeColor: '#000000', strokeW: 0,
      curve: 0, spacing: 4, align: 'center', x: 0, y: -0.32, s: 1.3,
    }, 'front');
    state.selectedId = null;
    resetHistory();
    changed(true);
  }
  changed(true);
  ui.showTab('product');

  // Autoguardado
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => kvSet('draft', serializeDesign()), 700);
  };
  on('design', save);
  on('product', save);
  on('layers', save);

  document.getElementById('loading').classList.add('done');
  window.addEventListener('resize', () => viewer.resize());
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = 'No se pudo iniciar el visor 3D: ' + err.message;
});
