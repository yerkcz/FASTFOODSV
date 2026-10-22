#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Menú SANVÍ — fuente única de datos.
 *
 * Este archivo es la ÚNICA fuente de verdad del menú nuevo:
 *   node scripts/menu-sanvi.mjs --sql    -> escribe ../supabase/migrations/0003_menu_sanvi.sql
 *   node scripts/menu-sanvi.mjs --apply   -> borra el menú actual y carga este en la base
 *
 * Reglas del proyecto que este script respeta:
 *   - Los precios se cargan LITERALES (ya incluyen IVA). Nunca se suma 10% de servicio.
 *   - `menu_origen = 'menu3'` identifica el menú SANVÍ.
 *   - `orden` conserva el orden del menú físico del cliente.
 *
 * KDS: `kds` marca a qué pantalla va cada categoría (hot = bebidas calientes,
 * cold = bebidas frías, kitchen = cocina general). Esa información se replica
 * en `src/lib/kdsFilters.ts` (whitelist por nombre exacto).
 */

export const CATEGORIAS = [
  { nombre: 'Bebidas de Café', orden: 10, icono: '☕', kds: 'hot' },
  { nombre: 'Frappés y Café Frío', orden: 20, icono: '🧊', kds: 'cold' },
  { nombre: 'Tés e Infusiones', orden: 30, icono: '🍵', kds: 'hot' },
  { nombre: 'Batidos Naturales', orden: 40, icono: '🥤', kds: 'cold' },
  { nombre: 'Bebidas de la Casa', orden: 50, icono: '🌿', kds: 'cold' },
  { nombre: 'Vinos y Sangría', orden: 60, icono: '🍷', kds: 'cold' },
  { nombre: 'Cócteles y Tragos — Tequila', orden: 70, icono: '🥃', kds: 'cold' },
  { nombre: 'Cócteles y Tragos — Whisky', orden: 80, icono: '🥃', kds: 'cold' },
  { nombre: 'Cócteles y Tragos — Ron', orden: 90, icono: '🥃', kds: 'cold' },
  { nombre: 'Gin Tonic', orden: 100, icono: '🍸', kds: 'cold' },
  { nombre: 'Cervezas', orden: 110, icono: '🍺', kds: 'cold' },
  { nombre: 'Comidas', orden: 120, icono: '🍽️', kds: 'kitchen' },
];

