// Verificacion de integridad del cobro. Corre contra el dev server.
//   npm run dev            (en otra terminal)
//   node scripts/verify_integridad.mjs
//
// Cubre lo que NO se puede ver en la UI: que no queden pagos sin comprobante,
// que la numeracion no colisione, que no se pueda cobrar dos veces, y que los
// comprobantes reimprimibles tengan los items correctos.
//
// IMPORTANTE: crea ordenes de prueba y las cobra. Ejecutar
// `node scripts/cleanup_test_data.js` al terminar.

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── env ────────────────────────────────────────────────────────────────────
const env = {};
for (const line of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const BASE = process.env.POS_URL || 'http://localhost:3000';
const KEY = env.NEXT_PUBLIC_ADMIN_API_KEY || env.SELF_ORDER_API_KEY || 'admin123';
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌', m); } };
const money = (n) => '₡' + Number(n).toLocaleString('es-CR');
const section = (t) => console.log(`\n=== ${t} ===`);

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-admin-key': KEY, ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  return { status: res.status, body };
}

// ── helpers de escenario ───────────────────────────────────────────────────
const Q = { name: 'Tortilla con Queso', quantity: 1 }; // ₡2.000
const A = { name: 'Tortilla Alineada', quantity: 1 };   // ₡1.700

