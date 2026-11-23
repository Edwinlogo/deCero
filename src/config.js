// Configuración de la tienda. Edita estos valores para adaptar precios, moneda, etc.
export const CONFIG = {
  storeName: 'Estampa3D',
  currency: 'USD',
  locale: 'es-US',
  // Número de WhatsApp con código de país, sin "+" (ej: '573001234567'). Si está vacío no se muestra el botón.
  whatsapp: '',
  prices: {
    base: 18, // camisa lisa
    longSleeve: 4, // extra manga larga
    oversize: 3, // extra ajuste oversize
    printSide: 6, // por cada lado estampado (frente / espalda)
    bulkMinQty: 6, // descuento por volumen desde esta cantidad
    bulkDiscount: 0.1,
  },
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  colors: [
    { name: 'Blanco', hex: '#f6f6f3' },
    { name: 'Negro', hex: '#18191c' },
    { name: 'Gris jaspe', hex: '#a3a8ae' },
    { name: 'Grafito', hex: '#41454b' },
    { name: 'Azul marino', hex: '#1f2f58' },
    { name: 'Azul rey', hex: '#2563c9' },
    { name: 'Celeste', hex: '#86b9e8' },
    { name: 'Verde bosque', hex: '#1f6b47' },
    { name: 'Menta', hex: '#98d8bc' },
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