/** `peso` = popularity relativa (solo la usa el generador de datos de prueba). */
export const PRODUCTOS = [
  // ── Bebidas de Café (calientes) ───────────────────────────────
  { cat: 'Bebidas de Café', nombre: 'Café negro Americano', precio: 1000, peso: 9 },
  { cat: 'Bebidas de Café', nombre: 'Café con Leche', precio: 1200, peso: 10 },
  { cat: 'Bebidas de Café', nombre: 'Capuccino', precio: 1650, peso: 8 },
  { cat: 'Bebidas de Café', nombre: 'Latte', precio: 2200, peso: 6 },
  { cat: 'Bebidas de Café', nombre: 'Moka', precio: 2500, peso: 4 },
  { cat: 'Bebidas de Café', nombre: 'Chocolate Caliente', precio: 1700, peso: 5 },
  { cat: 'Bebidas de Café', nombre: 'Agua Dulce (con agua)', precio: 1000, peso: 3 },
  { cat: 'Bebidas de Café', nombre: 'Agua Dulce (con leche)', precio: 1200, peso: 2 },

  // ── Frappés y Café Frío (fríos) ───────────────────────────────
  { cat: 'Frappés y Café Frío', nombre: 'Moka Iced Coffee (Café Frío con Chocolate)', precio: 2300, peso: 5 },
  { cat: 'Frappés y Café Frío', nombre: 'Moka Frappé', precio: 2500, peso: 4 },
  { cat: 'Frappés y Café Frío', nombre: 'Caramel Frappé', precio: 2500, peso: 4 },

  // ── Tés e Infusiones (calientes) ──────────────────────────────
  { cat: 'Tés e Infusiones', nombre: 'Té a escoger (con agua)', precio: 1000, peso: 3 },
  { cat: 'Tés e Infusiones', nombre: 'Té a escoger (con leche)', precio: 1200, peso: 2 },

  // ── Batidos Naturales (fríos) ─────────────────────────────────
  { cat: 'Batidos Naturales', nombre: 'Frutas de temporada en agua', precio: 1650, peso: 7 },
  { cat: 'Batidos Naturales', nombre: 'Frutas de temporada en leche', precio: 1850, peso: 6 },

  // ── Bebidas de la Casa (frías) ────────────────────────────────
  { cat: 'Bebidas de la Casa', nombre: 'Pitahaya & Jugo de Naranja', precio: 2000, peso: 4 },
  { cat: 'Bebidas de la Casa', nombre: 'Piña & Albahaca', precio: 2000, peso: 3 },
  { cat: 'Bebidas de la Casa', nombre: 'Fresa & Hierbabuena', precio: 2000, peso: 3 },

  // ── Vinos y Sangría (fríos) ───────────────────────────────────
  { cat: 'Vinos y Sangría', nombre: 'Copa de Vino', precio: 2800, peso: 2 },
  { cat: 'Vinos y Sangría', nombre: 'Sangría Artesanal', precio: 3500, peso: 3 },

  // ── Cócteles y Tragos — Tequila ────────────────────────────────
  { cat: 'Cócteles y Tragos — Tequila', nombre: 'Tequila Sunrise', precio: 3500, peso: 3 },
  { cat: 'Cócteles y Tragos — Tequila', nombre: 'Margarita', precio: 3500, peso: 3 },

  // ── Cócteles y Tragos — Whisky ─────────────────────────────────
  { cat: 'Cócteles y Tragos — Whisky', nombre: 'Whisky Sour', precio: 2500, peso: 2 },
  { cat: 'Cócteles y Tragos — Whisky', nombre: 'Whisky Old Par / Buchanans las Rocas', precio: 4200, peso: 1 },

  // ── Cócteles y Tragos — Ron ────────────────────────────────────
  { cat: 'Cócteles y Tragos — Ron', nombre: 'Daiquiri', precio: 3500, peso: 3 },
  { cat: 'Cócteles y Tragos — Ron', nombre: 'Ron con Coca-Cola', precio: 2500, peso: 2 },
  { cat: 'Cócteles y Tragos — Ron', nombre: 'Mojito', precio: 3500, peso: 4 },

  // ── Gin Tonic ─────────────────────────────────────────────────
  { cat: 'Gin Tonic', nombre: 'Gin Tonic Albahaca & Fresa', precio: 3500, peso: 3 },
  { cat: 'Gin Tonic', nombre: 'Gin Tonic Frutos Rojos', precio: 3500, peso: 2 },
  { cat: 'Gin Tonic', nombre: 'Gin Tonic Clásico con Limón', precio: 3500, peso: 2 },

  // ── Cervezas ──────────────────────────────────────────────────
  { cat: 'Cervezas', nombre: 'Cerveza nacional', precio: 1400, peso: 7 },
  { cat: 'Cervezas', nombre: 'Cerveza premium', precio: 1800, peso: 4 },

  // ── Comidas (cocina general) ──────────────────────────────────
  {
    cat: 'Comidas', nombre: 'Ensalada Primavera', precio: 4200, peso: 2,
    descripcion: 'Lechugas, tomate cherry, maíz dulce, fresas, mango, cebolla morada, aguacate, queso pastoril y pollo.',
  },
  {
    cat: 'Comidas', nombre: 'Crema de los Huertos', precio: 3800, peso: 2,
    descripcion: 'Crema del día preparada con vegetales frescos de nuestra huerta, servida en un pan artesanal.',
  },
  {
    cat: 'Comidas', nombre: 'Lomito de Res', precio: 6500, peso: 2,
    descripcion: 'Corte de 300 g, servido con pico de gallo, plátano maduro y tortilla palmeada.',
  },
  {
    cat: 'Comidas', nombre: 'Salmón del Chef', precio: 5800, peso: 1,
    descripcion: 'Servido con una salsa especial del chef, acompañado de puré y ensalada verde.',
  },
  {
    cat: 'Comidas', nombre: 'Hamburguesa', precio: 5000, peso: 4,
    descripcion: 'Torta 100 % Angus, queso Alturino y mozzarella, tocineta, cebolla caramelizada, lechuga y tomate, servida con papas.',
  },
  {
    cat: 'Comidas', nombre: 'Gallo de Queso', precio: 2500, peso: 3,
    descripcion: 'Queso a la plancha o natural con pico de gallo y 2 tortillas.',
  },
  {
    cat: 'Comidas', nombre: 'Gallo de Picadillo de Arracache', precio: 2800, peso: 2,
    descripcion: 'Picadillo con tortillas palmeadas.',
  },
  {
    cat: 'Comidas', nombre: 'Tortilla Aliñada Encostrada', precio: 2800, peso: 2,
    descripcion: 'Tortilla con tres quesos y natilla.',
  },
  {
    cat: 'Comidas', nombre: 'Dados de Queso', precio: 3000, peso: 3,
    descripcion: '10 unidades servidas con salsa.',
  },
  {
    cat: 'Comidas', nombre: 'Palitos de Queso', precio: 3200, peso: 3,
    descripcion: '8 unidades servidas con salsa.',
  },
];