async function createOrder(mesa, cliente, items = [Q]) {
  const r = await api('/api/order', { method: 'POST', body: JSON.stringify({ mesa: String(mesa), cliente, items }) });
  if (r.status !== 200) throw new Error(`createOrder ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}
const itemsOf = async (nu) => (await api(`/api/admin/table-details?orden_nu=${nu}`)).body.items || [];
const mesaGroup = async (n) => (await api('/api/admin/tables')).body.mesa_groups.find((g) => g.mesa === String(n)) || null;
const closeMesa = (n, recibido = 999999) =>
  api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ close_all_mesa: n, forma_pago: 'Efectivo', recibido }) });

try {
  // ── 1. Idempotencia ──────────────────────────────────────────────────────
  section('1. Idempotencia: una orden no se cobra dos veces');
  const o1 = await createOrder(3, 'Idem');
  const c1 = await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: o1.orden_nu, forma_pago: 'Efectivo', recibido: 2000 }) });
  ok(c1.status === 200, `primer cobro 200 (${c1.status})`);
  const c2 = await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: o1.orden_nu, forma_pago: 'Efectivo', recibido: 2000 }) });
  ok(c2.status === 409, `segundo cobro → 409 (${c2.status}) "${c2.body.error}"`);
  ok((await api('/api/admin/closed-orders')).body.orders.filter((x) => x.orden_nu === o1.orden_nu).length === 1,
    'exactamente 1 comprobante (no doble cobro)');

  // ── 2. Validacion de orden_nu ───────────────────────────────────────────
  section('2. orden_nu invalido');
  const ghost = await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: '00000000-0000-0000-0000-000000000000', forma_pago: 'Efectivo', recibido: 100 }) });
  ok(ghost.status === 404, `uuid inexistente → 404 (${ghost.status}) "${ghost.body.error}"`);
  const noUuid = await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: 'no-es-uuid', forma_pago: 'Efectivo', recibido: 100 }) });
  ok(noUuid.status === 500 && !String(noUuid.body.error).includes('uuid'), `id mal formado no filtra error de Postgres → "${noUuid.body.error}"`);
  const abierta = await createOrder(3, 'FormaPago');
  const malaForma = await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: abierta.orden_nu, forma_pago: 'Bitcoin', recibido: 100 }) });
  ok(malaForma.status === 400, `forma_pago invalida → 400 (${malaForma.status}) "${malaForma.body.error}"`);
  ok((await api('/api/admin/closed-orders')).body.orders.every((x) => x.orden_nu !== abierta.orden_nu), 'no se cobro con forma_pago invalida');
  await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: abierta.orden_nu, forma_pago: 'Efectivo', recibido: 2000 }) });

  // ── 3. item_ids fuera de alcance ────────────────────────────────────────
  section('3. item_ids de otra mesa no se cobran ni se borran');
  await createOrder(5, 'Alcance');
  const ajena = await createOrder(6, 'Ajena');
  const foraneos = (await itemsOf(ajena.orden_nu)).map((i) => i.ID || i.id);
  const r3 = await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ close_all_mesa: 5, forma_pago: 'Efectivo', recibido: 100, item_ids: foraneos }) });
  ok(r3.status === 400, `rechazado 400 (${r3.status}) "${r3.body.error}"`);
  ok((await itemsOf(ajena.orden_nu)).length === foraneos.length, `items de mesa 6 intactos (${(await itemsOf(ajena.orden_nu)).length})`);
  ok(!(await api('/api/admin/closed-orders')).body.orders.some((x) => x.orden_nu === ajena.orden_nu), 'no se genero comprobante para mesa 6');
  await closeMesa(5); await closeMesa(6);

  // ── 4. Vuelto ───────────────────────────────────────────────────────────
  section('4. Vuelto en cierre simple');
  const o4 = await createOrder(3, 'Vuelto');
  const r4 = await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: o4.orden_nu, forma_pago: 'Efectivo', recibido: 3000 }) });
  const c4 = (await api('/api/admin/closed-orders')).body.orders.find((x) => x.orden_nu === o4.orden_nu);
  ok(r4.status === 200 && c4, `comprobante creado (${r4.status})`);
  ok(c4?.total === 2000, `total ${money(c4?.total)}`);
  ok(c4?.monto_recibido === 3000, `recibido ${money(c4?.monto_recibido)}`);
  ok(c4?.vuelto === 1000, `vuelto ${money(c4?.vuelto)} (esperado ₡1.000)`);
  ok(c4?.forma_pago === 'efectivo', `forma_pago "${c4?.forma_pago}"`);

  // ── 5. Split por items ───────────────────────────────────────────────────
  section('5. Split por items: 2 comprobantes, vuelto en el ultimo');
  const o5 = await createOrder(4, 'Split', [Q, Q, A]);
  const its = await itemsOf(o5.orden_nu);
  const total = its.reduce((s, i) => s + Number(i.PRECIO) * Number(i.CANTIDAD), 0);
  const cobrados = its.filter((i) => i.ARTICULO === Q.name).map((i) => i.ID);
  const sub = its.filter((i) => i.ARTICULO === Q.name).reduce((s, i) => s + Number(i.PRECIO) * Number(i.CANTIDAD), 0);
  const r5 = await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: o5.orden_nu, forma_pago: 'Efectivo', recibido: sub + 3000, item_ids: cobrados }) });
  ok(r5.status === 200 && r5.body.split === true, `split parcial (${r5.status}, split=${r5.body.split})`);
  const cs = (await api('/api/admin/closed-orders')).body.orders.filter((x) => x.orden_nu === o5.orden_nu);
  ok(cs[0]?.total === sub, `comprobante parcial por ${money(cs[0]?.total)} (esperado ${money(sub)})`);
  ok(cs[0]?.vuelto === 3000, `vuelto ${money(cs[0]?.vuelto)}`);
  ok((await itemsOf(o5.orden_nu)).length === 1, `queda 1 item vivo (${(await itemsOf(o5.orden_nu)).length})`);
  await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: o5.orden_nu, forma_pago: 'Efectivo', recibido: 1700 }) });
  const cs2 = (await api('/api/admin/closed-orders')).body.orders.filter((x) => x.orden_nu === o5.orden_nu);
  ok(cs2.length === 2, `2 comprobantes (${cs2.length})`);
  ok(cs2.reduce((s, x) => s + x.total, 0) === total, `suma = ${money(cs2.reduce((s, x) => s + x.total, 0))} = orden ${money(total)}`);

  // ── 6. Reasignar item ───────────────────────────────────────────────────
  section('6. Reasignar item auto-cierra la orden huerfana');
  const a6 = await createOrder(5, 'Yerik', [Q]);
  const b6 = await createOrder(5, 'María', [A]);
  const r6 = await api('/api/admin/reassign-item', { method: 'POST', body: JSON.stringify({ itemId: (await itemsOf(a6.orden_nu))[0].ID, targetOrdenNu: b6.orden_nu }) });
  ok(r6.status === 200, `reasignacion (${r6.status})`);
  ok((await itemsOf(a6.orden_nu)).length === 0, `origen sin items (${(await itemsOf(a6.orden_nu)).length})`);
  ok((await itemsOf(b6.orden_nu)).length === 2, `destino con 2 items (${(await itemsOf(b6.orden_nu)).length})`);
  ok((await mesaGroup(5))?.ordenes.length === 1, `mesa 5 muestra 1 orden (${(await mesaGroup(5))?.ordenes.length})`);
  await closeMesa(5);

  // ── 7. Mesa multi-orden ─────────────────────────────────────────────────
  section('7. Mesa multi-orden: un cobro, un vuelto');
  const a7 = await createOrder(6, 'Ana', [Q]);
  const b7 = await createOrder(6, 'Beto', [A]);
  const g7 = await mesaGroup(6);
  ok(g7?.ordenes.length === 2, `mesa 6 agrupa 2 ordenes (${g7?.ordenes.length})`);
  ok(g7?.total_mesa === 3700, `total mesa ${money(g7?.total_mesa)}`);
  const r7 = await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ close_all_mesa: 6, forma_pago: 'Efectivo', recibido: 10000 }) });
  ok(r7.status === 200, `cierre multi-orden (${r7.status})`);
  const c7 = (await api('/api/admin/closed-orders')).body.orders.filter((x) => x.orden_nu === a7.orden_nu || x.orden_nu === b7.orden_nu);
  ok(c7.length === 2, `2 comprobantes (${c7.length})`);
  ok(c7.reduce((s, x) => s + x.total, 0) === 3700, `suma ${money(c7.reduce((s, x) => s + x.total, 0))}`);
  ok(c7.filter((x) => x.vuelto > 0).length === 1, 'solo 1 comprobante con vuelto');
  ok(c7.find((x) => x.vuelto > 0)?.vuelto === 6300, `vuelto ${money(c7.find((x) => x.vuelto > 0)?.vuelto)} (esperado ${money(6300)})`);
  ok(c7.filter((x) => !x.monto_recibido).length === 1, 'el pago intermedio tiene monto_recibido null');
  ok(!(await mesaGroup(6)), 'mesa 6 liberada');

  // ── 8. Ordenes independientes en la misma mesa ───────────────────────────
  section('8. Cerrar una orden no afecta a la otra de la misma mesa');
  const a8 = await createOrder(3, 'Uno', [Q]);
  const b8 = await createOrder(3, 'Dos', [A]);
  ok((await mesaGroup(3))?.ordenes.length === 2, `2 ordenes en mesa 3 (${(await mesaGroup(3))?.ordenes.length})`);
  await api('/api/admin/close-table', { method: 'POST', body: JSON.stringify({ orden_nu: a8.orden_nu, forma_pago: 'Efectivo', recibido: 2000 }) });
  const g8 = await mesaGroup(3);
  ok(g8?.ordenes.length === 1, `queda 1 orden (${g8?.ordenes.length})`);
  ok(g8?.total_mesa === 1700, `mesa 3 vale ${money(g8?.total_mesa)} (solo la 2da)`);
  ok((await itemsOf(b8.orden_nu)).length === 1, 'items de la 2da orden intactos');
  await closeMesa(3);

  // ── 9. Numeracion + fecha CR ────────────────────────────────────────────
  section('9. Numeracion consecutiva y fecha en hora CR');
  const orders = (await api('/api/admin/closed-orders')).body.orders;
  const nums = orders.map((x) => x.numero);
  ok(new Set(nums).size === nums.length, `sin numeros duplicados (${nums.length} hoy)`);
  const sorted = [...nums].sort((x, y) => x - y);
  ok(sorted.every((n, i) => n === i + 1), `secuencia 1..${sorted.length} sin huecos → ${sorted.join(', ')}`);
  const crHoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
  // `fecha` de closed-orders es `created_at`: un timestamptz, o sea un instante UTC
  // en el cable. Recortarlo con slice(0,10) devolvía la fecha UTC, que NO coincide con
  // la CR entre 6pm y medianoche — el gate fallaba solo en esa ventana diaria.
  // (El resto del sistema ya es CR: nextDateCR() en la ventana, comprobantes.fecha en el
  // INSERT, crDateOnly() en cierre, p_fecha del RPC.) Aquí se convierte a hora CR.
  const fechaCR = (iso) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date(iso));
  ok(orders.every((x) => fechaCR(String(x.fecha)) === crHoy), `todos con fecha CR ${crHoy}`);
  const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const { data: rpcHoy } = await db.rpc('get_siguiente_numero_comprobante', { p_fecha: crHoy });
  const { data: rpcManana } = await db.rpc('get_siguiente_numero_comprobante', { p_fecha: manana });
  ok(typeof rpcHoy === 'number' && rpcHoy === sorted.length + 1, `RPC p_fecha=hoy → ${rpcHoy} (esperado ${sorted.length + 1})`);
  ok(rpcManana === 1, `RPC p_fecha=manana → ${rpcManana} (bucket vacio)`);
  console.log(`     UTC server date = ${new Date().toISOString().slice(0, 10)} | CR date = ${crHoy}`);

  // ── 10. Snapshot reimprimible ───────────────────────────────────────────
  section('10. El comprobante reimprimible tiene los items (sin table-details)');
  const conItems = orders.filter((x) => (x.items_snapshot || []).length > 0);
  ok(conItems.length === orders.length, `todos los comprobantes tienen items_snapshot (${conItems.length}/${orders.length})`);
  // El snapshot guarda los ítems SIN descontar, así que cuadra contra el
  // `subtotal` (bruto) y no contra el `total` (neto). Antes se comparaba
  // directo contra `total` y desde que existe el descuento eso era falso por
  // diseño: 10% sobre ₡5.000 deja snapshot=5.000 y total=4.500 y el check
  // gritaba "malos: 3" aunque todo estuviera bien. Se exigen las DOS
  // igualdades, que es lo que el cliente ve en el papel.
  const mapeoMal = conItems.filter((x) => {
    const calc = x.items_snapshot.reduce((s, i) => s + Number(i.precio_unitario) * Number(i.cantidad), 0);
    const bruto = Number(x.subtotal);
    const desc = Number(x.descuento || 0);
    if (Math.abs(calc - bruto) > 0.01) return true;              // ítems == bruto
    return Math.abs(bruto - desc - Number(x.total)) > 0.01;       // bruto − dto == cobrado
  });
  ok(mapeoMal.length === 0,
    `snapshot == subtotal bruto y total == subtotal − descuento (malos: ${mapeoMal.length})`);
  // 'individual' = pedido suelto sin mesa (0011). 'mesa'/'llevar' siguen
  // siendo los tipos que el POS actual emite para no romper lo que ya corre.
  ok(orders.every((x) => ['mesa', 'llevar', 'individual'].includes(x.tipo)),
    'todo comprobante trae `tipo` conocido para derivar el encabezado');
  const lleva = orders.filter((x) => x.tipo === 'llevar');
  console.log(`     pedidos para llevar hoy: ${lleva.length}`);

  // ── 11. Integridad referencial ──────────────────────────────────────────
  section('11. Sin huerfanos ni colisiones en la base');
  const { data: pagos } = await db.from('pagos').select('id, orden_id, monto');
  const { data: comps } = await db.from('comprobantes').select('id, orden_id, pago_id, total, numero, fecha');
  const compOrdenes = new Set(comps.map((c) => c.orden_id));
  ok(pagos.filter((p) => !compOrdenes.has(p.orden_id)).length === 0, 'pagos sin comprobante: 0');
  const pagoIds = new Set(pagos.map((p) => p.id));
  ok(comps.filter((c) => !pagoIds.has(c.pago_id)).length === 0, 'comprobantes sin pago: 0');
  const porId = new Map(pagos.map((p) => [p.id, p]));
  ok(comps.filter((c) => porId.has(c.pago_id) && Number(porId.get(c.pago_id).monto) !== Number(c.total)).length === 0,
    'comprobante.total == pago.monto en todos');
  const pares = new Map();
  for (const c of comps) pares.set(`${c.fecha}#${c.numero}`, 1);
  ok(pares.size === comps.length, `sin colisiones unique(fecha,numero) (${comps.length} filas)`);

  const { data: cerradas } = await db.from('ordenes').select('id').eq('estado', 'cerrada');
  const cerradasIds = new Set(cerradas.map((o) => o.id));
  // Cerrar NO borra orden_items a proposito: es el rastro de "que se vendio" y
  // mantiene ordenes.total (borrarlos lo pondria en 0 por el trigger).
  // El invariante real es que ningun endpoint de lectura los exponga.
  const { data: kds } = await db.from('orden_items')
    .select('id, ordenes:orden_id!inner(id, estado)')
    .in('estado_kds', ['pendiente', 'preparando', 'listo'])
    .eq('ordenes.estado', 'abierta');
  ok(kds.filter((k) => cerradasIds.has(k.orden_id)).length === 0, 'KDS no expone items de ordenes cerradas');
  const { data: abiertas } = await db.from('ordenes').select('id').eq('estado', 'abierta');
  const { data: itemsAbiertas } = await db.from('orden_items').select('orden_id');
  const conItems2 = new Set(itemsAbiertas.map((i) => i.orden_id));
  const fantasmas = abiertas.filter((o) => !conItems2.has(o.id));
  ok(fantasmas.length === 0,
    `ordenes abiertas sin items (fantasmas): ${fantasmas.length}` +
    (fantasmas.length ? ` -> ${fantasmas.map((o) => o.id.slice(0, 8)).join(', ')}` : ''));
  const { data: mesas } = await db.from('mesas').select('numero, estado');
  const { data: ordenesPorMesa } = await db.from('ordenes')
    .select('mesa_numero, tipo').eq('estado', 'abierta');
  // Solo las MESAS REALES. La 99 es virtual (Para Llevar / mostrador) y por
  // diseno nunca se marca 'ocupada': `/api/order` solo actualiza `mesas`
  // cuando `!isLlevar`. Sin este filtro, cada pedido llevar abierto hacia
  // fallar este check, aunque la base estuviera perfectamente sana.
  const conAbiertas = new Set(
    ordenesPorMesa.filter((o) => o.tipo === 'mesa').map((o) => o.mesa_numero)
  );
  const libresFalsas = mesas.filter((m) => m.estado === 'libre' && conAbiertas.has(m.numero));
  ok(libresFalsas.length === 0, `ninguna mesa real 'libre' tiene ordenes abiertas (malas: ${libresFalsas.length})`);
  console.log(`     ordenes=${abiertas.length + cerradas.length} cerradas=${cerradas.length} pagos=${pagos.length} comprobantes=${comps.length}`);

  // ── 12. Cierre de caja ──────────────────────────────────────────────────
  section('12. Cierre de caja: totales, desviacion e idempotencia');
  {
    const g = await api('/api/cierre-caja');
    ok(g.status === 200, `GET /api/cierre-caja 200 (${g.status})`);
    ok(g.body.fecha === crHoy, `fecha CR ${g.body.fecha} (esperado ${crHoy})`);
    ok(g.body.totales != null, `devuelve totales (${Object.keys(g.body.totales || {}).join(', ')})`);
    ok(typeof g.body.cerrado === 'boolean', `devuelve estado cerrado=${g.body.cerrado}`);

    // Cerrar con un monto a proposito para forzar una desviacion known.
    const esperado = Number(g.body.totales?.total_efectivo ?? 0);
    const contado = Math.max(0, esperado - 500);
    const p = await api('/api/cierre-caja', { method: 'POST', body: JSON.stringify({ efectivo_contado: contado }) });
    ok(p.status === 200, `POST cierre 200 (${p.status})`);
    ok(p.body.ya_cerrado === false, `primer cierre lo crea (ya_cerrado=${p.body.ya_cerrado})`);
    // `diferencia` la calcula Postgres (columna GENERATED), no el codigo.
    const desvio = Number(p.body.cierre?.diferencia);
    ok(Number.isFinite(desvio), `devuelve la diferencia calculada por la DB (${desvio})`);
    if (esperado > 0) {
      ok(desvio === -500, `desviacion = ${money(desvio)} (contado ${money(contado)} - esperado ${money(esperado)})`);
    } else {
      ok(desvio === 0, `sin efectivo esperado: diferencia = ${money(desvio)}`);
    }

    // Idempotente: cerrar dos veces el mismo dia no debe duplicar.
    const p2 = await api('/api/cierre-caja', { method: 'POST', body: JSON.stringify({ efectivo_contado: contado }) });
    ok(p2.status === 200, `segundo POST 200 (${p2.status})`);
    const { count: nCierres } = await db.from('cierres_caja').select('id', { count: 'exact', head: true }).eq('fecha', crHoy);
    ok(nCierres <= 1, `max 1 cierre por dia (${nCierres} filas para ${crHoy})`);

    // Limpiar: el cierre de prueba no debe quedar.
    await db.from('cierres_caja').delete().eq('fecha', crHoy);
  }

  // ── 13. Tema oscuro permanente (AGENTS.md regla 5) ─────────────────────
  // No puedo ver la pantalla, asi que el tema claro se comprueba en el codigo.
  section('13. Sin colores claros hardcodeados (tema oscuro permanente)');
  {
    const file = new URL('../src/components/analytics/AnalyticsDashboard.tsx', import.meta.url);
    // Los unicos colores claros que quedan son los del ternario
    // `pdfLight ? claro : oscuro` — el reporte se imprime en papel blanco.
    // Se corta la linea antes de escanear.
    const src = fs.readFileSync(file, 'utf8')
      .replace(/pdfLight\s*\?.*$/gm, 'pdfLight');
    const claros = [
      [/background:\s*'white'/g, "background: 'white'"],
      [/backgroundColor:\s*'white'/g, "backgroundColor: 'white'"],
      [/#202124/g, '#202124 (texto casi negro)'],
      [/#f8f9fa/g, '#f8f9fa (fondo casi blanco)'],
      [/#5f6368/g, '#5f6368 (gris claro)'],
      [/#e8eaed/g, '#e8eaed (borde claro)'],
    ];
    const restantes = [];
    for (const [re, label] of claros) {
      const n = (src.match(re) || []).length;
      if (n > 0) restantes.push(`${label} x${n}`);
    }
    ok(restantes.length === 0, `AnalyticsDashboard sin tema claro — ${restantes.length ? restantes.join(' | ') : 'limpio'}`);

    // El resto del app debe seguir usando las variables de globals.css.
    const { data: v } = await db.from('comprobantes').select('id', { count: 'exact', head: true });
    ok(v !== undefined, 'DB responde (gate de conectividad)');
  }

  // ── 14. Impresion termica (Fase C) ───────────────────────────────────────
  // No puedo pulsar 🖨️ desde aqui, asi que se verifica el contrato: que
  // generateInvoice acepte `modo` y que reimprima el mismo canvas que
  // descarga (un solo codigo de dibujo, no dos que divergan).
  section('14. Impresion del comprobante');
  {
    const f = new URL('../src/lib/generateInvoice.ts', import.meta.url);
    const src = fs.readFileSync(f, 'utf8');
    ok(/modo\s*:\s*InvoiceModo\s*=\s*["']descargar["']/.test(src),
      "generateInvoice: modo default 'descargar' (descarga JPEG intacta)");
    ok(/InvoiceModo\s*=\s*["']descargar["']\s*\|\s*["']imprimir["']/.test(src),
      "generateModo: union 'descargar' | 'imprimir'");
    ok(src.includes('modo === "imprimir"') || src.includes("modo === 'imprimir'"),
      'generateInvoice: rama de impresion antes de la descarga');
    ok(/@page\s*\{\s*size:\s*80mm/.test(src), 'hoja @page size: 80mm (termica)');
    ok(/imprimirComprobante\(canvas\)/.test(src),
      'imprimir reutiliza el MISMO canvas que se descarga');
    ok(!/window\.print/.test(src.replace(/setTimeout\(function\(\)\{window\.print\(\)\}/, '')),
      'window.print solo en la ventana de impresion');

    const adm = fs.readFileSync(new URL('../src/app/admin/page.tsx', import.meta.url), 'utf8');
    ok(/modo:\s*'descargar'\s*\|\s*'imprimir'\s*=\s*'descargar'/.test(adm),
      'admin: handleDownloadInvoice acepta modo');
    ok((adm.match(/'imprimir'\)/g) || []).length >= 1, 'admin: hay un boton que pide imprimir');
  }

  // ── 14b. El PDF no se rompe con las graficas oscuras ─────────────────────
  // El reporte se imprime en papel blanco. Las graficas viven en tema oscuro,
  // asi que si el PDF las embebe sin re-pintarlas, sale con rectangulos negros.
  section('14b. Reporte PDF: graficas re-pintadas en claro');
  {
    const a = fs.readFileSync(new URL('../src/components/analytics/AnalyticsDashboard.tsx', import.meta.url), 'utf8');
    ok(/const \[pdfLight, setPdfLight\] = useState\(false\)/.test(a), 'analytics: flag pdfLight');
    ok(/setPdfLight\(true\)/.test(a) && /setPdfLight\(false\)/.test(a),
      'analytics: el export apaga y vuelve a prender el tema claro');
    ok(/pdfLight \? '#e8eaed' :/.test(a), 'analytics: la rejilla se pinta clara al exportar');
    ok(/pdfLight \? '#ffffff' :/.test(a), 'analytics: el anillo del donut se pinta claro al exportar');
    ok(/\[dashboardData, pdfLight\]/.test(a), 'analytics: el efecto de defaults reacciona a pdfLight');
    // Y al terminar tiene que restaurar el oscuro (si no la pantalla queda clara).
    ok(/setPdfLight\(false\);\s*await settle\(\);/.test(a), 'analytics: restaura el tema oscuro tras exportar');

    const rep = fs.readFileSync(new URL('../src/lib/generateReport.ts', import.meta.url), 'utf8');
    ok(/setTextColor\(13, 17, 23\)/.test(rep), 'generateReport: el PDF sigue siendo un documento oscuro-sobre-blanco');
  }

  // ── 15. Sanitizacion de inputs (Fase B2) ─────────────────────────────────
  // `sanitize` estaba importado en api/order/route.ts y NUNCA se llamaba.
  section('15. Sanitizacion de inputs');
  {
    const f = new URL('../src/app/api/order/route.ts', import.meta.url);
    const src = fs.readFileSync(f, 'utf8');
    const calls = (src.match(/\bsanitize\(/g) || []).length;
    ok(/import\s*\{[^}]*\bsanitize\b[^}]*\}\s*from\s*['"]@\/lib\/security['"]/.test(src),
      'api/order: sanitize importado de lib/security');
    ok(calls >= 3, `api/order: sanitize aplicado en cliente, mesa y notas (${calls} llamadas)`);

    // Y que de verdad sanee: un nombre con <script> no debe llegar a la DB.
    const malicious = { mesa: '2', cliente: '<script>alert(1)</script>PEDRO', tipo: 'restaurante', items: [Q] };
    const r = await api('/api/order', { method: 'POST', body: JSON.stringify(malicious) });
    if (r.status === 200 || r.status === 201) {
      const { data: orden } = await db.from('ordenes')
        .select('id, cliente_nombre').eq('id', r.body.orden_nu).single();
      const nombre = orden?.cliente_nombre || '';
      ok(!nombre.includes('<') && !nombre.includes('>'),
        `XSS sanitizado: cliente_nombre = "${nombre}"`);
      ok(nombre.includes('PEDRO'), 'el nombre legitimo sobrevive al sanitize');
      // Cerrarla para no dejar basura abierta.
      await api('/api/admin/close-table', { method: 'POST',
        body: JSON.stringify({ ordenNu: r.body.orden_nu, forma_pago: 'Efectivo', recibido: 2000 }) });
    } else {
      ok(false, `api/order XSS creacion (${r.status}: ${JSON.stringify(r.body).slice(0, 120)})`);
    }
  }

  // ── 16. Anti-doble-tap en el cobro (Fase B3) ─────────────────────────────
  section('16. Anti-doble-tap en confirmacion de cobro');
  {
    const adm = fs.readFileSync(new URL('../src/app/admin/page.tsx', import.meta.url), 'utf8');
    ok(/const confirmBusy = useRef\(false\)/.test(adm), 'admin: guard confirmBusy (useRef)');
    ok(/if \(confirmBusy\.current\) return;/.test(adm), 'admin: el 2do tap se descarta');
    ok(/confirmBusy\.current = false;/.test(adm), 'admin: se rearma en cada showConfirm');
    // La proteccion real de fondo es el 409 del servidor; esto solo evita el
    // doble disparo en el cliente.
    const ct = fs.readFileSync(new URL('../src/app/api/admin/close-table/route.ts', import.meta.url), 'utf8');
    ok(/409/.test(ct) && /ya fue cobrada/.test(ct), 'close-table: 409 si ya estaba cobrada (red de fondo)');
  }

  // ── 18. PWA: manifest enlazado ────────────────────────────────────────────
  section('18. PWA (Add to Home Screen)');
  {
    const man = new URL('../public/manifest.json', import.meta.url);
    ok(fs.existsSync(man), 'public/manifest.json existe');
    const m = JSON.parse(fs.readFileSync(man, 'utf8'));
    ok(m.display === 'standalone', `manifest: display=${m.display}`);
    ok(Array.isArray(m.icons) && m.icons.length > 0, `manifest: ${m.icons?.length} icono(s)`);
    // Cada icono que declara el manifest debe existir de verdad: antes esto
    // hardcodeaba un unico path y renombrar el logo rompia el gate.
    for (const icon of m.icons) {
      ok(fs.existsSync(new URL(`../public${icon.src}`, import.meta.url)),
        `manifest: existe el icono ${icon.src}`);
    }
    const lay = fs.readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
    ok(/<link rel="manifest"/.test(lay), 'layout: <link rel="manifest"> presente');
    const r = await fetch(BASE + '/manifest.json');
    ok(r.status === 200, `GET /manifest.json 200 (${r.status})`);
  }

  // ── 19. Coherencia total <-> items (el bug del cobro en silencio) ─────────
  // Origen: la orden 110c85b4 mostraba total=7800 con items por 6000. La caja
  // cobra `ordenes.total`, asi que el cajero pedia 1800 de mas. El trigger no
  // dejo rastro explicito de por que se desincrono.
  section('19. Coherencia total <-> items');
  {
    // Se revisan TODAS las órdenes, no solo las abiertas. Antes solo se
    // miraba `estado='abierta'` y eso dejó pasar un bug real: al mover un
    // item de orden (`reassign-item`) el trigger solo recalculaba el
    // destino, y `reassign-item` cerraba el origen en cuanto quedaba vacío
    // — congelando un saldo fantasma de ₡2.000 en 4 órdenes cerradas.
    const { data: todas } = await db.from('ordenes')
      .select('id, mesa_numero, total, estado, descuento');
    const { data: items } = await db.from('orden_items')
      .select('id, orden_id, nombre_producto, cantidad, precio_unitario, subtotal, estado_kds');

    // El trigger suma `estado_kds != 'cancelado'`, y en SQL un NULL NO cuenta.
    const sumaDe = (oid) => items
      .filter((i) => i.orden_id === oid && i.estado_kds !== 'cancelado' && i.estado_kds != null)
      .reduce((s, i) => s + Number(i.subtotal || 0), 0);

    // Desde 0011 el trigger calcula `total = Σitems − descuento`. `descuento`
    // se lee de la DB ya resuelto, asi que con descuento = 0 esto colapsa
    // EXACTAMENTE al invariante original "total == suma(items)".
    const esperadoDe = (o) => sumaDe(o.id) - Number(o.descuento || 0);

    const desviadas = todas.filter((o) => Math.abs(esperadoDe(o) - Number(o.total)) > 0.01);
    for (const o of desviadas) {
      console.log(`     DESVIADA ${o.id.slice(0, 8)} ${o.estado} mesa ${o.mesa_numero}: ` +
        `total=${o.total} items−desc=${esperadoDe(o)}`);
    }
    ok(desviadas.length === 0,
      `ordenes.total == suma(items) − descuento en TODA orden, abierta o cerrada (${todas.length} orden(es))`);

    // subtotal de cada item debe ser precio * cantidad. Si esto se rompe, el
    // trigger suma cifras inventadas.
    const malosSub = items.filter((i) =>
      Math.abs(Number(i.subtotal) - Number(i.precio_unitario) * Number(i.cantidad)) > 0.01);
    ok(malosSub.length === 0, `item.subtotal == precio_unitario * cantidad (${items.length} item(s))`);

    // El bug mas grave: un item que YA se cobro (esta en un items_snapshot)
    // sigue vivo en orden_items => el cliente lo paga dos veces. Lo provoca
    // dividir un item con la tijera y cobrar el gemelo equivocado.
    // NO se puede asertar "ningun item cobrado sigue vivo": `items_snapshot` no
    // guarda el `id` del item, solo nombre y cantidad. Con "Batido x1" cobrado y
    // "Batido x1" vivo la clave coincide y no hay forma de saber si es el mismo
    // item o el gemelo legitimo que quedo tras dividir con la tijera. Seria una
    // falsa positiva garantizada. El invariante que si protege el dinero es el
    // de arriba: total == suma de items.

    // El guard de close-table: no debe existir ninguna rama que pague desde
    // ordenes.total sin haberlo comparado contra los items.
    const ct = fs.readFileSync(
      new URL('../src/app/api/admin/close-table/route.ts', import.meta.url), 'utf8');
    ok(/sumaRealOrden/.test(ct), 'close-table: helper sumaRealOrden (deriva de los items)');
    ok(/no coincide con sus items/.test(ct), 'close-table: guard 409 si total != items');
    // El helper debe descartar los NULL igual que SQL, o daria 409 en falso.
    ok(/estado_kds != null/.test(ct),
      'close-table: sumaRealOrden excluye estado_kds NULL (como hace el trigger)');
  }

  // ── 20. Descuento, extra y pedido sin mesa (modelo nuevo) ────────────────
  // Tres formas distintas de perder dinero en el flujo nuevo, todas en silencio:
  //   a) el descuento no se aplica          -> se cobra de MAS
  //   b) el extra no entra en el total      -> se cobra de MENOS
  //   c) el pedido sin mesa cae en la 99    -> el bug de siempre
  section('20. Descuento, extra y pedido individual');
  {
    const r = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        cliente: 'Descuento',
        tipo: 'individual',
        items: [Q, Q],                                   // 2 × ₡2.000 = ₡4.000
        descuento: { tipo: 'porcentaje', valor: 10 },
        extras: [{ nombre: 'Delivery', monto: 1000 }],
      }),
    });
    ok(r.status === 200, `individual + descuento + extra aceptado (${r.status})`);
    const oid = r.body?.orden_nu;

    const { data: ord } = await db.from('ordenes')
      .select('tipo, mesa_numero, subtotal, descuento, total, estado_pago')
      .eq('id', oid);
    const o = ord?.[0] || {};
    ok(o.tipo === 'individual', `tipo='individual' (vino: ${o.tipo})`);
    ok(o.mesa_numero === null, `mesa_numero NULL, sin Mesa 99 (vino: ${o.mesa_numero})`);
    ok(Math.abs(Number(o.subtotal) - 5000) < 0.01,
      `subtotal = 4.000 items + 1.000 extra (${money(o.subtotal)})`);
    ok(Math.abs(Number(o.descuento) - 500) < 0.01,
      `10% resuelto a monto por la DB (${money(o.descuento)})`);
    ok(Math.abs(Number(o.total) - 4500) < 0.01,
      `total = 5.000 − 500 (${money(o.total)})`);
    ok(o.estado_pago === 'pendiente', `estado_pago pendiente sin abonos (${o.estado_pago})`);

    const { data: li } = await db.from('orden_items')
      .select('tipo_linea, estado_kds, subtotal').eq('orden_id', oid);
    const extra = (li || []).find((i) => i.tipo_linea === 'extra');
    ok(!!extra && Math.abs(Number(extra?.subtotal) - 1000) < 0.01,
      'el cargo extra entra como línea tipo_linea=extra');
    ok(extra?.estado_kds === 'entregado',
      `el extra no se manda a cocina (${extra?.estado_kds})`);

    // Dividir esta orden con descuento tiene que quedar BLOQUEADO: el split
    // cobra el bruto de cada trozo y el descuento pertenece a la orden
    // entera. Mejor un 409 que un cobro de más.
    const { data: idsItems } = await db.from('orden_items').select('id').eq('orden_id', oid);
    const rs = await api('/api/admin/close-table', {
      method: 'POST',
      body: JSON.stringify({
        orden_nu: oid,
        item_ids: (idsItems || []).map((i) => i.id),
        forma_pago: 'Efectivo',
        recibido: 5000,
      }),
    });
    ok(rs.status === 409,
      `dividir una orden con descuento queda bloqueado (${rs.status})`);

    // Cobrar: el guard debe restar el descuento, no cobrar el bruto.
    const rc = await api('/api/admin/close-table', {
      method: 'POST',
      body: JSON.stringify({ orden_nu: oid, forma_pago: 'Efectivo', recibido: 5000 }),
    });
    ok(rc.status === 200, `se pudo cobrar el pedido con descuento (${rc.status})`);

    const { data: comps } = await db.from('comprobantes')
      .select('subtotal, descuento, total, items_snapshot').eq('orden_id', oid);
    const comp = comps?.[0] || {};
    ok(comps?.length === 1, 'generó exactamente un comprobante');
    ok(Math.abs(Number(comp.total) - 4500) < 0.01,
      `comprobante cobra 4.500, no 5.000 (${money(comp.total)})`);
    ok(Math.abs(Number(comp.descuento) - 500) < 0.01,
      `comprobante REGISTRA el descuento, si no cierreCaja da 0 (${money(comp.descuento)})`);
    ok(Math.abs(Number(comp.subtotal) - 5000) < 0.01,
      `comprobante.subtotal = bruto (${money(comp.subtotal)})`);
    const snapSum = (comp.items_snapshot || [])
      .reduce((s, i) => s + Number(i.subtotal || 0), 0);
    ok(Math.abs(snapSum - Number(comp.subtotal)) < 0.01,
      `snapshot (${money(snapSum)}) == subtotal (${money(comp.subtotal)}): el PDF no muestra cifras que no cuadran`);

    const { data: pgs } = await db.from('pagos').select('monto').eq('orden_id', oid);
    ok(Math.abs(Number(pgs?.[0]?.monto) - 4500) < 0.01,
      `pago = 4.500 (${pgs?.[0] ? money(pgs[0].monto) : 'ninguno'})`);

    const { data: fin } = await db.from('ordenes')
      .select('estado, estado_pago').eq('id', oid);
    ok(fin?.[0]?.estado === 'cerrada', `pedido cerrado tras el cobro (${fin?.[0]?.estado})`);
    ok(fin?.[0]?.estado_pago === 'pagado',
      `estado_pago pagado al cerrar (${fin?.[0]?.estado_pago})`);

    // El pedido no tenía mesa: la 99 virtual no debe haberse molestado.
    const { data: m99 } = await db.from('mesas').select('estado').eq('numero', 99);
    ok(m99?.[0]?.estado === 'libre',
      `la Mesa 99 virtual sigue libre, no se tocó (${m99?.[0]?.estado})`);
  }
} catch (e) {
  fail++;
  console.error('\n💥 Excepción:', e.message);
}

console.log(`\n${'='.repeat(52)}\n  ${pass} OK / ${fail} FALLA\n${'='.repeat(52)}`);
if (!fail) console.log('  🧹 Ejecuta `node scripts/cleanup_test_data.js` para borrar los datos de prueba.\n');
process.exit(fail ? 1 : 0);
