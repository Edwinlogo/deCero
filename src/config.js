// Configuración de la tienda y del configurador 3D.
export const CONFIG = {
  storeName: 'deCero 3D',
  currency: 'USD',
  locale: 'es-US',
  // Número de WhatsApp con código de país, sin "+" (ej: '573001234567'). Si está vacío no se muestra el botón.
  whatsapp: '',
  prices: {
    base: 22, // camisa base sublimación / algodón pro
    pattern: 4, // extra por patrón sublimado
    oversize: 3, // extra ajuste oversize
    printSide: 6, // por cada lado estampado (frente / espalda)
    bulkMinQty: 6, // descuento por volumen desde esta cantidad
    bulkDiscount: 0.12,
  },
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  zones: [
    { id: 'all', label: 'Toda' },
    { id: 'front', label: 'Frente' },
    { id: 'back', label: 'Espalda' },
    { id: 'sleeves', label: 'Mangas' },
    { id: 'collar', label: 'Cuello' },
  ],
  patterns: [
    { id: 'solid', label: 'Liso' },
    { id: 'gradient-v', label: 'Degradado' },
    { id: 'gradient-d', label: 'Diagonal' },
    { id: 'stripes-v', label: 'Rayas V' },
    { id: 'stripes-h', label: 'Franjas H' },
    { id: 'band-chest', label: 'Banda Pecho' },
    { id: 'chevron', label: 'Chevron' },
    { id: 'split', label: 'Split Pro' },
    { id: 'hex', label: 'Hex Tech' },
    { id: 'camo', label: 'Geo Camo' },
  ],
  presets: [
    {
      name: 'Studio Blanco',
      bg: '#eceff4',
      product: {
        color: '#f5f5f2',
        zones: { front: '#f5f5f2', back: '#f5f5f2', sleeveL: '#f5f5f2', sleeveR: '#f5f5f2', collar: '#f5f5f2' },
        pattern: 'solid',
        patternColor: '#18191c',
        patternAlpha: 0.85,
      },
    },
    {
      name: 'Pro Sport',
      bg: '#e5ebf5',
      product: {
        color: '#132448',
        zones: { front: '#132448', back: '#132448', sleeveL: '#0d1a36', sleeveR: '#0d1a36', collar: '#06b6d4' },
        pattern: 'chevron',
        patternColor: '#06b6d4',
        patternAlpha: 0.9,
      },
    },
    {
      name: 'Racing Red',
      bg: '#1c1f26',
      product: {
        color: '#18191c',
        zones: { front: '#18191c', back: '#18191c', sleeveL: '#c92432', sleeveR: '#c92432', collar: '#c92432' },
        pattern: 'split',
        patternColor: '#c92432',
        patternAlpha: 0.95,
      },
    },
    {
      name: 'Cyber Hex',
      bg: '#161822',
      product: {
        color: '#1b1630',
        zones: { front: '#1b1630', back: '#1b1630', sleeveL: '#141024', sleeveR: '#141024', collar: '#a855f7' },
        pattern: 'hex',
        patternColor: '#a855f7',
        patternAlpha: 0.65,
      },
    },
    {
      name: 'Club Clásico',
      bg: '#edf0f5',
      product: {
        color: '#f5f5f2',
        zones: { front: '#f5f5f2', back: '#f5f5f2', sleeveL: '#1f2f58', sleeveR: '#1f2f58', collar: '#1f2f58' },
        pattern: 'band-chest',
        patternColor: '#1f2f58',
        patternAlpha: 1,
      },
    },
    {
      name: 'Street Arena',
      bg: '#eceae4',
      product: {
        color: '#d8c6a0',
        zones: { front: '#d8c6a0', back: '#d8c6a0', sleeveL: '#5a3b2b', sleeveR: '#5a3b2b', collar: '#18191c' },
        pattern: 'camo',
        patternColor: '#5a3b2b',
        patternAlpha: 0.4,
      },
    },
  ],
  stageBgs: [
    { name: 'Estudio Claro', hex: '#eceff4' },
    { name: 'Estudio Oscuro', hex: '#181b22' },
    { name: 'Arena Suave', hex: '#eeebe4' },
    { name: 'Azul Hielo', hex: '#e2ebf6' },
  ],
  colors: [
    { name: 'Blanco', hex: '#f5f5f2' },
    { name: 'Negro', hex: '#18191c' },
    { name: 'Gris jaspe', hex: '#a3a8ae' },
    { name: 'Grafito', hex: '#3a3e45' },
    { name: 'Azul marino', hex: '#132448' },
    { name: 'Azul rey', hex: '#2563c9' },
    { name: 'Cyan', hex: '#06b6d4' },
    { name: 'Verde bosque', hex: '#1b5e3f' },
    { name: 'Lima neón', hex: '#84cc16' },
    { name: 'Amarillo', hex: '#f3c53a' },
    { name: 'Naranja', hex: '#ef7d22' },
    { name: 'Rojo', hex: '#c92432' },
    { name: 'Vino', hex: '#6d1d32' },
    { name: 'Rosa', hex: '#f3a9c2' },
    { name: 'Fucsia', hex: '#d3377a' },
    { name: 'Morado', hex: '#6b45a8' },
    { name: 'Arena', hex: '#d8c6a0' },
    { name: 'Café', hex: '#5a3b2b' },
  ],
  fonts: [
    { family: 'Anton', label: 'Anton' },
    { family: 'Bebas Neue', label: 'Bebas Neue' },
    { family: 'Righteous', label: 'Righteous' },
    { family: 'Lobster', label: 'Lobster' },
    { family: 'Pacifico', label: 'Pacifico' },
    { family: 'Permanent Marker', label: 'Marcador' },
    { family: 'Inter', label: 'Inter' },
  ],
  stickers: [
    '⭐', '🔥', '❤️', '⚡', '🌈', '🌙', '☀️', '🌸', '🍀', '🎸', '🎧', '🎮',
    '🚀', '🐱', '🐶', '🦄', '💀', '👑', '😎', '🏆', '⚽', '🏀', '🍕', '🌴',
  ],
  shapes: [
    { type: 'rect', label: 'Rectángulo' },
    { type: 'circle', label: 'Círculo' },
    { type: 'triangle', label: 'Triángulo' },
    { type: 'star', label: 'Estrella' },
    { type: 'heart', label: 'Corazón' },
    { type: 'bolt', label: 'Rayo' },
  ],
};

export function money(v) {
  return new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency }).format(v);
}