/* ------------------------------------------------------------------ */
/* SQL                                                                 */
/* ------------------------------------------------------------------ */

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildSql() {
  const cats = CATEGORIAS.map(
    (c) => `  (${sqlLiteral(c.nombre)}, ${c.orden}, ${sqlLiteral(c.icono)})`
  ).join(',\n');

  // `orden` del producto = posición dentro de su categoría.
  const ordenPorProducto = new Map();
  for (const c of CATEGORIAS) {
    let i = 0;
    for (const p of PRODUCTOS.filter((x) => x.cat === c.nombre)) {
      i += 10;
      ordenPorProducto.set(`${c.nombre}|${p.nombre}`, i);
    }
  }
  const prodsConOrden = PRODUCTOS.map(
    (p) =>
      `  (${sqlLiteral(p.cat)}, ${sqlLiteral(p.nombre)}, ${sqlLiteral(p.descripcion ?? null)}, ${p.precio.toFixed(2)}, ${ordenPorProducto.get(`${p.cat}|${p.nombre}`) ?? 10})`
  ).join(',\n');

  return `-- ============================================================================
-- 0003_menu_sanvi.sql
--
-- Menú SANVÍ (bebidas + comidas) según el documento "NUEVO MENU".
--
-- IMPORTANTE:
--   - Los precios se cargan LITERALES: ya incluyen IVA.
--     NUNCA se suma el 10% de servicio (prohibido por las reglas del proyecto).
--   - menu_origen = 'menu3' identifica este menú.
--   - orden conserva el orden del menú físico del cliente.
--
-- El script es idempotente: borra el menú anterior y carga este.
-- Las órdenes históricas NO se borran: orden_items.producto_id queda NULL
-- (ON DELETE SET NULL) y los comprobantes conservan su items_snapshot.
-- ============================================================================

begin;

-- 1. Menú anterior (productos primero: los productos referencian categorías).
delete from public.productos;
delete from public.categorias;

-- 2. Categorías.
insert into public.categorias (nombre, orden, icono, activo) values
${cats}
on conflict (nombre) do update
  set orden = excluded.orden, icono = excluded.icono, activo = excluded.activo;

-- 3. Productos.
insert into public.productos (categoria_id, nombre, descripcion, precio, disponible, orden, menu_origen)
select c.id, v.nombre, v.descripcion, v.precio, true, v.orden, 'menu3'
from (values
${prodsConOrden}
) as v(cat, nombre, descripcion, precio, orden)
join public.categorias c on c.nombre = v.cat
on conflict (categoria_id, nombre, menu_origen) do update
  set precio = excluded.precio,
      descripcion = excluded.descripcion,
      disponible = excluded.disponible,
      orden = excluded.orden;

commit;
`;
}

/* ------------------------------------------------------------------ */
/* Aplicación directa por REST (service_role)                          */
/* ------------------------------------------------------------------ */

function readEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 0) continue;
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch {
    /* sin .env.local */
  }
  return out;
}

async function main() {
  const modo = process.argv[2];
  const env = readEnv(new URL('../.env.local', import.meta.url).pathname);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  if (modo === '--sql') {
    const destino = new URL('../../supabase/migrations/0003_menu_sanvi.sql', import.meta.url).pathname;
    writeFileSync(destino, buildSql());
    console.log('SQL generado:', destino);
    return;
  }

  if (modo !== '--apply') {
    console.log('Uso: node scripts/menu-sanvi.mjs --sql | --apply');
    return;
  }

  console.log('1/4 borrando productos...');
  let r = await fetch(`${url}/rest/v1/productos?id=not.is.null`, { method: 'DELETE', headers });
  if (!r.ok) throw new Error(`DELETE productos: ${r.status} ${await r.text()}`);

  console.log('2/4 borrando categorías...');
  r = await fetch(`${url}/rest/v1/categorias?id=not.is.null`, { method: 'DELETE', headers });
  if (!r.ok) throw new Error(`DELETE categorias: ${r.status} ${await r.text()}`);

  console.log('3/4 insertando categorías...');
  r = await fetch(`${url}/rest/v1/categorias`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(CATEGORIAS.map((c) => ({ nombre: c.nombre, orden: c.orden, icono: c.icono, activo: true }))),
  });
  if (!r.ok) throw new Error(`POST categorias: ${r.status} ${await r.text()}`);
  const cats = await r.json();

  console.log('4/4 insertando productos...');
  const catId = new Map(cats.map((c) => [c.nombre, c.id]));
  const ordenPorProducto = new Map();
  for (const c of CATEGORIAS) {
    let i = 0;
    for (const p of PRODUCTOS.filter((x) => x.cat === c.nombre)) {
      i += 10;
      ordenPorProducto.set(`${c.nombre}|${p.nombre}`, i);
    }
  }
  const filas = PRODUCTOS.map((p) => ({
    categoria_id: catId.get(p.cat),
    nombre: p.nombre,
    descripcion: p.descripcion ?? null,
    precio: p.precio,
    disponible: true,
    orden: ordenPorProducto.get(`${p.cat}|${p.nombre}`) ?? 10,
    menu_origen: 'menu3',
  }));
  r = await fetch(`${url}/rest/v1/productos`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(filas),
  });
  if (!r.ok) throw new Error(`POST productos: ${r.status} ${await r.text()}`);
  const prods = await r.json();

  console.log(`\n✅ Menú SANVÍ cargado: ${cats.length} categorías, ${prods.length} productos`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await main();
}
