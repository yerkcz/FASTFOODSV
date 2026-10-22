#!/usr/bin/env node
/**
 * Cierres de caja históricos para la demo.
 *
 * Genera un cierre por cada día con ventas (excepto HOY, que se deja
 * abierto para que la dueña pueda hacer el cierre en vivo).
 *
 *   node scripts/seed-caja-cierres.mjs
 *
 * Replica exactamente la lógica de `src/lib/cierreCaja.ts`:
 *   - La fuente de verdad son los `comprobantes` del día (hora CR).
 *   - El efectivo esperado = fondo inicial + efectivo del día - gastos.
 *   - El efectivo contado simula un descuadre pequeño (±₡500).
 */

import { readFileSync } from 'node:fs';

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

const env = readEnv(new URL('../.env.local', import.meta.url).pathname);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rest(path, options = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: HEADERS, ...options });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** LCG determinista. */
let seed = 7654321;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function randInt(min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}

function crIso(fecha, hour, minute) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour + 6, minute, 0)).toISOString();
}
function fechaCR(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
}

const GASTOS_POSIBLES = [
  'Compra de hielo y refrescos',
  'Panadería del día',
  'Gasolina del reparto',
  'Productos de limpieza',
  null,
  null,
  null,
];

async function main() {
  const hoy = fechaCR(new Date().toISOString());

  // Todos los comprobantes (el seed no pasa de ~600 filas).
  const comps = await rest('comprobantes?select=id,orden_id,pago_id,total,descuento,created_at&order=created_at');
  const pagos = await rest('pagos?select=id,forma_pago,monto,created_at');
  const pagoById = new Map(pagos.map((p) => [p.id, p]));

  // Agrupar por fecha de negocio (hora CR).
  const porFecha = new Map();
  for (const c of comps) {
    const f = fechaCR(c.created_at);
    if (f === hoy) continue; // hoy queda abierto para la demo en vivo
    if (!porFecha.has(f)) porFecha.set(f, []);
    porFecha.get(f).push(c);
  }

  const cierres = [];
  for (const [fecha, delDia] of [...porFecha.entries()].sort()) {
    let ingresos = 0;
    let descuentos = 0;
    let efectivo = 0;
    let tarjeta = 0;
    let sinpe = 0;
    const ordenes = new Set();

    for (const c of delDia) {
      ingresos += Number(c.total || 0);
      if (Number(c.descuento || 0) > 0) descuentos += Number(c.descuento);
      if (c.orden_id) ordenes.add(c.orden_id);
      const pago = c.pago_id ? pagoById.get(c.pago_id) : undefined;
      if (!pago) continue;
      const fp = (pago.forma_pago || '').toLowerCase();
      const m = Number(pago.monto || 0);
      if (fp === 'efectivo') efectivo += m;
      else if (fp === 'tarjeta') tarjeta += m;
      else if (fp === 'sinpe') sinpe += m;
    }

    const fondo = randInt(4, 8) * 5000; // ₡20.000 - ₡40.000
    const gastos = rnd() < 0.35 ? randInt(1, 12) * 500 : 0;
    const esperado = fondo + efectivo - gastos;
    const descuadre = rnd() < 0.65 ? 0 : randInt(-500, 500);
    const contado = esperado + descuadre;
    const obs = GASTOS_POSIBLES[randInt(0, GASTOS_POSIBLES.length - 1)];

    cierres.push({
      fecha,
      cajero_id: null,
      fondo_inicial: fondo,
      gastos_efectivo: gastos,
      total_ordenes: ordenes.size,
      total_comprobantes: delDia.length,
      total_ingresos: ingresos,
      total_efectivo: efectivo,
      total_tarjeta: tarjeta,
      total_sinpe: sinpe,
      total_descuentos: descuentos,
      // `efectivo_esperado` y `diferencia` son columnas GENERADAS por la BD:
      // no se pueden insertar (las calcula Postgres).
      efectivo_contado: contado,
      observaciones: obs,
      abierta_at: crIso(fecha, 7, 0),
      cerrado_at: crIso(fecha, randInt(21, 23), randInt(0, 59)),
      created_at: crIso(fecha, 7, 5),
    });
  }

  // Reemplazar los cierres anteriores (de prueba) de esas fechas.
  const fechas = cierres.map((c) => c.fecha).map((f) => `"${f}"`).join(',');
  if (fechas) {
    await rest(`cierres_caja?fecha=in.(${fechas})`, { method: 'DELETE' });
  }
  await rest('cierres_caja', { method: 'POST', body: JSON.stringify(cierres) });

  const conDescuadre = cierres.filter((c) => Number(c.efectivo_contado) - Number(c.fondo_inicial + c.total_efectivo - c.gastos_efectivo) !== 0).length;
  console.log(`✅ ${cierres.length} cierres de caja creados (${conDescuadre} con descuadre, hoy queda abierto)`);
  console.log(`   Ingresos de ejemplo: ${cierres[0]?.fecha} → ₡${cierres[0]?.total_ingresos?.toLocaleString('en-CR')}`);
}

await main();
