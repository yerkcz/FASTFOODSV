#!/usr/bin/env node
/**
 * Datos de prueba para las Estadísticas.
 *
 * Genera historial realista de comandas, pagos y comprobantes con el menú
 * SANVÍ para poder mostrarle el panel de Estadísticas al cliente.
 *
 *   node scripts/seed-demo-data.mjs              # siembra 65 días (ago 18 → hoy)
 *   node scripts/seed-demo-data.mjs --dias 30    # menos días
 *
 * Reglas que respeta:
 *   - Precios SIEMPRE desde `productos.precio` (nunca se envía el precio).
 *   - Sin 10% de servicio y sin desglose de IVA (los precios ya son finales).
 *   - Las órdenes se cierran como lo hace la app: items → pagos → comprobantes.
 *   - Idempotente: si ya hay datos marcados con la referencia SEED-SANVI,
 *     no vuelve a sembrar.
 */

import { readFileSync } from 'node:fs';

const CR_OFFSET = 6; // Costa Rica = UTC-6
const MARCA = 'SEED-SANVI';

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
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

const rngState = { s: 20261021 };
function rnd() {
  // LCG determinista: el mismo seed produce siempre el mismo historial.
  rngState.s = (rngState.s * 1103515245 + 12345) % 2147483648;
  return rngState.s / 2147483648;
}
function pick(list) {
  return list[Math.floor(rnd() * list.length)];
}
function pickWeighted(entries) {
  const total = entries.reduce((s, e) => s + e.peso, 0);
  let r = rnd() * total;
  for (const e of entries) {
    r -= e.peso;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}
function chance(p) {
  return rnd() < p;
}
function randInt(min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}

/** Fecha local CR (YYYY-MM-DD) → timestamp UTC ISO. */
function crIso(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour + CR_OFFSET, minute, 0)).toISOString();
}
function fechaCR(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
function dow(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/* ------------------------------------------------------------------ */
/* Catálogos                                                           */
/* ------------------------------------------------------------------ */

const NOMBRES = [
  'Ana Pérez', 'Carlos Rojas', 'María Jiménez', 'Luis Vargas', 'Sofía Ramírez',
  'Andrés Castro', 'Karla Soto', 'Daniela Molina', 'Sebastián Chaves', 'Laura González',
  'Daniel Hernández', 'Mariana Solís', 'Fabiana Umaña', 'Josué Vega', 'Karla Zúñiga',
  'Gabriel Madrigal', 'Valeria Quesada', 'Esteban Alfaro', 'Camila Fallas', 'Brandon Zúñiga',
  'Melissa Baltodano', 'Ricardo Granados', 'Stephanie Álvarez', 'Alison Pérez',
  'Keylor Soto', 'Yorlenis Obando', 'Steven Araya', 'Natalia Solano', 'Rigoberto Mena',
  'Silvia Vargas', 'Andrés Zúñiga', 'Priscilla Wolf', 'Emanuel Quesada', 'Luz Marina Vega',
  'Kevin Badilla', 'Jennifer Solano', 'Wilberth Rojas', 'Adriana Zamora', 'Guillermo Mata',
  'Dayana Cristina', 'Óscar Rivera', 'Paola Navarro', 'Héctor Chinchilla',
];

const CLIENTES_FIJOS = NOMBRES.slice(0, 22).map((nombre, i) => ({
  nombre,
  telefono: `8${String(1000000 + i * 7301).slice(0, 7)}`,
}));

const NOTAS = [
  'sin azúcar', 'con leche de avena', 'para llevar', 'extra hielo', 'sin lactosa',
  'hot', 'con poca espuma', 'sin café', 'para dos personas', 'sin canela',
];

const MOTIVOS_DESCUENTO = ['Cliente frecuente', 'Promo del día', 'Cortesía', 'Cumpleaños'];

/** Horarios con peso: mañana de café, almuerzo y noche. */
const FRANJAS = [
  { desde: 7, hasta: 10, peso: 12 },   // café de la mañana
  { desde: 11, hasta: 14, peso: 34 },  // almuerzo
  { desde: 15, hasta: 17, peso: 14 },  // tarde
  { desde: 18, hasta: 21, peso: 32 },  // cena
  { desde: 22, hasta: 23, peso: 8 },   // cierre
];

/* ------------------------------------------------------------------ */
/* Conexión                                                            */
/* ------------------------------------------------------------------ */

const env = readEnv(new URL('../.env.local', import.meta.url).pathname);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, options = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: HEADERS, ...options });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const argDias = process.argv.indexOf('--dias');
  const DIAS = argDias > -1 ? Number(process.argv[argDias + 1]) : 65;

  // ¿Ya se sembró?
  const yaSembrado = await rest('pagos?select=id&referencia=eq.' + MARCA + '&limit=1');
  if (yaSembrado && yaSembrado.length > 0) {
    if (!process.argv.includes('--reset')) {
      console.log('⚠️  Ya existen datos de prueba (referencia ' + MARCA + '). No se siembra de nuevo.');
      console.log('   Para rehacerlos: node scripts/seed-demo-data.mjs --reset');
      return;
    }
    console.log('0/5 borrando los datos de prueba anteriores...');
    const pagos = await rest('pagos?select=id,orden_id&referencia=eq.' + MARCA);
    const ordenIds = [...new Set((pagos || []).map((p) => p.orden_id).filter(Boolean))];
    if (ordenIds.length > 0) {
      const inList = ordenIds.map((id) => `"${id}"`).join(',');
      const pagoIds = (pagos || []).map((p) => `"${p.id}"`).join(',');
      await rest(`comprobantes?orden_id=in.(${inList})`, { method: 'DELETE' });
      await rest(`orden_items?orden_id=in.(${inList})`, { method: 'DELETE' });
      await rest(`pagos?id=in.(${pagoIds})`, { method: 'DELETE' });
      await rest(`ordenes?id=in.(${inList})`, { method: 'DELETE' });
    }
    console.log(`   borradas ${ordenIds.length} órdenes de prueba`);
  }

  // Productos del menú SANVÍ (el precio SIEMPRE sale de la base).
  const cats = await rest('categorias?select=id,nombre,orden&order=orden');
  const prods = await rest('productos?select=id,nombre,precio,categoria_id,orden&disponible=eq.true&order=orden');
  if (!prods || prods.length === 0) throw new Error('No hay productos: cargá el menú SANVÍ primero.');

  const catNombre = new Map(cats.map((c) => [c.id, c.nombre]));
  const catKds = new Map(
    cats.map((c) => [
      c.id,
      ['Bebidas de Café', 'Tés e Infusiones'].includes(c.nombre)
        ? 'hot'
        : ['Comidas'].includes(c.nombre)
          ? 'kitchen'
          : 'cold',
    ])
  );

  // Peso de popularidad: los productos de las categorías más vendidas pesan más.
  const catalogo = prods.map((p) => {
    const cat = catNombre.get(p.categoria_id);
    const base = cat === 'Bebidas de Café' ? 9 : cat === 'Cervezas' ? 7 : cat === 'Batidos Naturales' ? 6 : cat === 'Comidas' ? 3 : 3;
    return { ...p, cat, peso: base, kds: catKds.get(p.categoria_id) };
  });

  // Máximo `numero` de comprobante por fecha (para no repetir consecutivo).
  const compsExistentes = await rest('comprobantes?select=fecha,numero');
  const ultimoNumero = new Map();
  for (const c of compsExistentes || []) {
    const n = Number(c.numero) || 0;
    if (n > (ultimoNumero.get(c.fecha) || 0)) ultimoNumero.set(c.fecha, n);
  }

  const hoy = fechaCR(new Date().toISOString());
  const inicio = addDays(hoy, -(DIAS - 1));
  const horaActualCR = Number(
    new Date().toLocaleString('en-US', { timeZone: 'America/Costa_Rica', hour: '2-digit', hour12: false })
  );

  const mesas = await rest('mesas?select=id,numero');
  const mesaPorNumero = new Map(mesas.map((m) => [m.numero, m.id]));

  let totalOrdenes = 0;
  let totalComprobantes = 0;
  let totalItems = 0;
  let totalVenta = 0;

  for (let offset = 0; offset < DIAS; offset++) {
    const fecha = addDays(inicio, offset);
    const diaSemana = dow(fecha);
    const esFinde = diaSemana === 5 || diaSemana === 6; // viernes/sábado
    const esLunes = diaSemana === 1;

    // El lunes el local no abre; además algunos días al azar.
    if (esLunes) continue;
    if (chance(0.06)) continue;

    const base = esFinde ? randInt(11, 16) : randInt(5, 11);
    const nOrdenes = Math.max(4, base + randInt(-2, 2));

    const ordenes = [];
    const items = [];
    const pagos = [];
    const comprobantes = [];
    let numeroDia = ultimoNumero.get(fecha) || 0;

    for (let i = 0; i < nOrdenes; i++) {
      const franja = pickWeighted(FRANJAS);
      let hora = randInt(franja.desde, franja.hasta);
      let minuto = randInt(0, 59);
      // Hoy no inventamos ventas futuras.
      if (fecha === hoy && hora >= horaActualCR) continue;

      const esMesa = chance(0.66);
      const numeroMesa = esMesa ? randInt(1, 6) : 99;

      // Cliente: ~40% de las comandas lo identifica.
      let cliente = null;
      let telefono = null;
      if (chance(0.4)) {
        if (chance(0.62)) {
          cliente = pick(CLIENTES_FIJOS);
          telefono = cliente.telefono;
        } else {
          cliente = { nombre: pick(NOMBRES), telefono: null };
        }
      }

      const clienteNombre = esMesa
        ? cliente
          ? `Mesa ${numeroMesa} - ${cliente.nombre}`
          : `Mesa ${numeroMesa}`
        : cliente
          ? cliente.nombre
          : 'Para Llevar';

      // Ítems: 1 a 6 productos distintos, con más peso a los favoritos.
      const nItems = randInt(1, 6);
      const elegidos = new Map();
      for (let k = 0; k < nItems; k++) {
        const prod = pickWeighted(catalogo);
        elegidos.set(prod.id, prod);
      }

      const lineas = [...elegidos.values()].map((p) => {
        const cantidad = chance(0.12) ? randInt(2, 3) : 1;
        return {
          producto: p,
          cantidad,
          subtotal: Number(p.precio) * cantidad,
          notas: chance(0.14) ? pick(NOTAS) : null,
        };
      });

      const bruto = lineas.reduce((s, l) => s + l.subtotal, 0);
      const tieneDescuento = chance(0.07);
      const pctDesc = tieneDescuento ? pick([5, 10]) : 0;
      const descuento = Math.round((bruto * pctDesc) / 100);
      const neto = bruto - descuento;

      const ordenId = crypto.randomUUID();
      const abierta = crIso(fecha, hora, minuto);
      let cerrada = crIso(fecha, Math.min(23, hora + randInt(0, 1)), Math.min(59, minuto + randInt(5, 55)));
      // Nunca un cierre en el futuro: si el cierre caería después de "ahora",
      // se ajusta al instante actual (solo afecta el día de hoy).
      const ahora = new Date().toISOString();
      if (cerrada > ahora) cerrada = ahora < abierta ? abierta : ahora;

      ordenes.push({
        id: ordenId,
        mesa_id: esMesa ? mesaPorNumero.get(numeroMesa) : mesaPorNumero.get(99) ?? null,
        mesa_numero: numeroMesa,
        tipo: esMesa ? 'mesa' : 'llevar',
        cliente_nombre: clienteNombre,
        cliente_telefono: telefono,
        estado: 'abierta',
        notas: null,
        opened_at: abierta,
        closed_at: cerrada,
        created_at: abierta,
        descuento_tipo: tieneDescuento ? 'porcentaje' : 'monto',
        descuento_valor: tieneDescuento ? pctDesc : 0,
        descuento_motivo: tieneDescuento ? pick(MOTIVOS_DESCUENTO) : null,
      });

      for (const l of lineas) {
        items.push({
          id: crypto.randomUUID(),
          orden_id: ordenId,
          producto_id: l.producto.id,
          nombre_producto: l.producto.nombre,
          precio_unitario: Number(l.producto.precio),
          cantidad: l.cantidad,
          subtotal: l.subtotal,
          notas: l.notas,
          estado_kds: 'listo',
          listo: true,
          hora_registro: abierta,
          created_at: abierta,
        });
      }

      // Split bill: ~11% de las comandas se cobran en 2 o 3 partes.
      const partes = chance(0.11) ? randInt(2, 3) : 1;
      let restanteNeto = neto;
      let descuentoPendiente = descuento;

      for (let p = 0; p < partes; p++) {
        const ultima = p === partes - 1;
        // Reparto de los ítems entre las partes (la última se queda con el resto).
        const desde = Math.floor((lineas.length * p) / partes);
        const hasta = ultima ? lineas.length : Math.floor((lineas.length * (p + 1)) / partes);
        const lineasParte = lineas.slice(desde, hasta);
        if (!lineasParte.length) continue;

        const brutoParte = lineasParte.reduce((s, l) => s + l.subtotal, 0);
        const netoParte = ultima ? restanteNeto : Math.round((brutoParte * neto) / bruto);
        const descuentoParte = ultima ? descuentoPendiente : 0;
        restanteNeto -= netoParte;
        descuentoPendiente -= descuentoParte;

        const formaPago = pickWeighted([
          { v: 'efectivo', peso: 52 },
          { v: 'tarjeta', peso: 36 },
          { v: 'sinpe', peso: 12 },
        ]).v;

        const pagoId = crypto.randomUUID();
        const redondeo = formaPago === 'efectivo' && chance(0.55)
          ? Math.ceil(netoParte / 500) * 500
          : netoParte;
        pagos.push({
          id: pagoId,
          orden_id: ordenId,
          forma_pago: formaPago,
          monto: netoParte,
          monto_recibido: formaPago === 'efectivo' ? redondeo : null,
          vuelto: formaPago === 'efectivo' ? Math.max(0, redondeo - netoParte) : 0,
          notas: null,
          referencia: MARCA,
          created_at: cerrada,
        });

        numeroDia += 1;
        const snapshot = lineasParte.map((l) => ({
          nombre: l.producto.nombre,
          cantidad: l.cantidad,
          precio_unitario: Number(l.producto.precio),
          subtotal: l.subtotal,
          notas: l.notas,
          categoria: l.producto.cat,
        }));

        comprobantes.push({
          id: crypto.randomUUID(),
          numero: numeroDia,
          fecha,
          orden_id: ordenId,
          pago_id: pagoId,
          total: netoParte,
          subtotal: brutoParte,
          descuento: descuentoParte,
          items_snapshot: snapshot,
          created_at: cerrada,
        });
        totalComprobantes += 1;
      }

      totalOrdenes += 1;
      totalItems += lineas.length;
      totalVenta += neto;
    }

    if (!ordenes.length) continue;

    // Inserts batched por día (4 requests en vez de cientos).
    await rest('ordenes', { method: 'POST', body: JSON.stringify(ordenes) });
    await rest('orden_items', { method: 'POST', body: JSON.stringify(items) });
    await rest('pagos', { method: 'POST', body: JSON.stringify(pagos) });
    await rest('comprobantes', { method: 'POST', body: JSON.stringify(comprobantes) });

    // Cerrar las órdenes (el trigger de pagos ya dejó estado_pago='pagado').
    const ids = ordenes.map((o) => o.id);
    for (let i = 0; i < ids.length; i += 50) {
      await rest('ordenes?id=in.(' + ids.slice(i, i + 50).join(',') + ')', {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'cerrada' }),
      });
    }

    process.stdout.write(
      `  ${fecha}  ${String(ordenes.length).padStart(2)} comandas  ${String(comprobantes.length).padStart(2)} comprobantes\n`
    );
  }

  // Las mesas quedaron marcadas como 'ocupada' por el trigger de totales.
  await rest('mesas?numero=neq.0', { method: 'PATCH', body: JSON.stringify({ estado: 'libre', orden_actual_id: null }) });

  console.log('\n✅ Datos de prueba listos:');
  console.log(`   ${totalOrdenes} comandas · ${totalComprobantes} comprobantes · ${totalItems} ítems`);
  console.log(`   Venta total simulada: ₡${totalVenta.toLocaleString('en-CR')}`);
}

await main();
