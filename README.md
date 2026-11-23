# Estampa3D · PWA de camisas personalizables

Tienda de camisas con editor 3D en tiempo real (estilo Pacdora): la camiseta se genera de forma procedural con three.js, así que no necesita modelos externos y funciona sin conexión.

## Uso

```bash
npm install
npm run dev        # desarrollo
npm run build      # producción (genera dist/ con service worker)
npm run preview    # sirve dist/ en http://localhost:4173
npm run icons      # regenera los iconos PWA (public/)
```

> El service worker y la instalación como app sólo funcionan en `build` + `preview` (o en HTTPS al desplegar).

## Funciones

- Visor 3D: girar, zoom, vistas Frente/Espalda, rotación automática 360°, color de fondo.
- Producto: 18 colores + color libre, cuello redondo/V, manga corta/larga, ajuste regular/oversize, tallas.
- Editor directo sobre el modelo 3D: subir imagen (también arrastrar/pegar), texto (fuente, color, contorno, curvatura, espaciado), formas y stickers. Arrastra, escala y rota con los controles del propio elemento.
- Frente y espalda independientes, capas (orden, ocultar, duplicar), deshacer/rehacer (Ctrl+Z / Ctrl+Y), atajos de teclado.
- Precio dinámico, carrito, pedido (guardado local; opcional WhatsApp), diseños guardados, borrador automático.
- Exportar mockup PNG y arte transparente para impresión.
- PWA: instalable, offline, fuentes empaquetadas.

## Personalización

Edita [`src/config.js`](src/config.js): nombre de la tienda, moneda, precios, colores, tallas, fuentes, stickers y número de WhatsApp (`whatsapp: '573001234567'`).

Los pedidos se guardan en IndexedDB del navegador (`orders`). Para recibirlos realmente en un servidor, sustituye el bloque de envío en `src/ui.js` (`checkout-form` submit) por una llamada a tu API.
