// Configuración de la tienda, líneas de producto, referencias, tallas y colores.
export const CONFIG = {
  storeName: 'deCero 3D',
  currency: 'USD',
  locale: 'es-US',
  // Número de WhatsApp con código de país, sin "+" (ej: '573001234567'). Si está vacío no se muestra el botón.
  whatsapp: '',
  prices: {
    printSide: 6, // por cada lado estampado (frente / espalda)
    bulkMinQty: 6, // descuento por volumen desde esta cantidad
    bulkDiscount: 0.12,
  },
  adultSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  kidsSizes: ['2 - 4', '6 - 8', '10 - 12', '14 - 16'],
  productLines: [
    {
      id: 'basica',
      label: 'Línea Básica',
      shortLabel: 'Básica',
      audiences: ['Hombre', 'Mujer', 'Niños'],
      references: [
        { id: 'piel-durazno', label: 'Piel de durazno', price: 14, audiences: ['Hombre', 'Mujer'], fit: 'regular' },
        { id: 'algodon-175', label: 'Algodón 175 gr', price: 16, audiences: ['Hombre', 'Mujer'], fit: 'regular' },
        { id: 'algodon-ninos', label: 'Algodón niños', price: 13, audiences: ['Niños'], fit: 'kids' },
      ],
    },
    {
      id: 'media',
      label: 'Línea Media',
      shortLabel: 'Media',
      audiences: ['Hombre', 'Mujer'],
      references: [
        { id: 'tela-fria', label: 'Tela fría', price: 19, audiences: ['Hombre', 'Mujer'], fit: 'regular' },
        { id: 'pesada-220', label: 'Tipo pesada 220 gr', price: 21, audiences: ['Hombre', 'Mujer'], fit: 'heavy' },
        { id: 'blusa-dama', label: 'Blusa para dama', price: 19, audiences: ['Mujer'], fit: 'fitted' },
      ],
    },
    {
      id: 'premium',
      label: 'Línea Premium',
      shortLabel: 'Premium',
      audiences: ['Hombre', 'Mujer'],
      references: [
        { id: 'pesada-265', label: 'Tipo pesada 265 gr', price: 26, audiences: ['Hombre', 'Mujer'], fit: 'heavy' },
        { id: 'qatar-oversize', label: 'Qatar oversize', price: 28, audiences: ['Hombre', 'Mujer'], fit: 'oversize' },
        { id: 'cuello-colores-normal', label: 'Cuello colores normal', price: 27, audiences: ['Hombre', 'Mujer'], fit: 'regular', customCollar: true },
        { id: 'cuello-colores-crop', label: 'Cuello colores crop top', price: 25, audiences: ['Mujer'], fit: 'crop', customCollar: true },
      ],
    },
  ],
  stageBgs: [
    { name: 'Estudio Claro', hex: '#eceff4' },
    { name: 'Estudio Oscuro', hex: '#181b22' },
    { name: 'Arena Suave', hex: '#eeebe4' },
    { name: 'Azul Hielo', hex: '#e2ebf6' },
  ],
  colors: [
    { name: 'Rosado', hex: '#ec6b9e' },
    { name: 'Verde', hex: '#1f7a4c' },
    { name: 'Rojo', hex: '#c81e2b' },
    { name: 'Azul', hex: '#2563c9' },
    { name: 'Blanco', hex: '#f7f7f5' },
    { name: 'Negro', hex: '#17181b' },
    { name: 'Gris', hex: '#8e949c' },
    { name: 'Azul petróleo', hex: '#155e63' },
    { name: 'Azul bebé', hex: '#a6d4f2' },
    { name: 'Vino tinto', hex: '#661a2b' },
    { name: 'Hueso', hex: '#ede8dc' },
    { name: 'Amarillo', hex: '#f2c629' },
    { name: 'Rosado piel', hex: '#eab8a5' },
    { name: 'Azul oscuro', hex: '#162547' },
    { name: 'Rosado bebé', hex: '#f7cad9' },
    { name: 'Beige', hex: '#d6c29f' },
    { name: 'Café', hex: '#5c3b28' },
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

export function getLine(lineId) {
  return CONFIG.productLines.find((l) => l.id === lineId) || CONFIG.productLines[0];
}

export function getReference(lineId, refId) {
  const line = getLine(lineId);
  return line.references.find((r) => r.id === refId) || line.references[0];
}

export function getSizesForAudience(audience) {
  return audience === 'Niños' ? CONFIG.kidsSizes : CONFIG.adultSizes;
}

export function money(v) {
  return new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency }).format(v);
}
