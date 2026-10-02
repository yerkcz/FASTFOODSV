// ══════════════════════════════════════════════════════════════════════════
// demoStats.ts — Datos de demostración del panel de Estadísticas.
//
// La cliente pide (docs/Delissia/PeticionCliente.txt) ver en Stats los
// módulos combinados: ventas, pedidos, balances, gastos del negocio,
// insumos y finanzas personales. Esas tablas todavía NO existen en la BD,
// así que este módulo genera un dataset simulado para enseñarle al cliente
// cómo se vería todo junto.
//
// · Determinista: la semilla sale de la FECHA, no de Math.random(). Los
//   números no cambian al cambiar de filtro ni al re-renderizar.
// · 366 días hacia atrás en zona America/Costa_Rica, para que los filtros
//   hoy/semana/mes/año/todo tengan datos siempre.
// · Los precios salen del menú real (migración 0012_menu_delissia.sql) y
//   YA INCLUYEN IVA: no se desglosa IVA ni se cobra servicio del 10%.
// ══════════════════════════════════════════════════════════════════════════

export type Periodo = 'hoy' | 'semana' | 'mes' | 'año' | 'todo';
export type Granularidad = 'dia' | 'semana' | 'mes';
export type EstadoPago = 'pagado' | 'parcial' | 'pendiente';

export type ItemVenta = { producto: string; categoria: string; cantidad: number; precio: number };

export type VentaDemo = {
  id: number;
  fecha: string;          // YYYY-MM-DD (CR)
  cliente: string;
  canal: 'Pedido individual' | 'Catering';
  items: ItemVenta[];
  total: number;
  estado: EstadoPago;
  metodo: 'Efectivo' | 'SINPE' | 'Tarjeta';
  abono: number;          // 50% del total cuando estado = 'parcial'
  saldo: number;          // lo que falta por cobrar
};

export type GastoDemo = { fecha: string; categoria: string; concepto: string; monto: number };
export type InsumoMovDemo = {
  fecha: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  costo: number;          // valor en colones de esa cantidad
  tipo: 'compra' | 'uso';
};
export type GastoPersonalDemo = { fecha: string; categoria: string; concepto: string; monto: number };
export type IngresoPersonalDemo = { fecha: string; concepto: string; monto: number };

export type DatasetDemo = {
  ventas: VentaDemo[];
  gastos: GastoDemo[];
  insumos: InsumoMovDemo[];
  gastosPersonales: GastoPersonalDemo[];
  ingresosPersonales: IngresoPersonalDemo[];
  dias: string[];         // todas las fechas generadas, de la más vieja a hoy
};

// ─── Catálogo (menú real de la cliente, precios con IVA incluido) ─────────
const CATALOGO: { producto: string; categoria: string; precio: number; peso: number }[] = [
  { producto: 'Chorreadas con natilla', categoria: 'Típicos', precio: 2000, peso: 14 },
  { producto: 'Tortilla aliñada con natilla', categoria: 'Típicos', precio: 2000, peso: 12 },
  { producto: 'Tortilla aliñada', categoria: 'Típicos', precio: 1500, peso: 9 },
  { producto: 'Chorreada de maíz', categoria: 'Típicos', precio: 1500, peso: 7 },
  { producto: 'Deli burguer', categoria: 'Deli', precio: 5490, peso: 13 },
  { producto: 'Deli Empanada', categoria: 'Deli', precio: 2500, peso: 8 },
  { producto: 'Deli Loaded Fries', categoria: 'Deli', precio: 3500, peso: 7 },
  { producto: 'Deli Arepas Platano Maduro', categoria: 'Deli', precio: 2500, peso: 6 },
  { producto: 'DeliBurrito de pollo', categoria: 'Deli', precio: 3500, peso: 6 },
  { producto: 'Deliburrito Desayuno', categoria: 'Deli', precio: 2500, peso: 5 },
  { producto: 'Deliwrap Crunch', categoria: 'Deli', precio: 3500, peso: 5 },
  { producto: 'Deli Taco', categoria: 'Deli', precio: 3500, peso: 5 },
  { producto: 'Deli Chicken Tenders', categoria: 'Deli', precio: 3500, peso: 5 },
  { producto: 'Café con Leche', categoria: 'Bebidas', precio: 1400, peso: 6 },
  { producto: 'Café Negro', categoria: 'Bebidas', precio: 1200, peso: 4 },
  { producto: 'Coca Cola 600ml', categoria: 'Gaseosas', precio: 1000, peso: 5 },
  { producto: 'Agua en botella', categoria: 'Agua y Otros', precio: 900, peso: 3 },
];

const CLIENTES: { nombre: string; peso: number; catering?: boolean }[] = [
  { nombre: 'María Fernández', peso: 10 },
  { nombre: 'Juan Carlos Vargas', peso: 9 },
  { nombre: 'Alexandra Rodríguez', peso: 8 },
  { nombre: 'Diego Sánchez', peso: 8 },
  { nombre: 'Karla Villalobos', peso: 7 },
  { nombre: 'Esteban Quesada', peso: 7 },
  { nombre: 'Patricia Mora', peso: 6 },
  { nombre: 'Jorge Luis Castillo', peso: 6 },
  { nombre: 'Andrea Chacón', peso: 6 },
  { nombre: 'Rodrigo Solano', peso: 5 },
  { nombre: 'Sofía Arce', peso: 5 },
  { nombre: 'Mauricio Amador', peso: 4 },
  { nombre: 'Brenda Cubero', peso: 4 },
  { nombre: 'Daniel Torres', peso: 4 },
  { nombre: 'Gabriela Sequeira', peso: 3 },
  { nombre: 'Luis Diego Madrigal', peso: 3 },
  { nombre: 'Comedor Escuela San Rafael', peso: 3, catering: true },
  { nombre: 'Catering Iglesia Vida', peso: 2, catering: true },
  { nombre: 'Oficinas Zafiro S.A.', peso: 2, catering: true },
  { nombre: 'Boda Familia Araya', peso: 1, catering: true },
];

export const CATEGORIAS_GASTO = ['Alquiler', 'Luz y Agua', 'Salarios', 'Insumos', 'Transporte', 'Mantenimiento', 'Otros'] as const;
export const CATEGORIAS_PERSONAL = ['Casa', 'Supermercado', 'Colegio', 'Transporte', 'Salud', 'Otros'] as const;

const INSUMOS_CATALOGO: { nombre: string; unidad: string; costo: number; factor: number }[] = [
  { nombre: 'Harina de trigo', unidad: 'kg', costo: 900, factor: 0.14 },
  { nombre: 'Pollo (entero)', unidad: 'kg', costo: 3200, factor: 0.22 },
  { nombre: 'Carne molida', unidad: 'kg', costo: 4500, factor: 0.16 },
  { nombre: 'Queso rallado', unidad: 'kg', costo: 5200, factor: 0.12 },
  { nombre: 'Plátano maduro', unidad: 'kg', costo: 1100, factor: 0.18 },
  { nombre: 'Aceite vegetal', unidad: 'litro', costo: 2600, factor: 0.08 },
  { nombre: 'Gaseosas (cajas)', unidad: 'caja', costo: 9500, factor: 0.06 },
  { nombre: 'Envases para llevar', unidad: 'paquete', costo: 7800, factor: 0.10 },
  { nombre: 'Papas congeladas', unidad: 'kg', costo: 2900, factor: 0.12 },
  { nombre: 'Café en grano', unidad: 'kg', costo: 8400, factor: 0.05 },
  { nombre: 'Leche', unidad: 'litro', costo: 950, factor: 0.15 },
  { nombre: 'Servilletas y cubiertos', unidad: 'paquete', costo: 3400, factor: 0.07 },
];

const TOTAL_DIAS = 366;
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ─── Fechas (zona Costa Rica) ─────────────────────────────────────────────
export function hoyCR(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function d(fecha: string): Date {
  return new Date(`${fecha}T12:00:00Z`);
}

function sumaDias(fecha: string, n: number): string {
  const x = d(fecha);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function diaSemana(fecha: string): number {
  return d(fecha).getUTCDay();
}

function esUltimoDiaMes(fecha: string): boolean {
  return sumaDias(fecha, 1).slice(0, 7) !== fecha.slice(0, 7);
}

// ─── Filtros por período (los mismos chips que el resto del panel) ───────
export function rangoPeriodo(periodo: Periodo): { inicio: string; fin: string } {
  const hoy = hoyCR();
  switch (periodo) {
    case 'hoy': return { inicio: hoy, fin: hoy };
    case 'semana': return { inicio: sumaDias(hoy, -diaSemana(hoy)), fin: hoy };
    case 'mes': return { inicio: `${hoy.slice(0, 8)}01`, fin: hoy };
    case 'año': return { inicio: `${hoy.slice(0, 5)}01-01`, fin: hoy };
    // "Todo" = todo el histórico simulado (366 días), no todo calendario.
    default: return { inicio: sumaDias(hoy, -(TOTAL_DIAS + 1)), fin: hoy };
  }
}

/** Devuelve un predicado listo para `array.filter(porPeriodo('mes'))`. */
export function porPeriodo(periodo: Periodo): (r: { fecha: string }) => boolean {
  const { inicio, fin } = rangoPeriodo(periodo);
  return (r) => r.fecha >= inicio && r.fecha <= fin;
}

export function diasDelPeriodo(periodo: Periodo): string[] {
  const { inicio, fin } = rangoPeriodo(periodo);
  const out: string[] = [];
  let cur = inicio;
  let guard = 0;
  while (cur <= fin && guard < 800) {
    out.push(cur);
    cur = sumaDias(cur, 1);
    guard++;
  }
  return out;
}

// ─── Generador determinista ───────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function semilla(txt: string): number {
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) {
    h ^= txt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function elegir<T>(lista: readonly T[], pesos: readonly number[], rnd: () => number): T {
  const total = pesos.reduce((s, p) => s + p, 0);
  let r = rnd() * total;
  for (let i = 0; i < lista.length; i++) {
    r -= pesos[i];
    if (r <= 0) return lista[i];
  }
  return lista[lista.length - 1];
}

function entre(min: number, max: number, rnd: () => number): number {
  return Math.round(min + rnd() * (max - min));
}

/** Cantidad con 1 decimal (los insumos se pesan en kg/litros). */
function decimales(n: number): number {
  return Math.round(n * 10) / 10;
}

function generar(): DatasetDemo {
  const hoy = hoyCR();
  const ventas: VentaDemo[] = [];
  const gastos: GastoDemo[] = [];
  const insumos: InsumoMovDemo[] = [];
  const gastosPersonales: GastoPersonalDemo[] = [];
  const ingresosPersonales: IngresoPersonalDemo[] = [];
  const dias: string[] = [];

  const pesosCatalogo = CATALOGO.map((c) => c.peso);
  const pesosClientes = CLIENTES.map((c) => c.peso);
  const indicesClientes = CLIENTES.map((_, k) => k);

  let id = 1000;

  for (let i = TOTAL_DIAS - 1; i >= 0; i--) {
    const fecha = sumaDias(hoy, -i);
    dias.push(fecha);
    const dow = diaSemana(fecha);
    const progreso = (TOTAL_DIAS - i) / TOTAL_DIAS; // 0 → 1 (crecimiento del negocio)
    const dia = Number(fecha.slice(8, 10));

    // ── 1. VENTAS / PEDIDOS ────────────────────────────────────────────
    const rv = mulberry32(semilla(`v${fecha}`));
    const base = dow === 0 ? 6 : dow === 6 ? 13 : 9;
    const nPedidos = Math.max(3, Math.round(base * (0.75 + 0.5 * rv()) * (0.8 + 0.5 * progreso)));

    for (let p = 0; p < nPedidos; p++) {
      const clienteIdx = elegir(indicesClientes, pesosClientes, rv);
      const cliente = CLIENTES[clienteIdx];
      const nItems = rv() < 0.58 ? 1 : rv() < 0.83 ? 2 : rv() < 0.95 ? 3 : 4;

      const items: ItemVenta[] = [];
      for (let k = 0; k < nItems; k++) {
        const prod = elegir(CATALOGO, pesosCatalogo, rv);
        if (items.some((it) => it.producto === prod.producto)) continue;
        items.push({
          producto: prod.producto,
          categoria: prod.categoria,
          cantidad: rv() < 0.86 ? 1 : 2,
          precio: prod.precio,
        });
      }
      // Por las dudas: nunca un pedido vacío.
      if (items.length === 0) {
        const p0 = CATALOGO[0];
        items.push({ producto: p0.producto, categoria: p0.categoria, cantidad: 1, precio: p0.precio });
      }

      const total = items.reduce((s, it) => s + it.cantidad * it.precio, 0);
      const reciente = fecha >= sumaDias(hoy, -21);

      let estado: EstadoPago;
      const re = rv();
      if (reciente) estado = re < 0.78 ? 'pagado' : re < 0.93 ? 'parcial' : 'pendiente';
      else estado = re < 0.985 ? 'pagado' : 'parcial';

      const abono = estado === 'pagado' ? total : estado === 'parcial' ? Math.round(total * 0.5) : 0;
      const rm = rv();
      const metodo: VentaDemo['metodo'] = rm < 0.55 ? 'Efectivo' : rm < 0.85 ? 'SINPE' : 'Tarjeta';

      ventas.push({
        id: id++,
        fecha,
        cliente: cliente.nombre,
        canal: cliente.catering ? 'Catering' : 'Pedido individual',
        items,
        total,
        estado,
        metodo,
        abono,
        saldo: total - abono,
      });
    }

    // ── 2. INSUMOS (uso diario + compras cada 4 días) ──────────────────
    const rg = mulberry32(semilla(`g${fecha}`));
    const rc = mulberry32(semilla(`c${fecha}`));
    const muestras = 4 + Math.floor(rg() * 5); // 4..8 insumos tocados hoy
    const usados = new Set<number>();
    for (let k = 0; k < muestras; k++) usados.add(Math.floor(rg() * INSUMOS_CATALOGO.length));

    // Compra cada 4 días: 4..6 insumos en volumen, para que el stock nunca
    // quede en negativo (se compra bastante más de lo que se consume).
    const haceCompra = dia % 4 === 1;
    const aComprar = new Set<number>();
    if (haceCompra) {
      const nCompras = 4 + Math.floor(rc() * 3);
      while (aComprar.size < nCompras) aComprar.add(Math.floor(rc() * INSUMOS_CATALOGO.length));
    }

    let costoComprasHoy = 0;

    usados.forEach((idx) => {
      const ins = INSUMOS_CATALOGO[idx];
      const cantidad = decimales(Math.max(0.2, nPedidos * ins.factor * (0.7 + 0.6 * rg())));
      insumos.push({
        fecha, nombre: ins.nombre, unidad: ins.unidad,
        cantidad, costo: Math.round(cantidad * ins.costo), tipo: 'uso',
      });
      if (aComprar.has(idx)) {
        const comprado = 30 + Math.round(rc() * 60);
        const costo = comprado * ins.costo;
        costoComprasHoy += costo;
        insumos.push({
          fecha, nombre: ins.nombre, unidad: ins.unidad,
          cantidad: comprado, costo, tipo: 'compra',
        });
      }
    });

    if (haceCompra && costoComprasHoy > 0) {
      gastos.push({ fecha, categoria: 'Insumos', concepto: 'Compra de insumos y materia prima', monto: costoComprasHoy });
    }

    // ── 3. GASTOS DEL NEGOCIO ──────────────────────────────────────────
    if (dia === 1) gastos.push({ fecha, categoria: 'Alquiler', concepto: 'Alquiler del local', monto: 265000 });
    if (dia === 8) gastos.push({ fecha, categoria: 'Luz y Agua', concepto: 'Planilla ICE + AyA', monto: entre(78000, 104000, rg) });
    if (dia === 15 || esUltimoDiaMes(fecha)) {
      gastos.push({ fecha, categoria: 'Salarios', concepto: 'Quincena de empleados', monto: entre(185000, 215000, rg) });
    }
    if (rg() < 0.62) {
      gastos.push({ fecha, categoria: 'Transporte', concepto: 'Combustible y reparto', monto: entre(5500, 14500, rg) });
    }
    if (dia % 12 === 4) {
      gastos.push({ fecha, categoria: 'Mantenimiento', concepto: 'Mantenimiento de equipos', monto: entre(15000, 68000, rg) });
    }
    if (rg() < 0.3) {
      gastos.push({ fecha, categoria: 'Otros', concepto: 'Aseo y gastos varios', monto: entre(3000, 12000, rg) });
    }

    // ── 4. FINANZAS PERSONALES ─────────────────────────────────────────
    const rp = mulberry32(semilla(`p${fecha}`));
    if (rp() < 0.5) gastosPersonales.push({ fecha, categoria: 'Casa', concepto: 'Gastos de la casa', monto: entre(3000, 12000, rp) });
    if ((dow === 0 || dow === 3) && rp() < 0.6) {
      gastosPersonales.push({ fecha, categoria: 'Supermercado', concepto: 'Supermercado de la casa', monto: entre(17000, 43000, rp) });
    }
    if (dia === 5) gastosPersonales.push({ fecha, categoria: 'Colegio', concepto: 'Cuota y útiles del colegio', monto: entre(42000, 58000, rp) });
    if (rp() < 0.7) gastosPersonales.push({ fecha, categoria: 'Transporte', concepto: 'Transporte diario', monto: entre(1500, 6000, rp) });
    if (dia % 21 === 7) gastosPersonales.push({ fecha, categoria: 'Salud', concepto: 'Farmacia y consultas', monto: entre(8000, 26000, rp) });
    if (rp() < 0.32) gastosPersonales.push({ fecha, categoria: 'Otros', concepto: 'Otros gastos personales', monto: entre(2000, 9000, rp) });

    if (dia === 15) {
      ingresosPersonales.push({ fecha, concepto: 'Pensión por los hijos', monto: 132000 });
    }
    if (dia === 25 && rp() < 0.55) {
      ingresosPersonales.push({ fecha, concepto: 'Trabajo independiente', monto: entre(45000, 90000, rp) });
    }
  }

  return { ventas, gastos, insumos, gastosPersonales, ingresosPersonales, dias };
}

let cache: DatasetDemo | null = null;

export function getDataset(): DatasetDemo {
  if (!cache) cache = generar();
  return cache;
}

// ─── Agregaciones (todas puras y memoizables con useMemo en la UI) ────────
export function cobrado(v: VentaDemo): number {
  return v.estado === 'pagado' ? v.total : v.estado === 'parcial' ? v.abono : 0;
}

export type ResumenVentas = {
  total: number;
  pedidos: number;
  ticket: number;
  cobrado: number;
  porCobrar: number;
  porEstado: { pagado: number; parcial: number; pendiente: number };
  montoEstado: { pagado: number; parcial: number; pendiente: number };
  metodos: { metodo: string; monto: number }[];
};

export function resumenVentas(ventas: VentaDemo[]): ResumenVentas {
  const r: ResumenVentas = {
    total: 0, pedidos: ventas.length, ticket: 0, cobrado: 0, porCobrar: 0,
    porEstado: { pagado: 0, parcial: 0, pendiente: 0 },
    montoEstado: { pagado: 0, parcial: 0, pendiente: 0 },
    metodos: [],
  };
  const metodos = new Map<string, number>();
  for (const v of ventas) {
    r.total += v.total;
    r.porEstado[v.estado]++;
    r.montoEstado[v.estado] += v.total;
    r.cobrado += cobrado(v);
    metodos.set(v.metodo, (metodos.get(v.metodo) || 0) + v.total);
  }
  r.porCobrar = r.total - r.cobrado;
  r.ticket = r.pedidos > 0 ? r.total / r.pedidos : 0;
  r.metodos = Array.from(metodos, ([metodo, monto]) => ({ metodo, monto })).sort((a, b) => b.monto - a.monto);
  return r;
}

export type ClienteStat = { cliente: string; pedidos: number; total: number; porCobrar: number; ultimo: string };

export function topClientes(ventas: VentaDemo[], limite = 8): ClienteStat[] {
  const mapa = new Map<string, ClienteStat>();
  for (const v of ventas) {
    const c = mapa.get(v.cliente) || { cliente: v.cliente, pedidos: 0, total: 0, porCobrar: 0, ultimo: v.fecha };
    c.pedidos++;
    c.total += v.total;
    c.porCobrar += v.saldo;
    if (v.fecha > c.ultimo) c.ultimo = v.fecha;
    mapa.set(v.cliente, c);
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total).slice(0, limite);
}

export type ProductoStat = { producto: string; categoria: string; unidades: number; ingresos: number };

export function topProductos(ventas: VentaDemo[], limite = 8): ProductoStat[] {
  const mapa = new Map<string, ProductoStat>();
  for (const v of ventas) {
    for (const it of v.items) {
      const p = mapa.get(it.producto) || { producto: it.producto, categoria: it.categoria, unidades: 0, ingresos: 0 };
      p.unidades += it.cantidad;
      p.ingresos += it.cantidad * it.precio;
      mapa.set(it.producto, p);
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.ingresos - a.ingresos).slice(0, limite);
}

export type GastoStat = { categoria: string; monto: number; pct: number };

export function resumenGastos(gastos: GastoDemo[]): { total: number; categorias: GastoStat[] } {
  const mapa = new Map<string, number>();
  let total = 0;
  for (const g of gastos) {
    mapa.set(g.categoria, (mapa.get(g.categoria) || 0) + g.monto);
    total += g.monto;
  }
  const categorias = CATEGORIAS_GASTO
    .map((c) => ({ categoria: c as string, monto: mapa.get(c) || 0, pct: 0 }))
    .filter((c) => c.monto > 0)
    .sort((a, b) => b.monto - a.monto);
  for (const c of categorias) c.pct = total > 0 ? (c.monto / total) * 100 : 0;
  return { total, categorias };
}

export type InsumoStat = { nombre: string; unidad: string; comprado: number; usado: number; costo: number };

export function resumenInsumos(movs: InsumoMovDemo[]): InsumoStat[] {
  const mapa = new Map<string, InsumoStat>();
  for (const m of movs) {
    const key = m.nombre;
    const s = mapa.get(key) || { nombre: m.nombre, unidad: m.unidad, comprado: 0, usado: 0, costo: 0 };
    if (m.tipo === 'compra') {
      s.comprado += m.cantidad;
      s.costo += m.costo;
    } else {
      s.usado += m.cantidad;
    }
    mapa.set(key, s);
  }
  return Array.from(mapa.values()).sort((a, b) => b.costo - a.costo);
}

/** Stock real = comprado − usado sobre TODA la historia (no solo el filtro). */
export function stockInsumos(movs: InsumoMovDemo[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const m of movs) {
    mapa[m.nombre] = (mapa[m.nombre] || 0) + (m.tipo === 'compra' ? m.cantidad : -m.cantidad);
  }
  return mapa;
}

export type GastoPersonalStat = { categoria: string; monto: number; pct: number };

export function resumenPersonal(gastos: GastoPersonalDemo[]): { total: number; categorias: GastoPersonalStat[] } {
  const mapa = new Map<string, number>();
  let total = 0;
  for (const g of gastos) {
    mapa.set(g.categoria, (mapa.get(g.categoria) || 0) + g.monto);
    total += g.monto;
  }
  const categorias = CATEGORIAS_PERSONAL
    .map((c) => ({ categoria: c as string, monto: mapa.get(c) || 0, pct: 0 }))
    .filter((c) => c.monto > 0)
    .sort((a, b) => b.monto - a.monto);
  for (const c of categorias) c.pct = total > 0 ? (c.monto / total) * 100 : 0;
  return { total, categorias };
}

// ─── Series temporales ────────────────────────────────────────────────────
export type PuntoSerie = { label: string; fecha: string; total: number; pedidos: number };

let anioActual: string | null = null;

function etiquetaFecha(fecha: string): string {
  if (!anioActual) anioActual = hoyCR().slice(0, 4);
  const [y, m, dd] = fecha.split('-');
  return `${Number(dd)} ${MESES_CORTOS[Number(m) - 1]}${y !== anioActual ? ` ${y.slice(2)}` : ''}`;
}

function claveSemana(fecha: string): string {
  return sumaDias(fecha, -diaSemana(fecha));
}

function claveMes(fecha: string): string {
  return fecha.slice(0, 7);
}

function etiquetaMes(clave: string): string {
  const [y, m] = clave.split('-');
  return `${MESES_CORTOS[Number(m) - 1]} ${y.slice(2)}`;
}

/**
 * Ventas por período. Elige solo: día si hay ≤45 fechas, semana si ≤200,
 * mes en el resto — para que la gráfica nunca salga con 366 puntos.
 */
export function serieVentas(ventas: VentaDemo[], periodo: Periodo): PuntoSerie[] {
  const dias = diasDelPeriodo(periodo);
  const modo: 'dia' | 'semana' | 'mes' = dias.length <= 45 ? 'dia' : dias.length <= 200 ? 'semana' : 'mes';
  const mapa = new Map<string, PuntoSerie>();

  for (const fecha of dias) {
    const clave = modo === 'dia' ? fecha : modo === 'semana' ? claveSemana(fecha) : claveMes(fecha);
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        fecha: clave,
        label: modo === 'dia' ? etiquetaFecha(fecha) : modo === 'semana' ? `Sem. ${etiquetaFecha(clave)}` : etiquetaMes(clave),
        total: 0,
        pedidos: 0,
      });
    }
  }
  for (const v of ventas) {
    const clave = modo === 'dia' ? v.fecha : modo === 'semana' ? claveSemana(v.fecha) : claveMes(v.fecha);
    const p = mapa.get(clave);
    if (p) {
      p.total += v.total;
      p.pedidos++;
    }
  }
  return Array.from(mapa.values());
}

export type BucketBalance = {
  clave: string;
  label: string;
  ventas: number;
  cobrado: number;
  gastos: number;
  balance: number;
};

function etiquetaBucket(clave: string, granularidad: Granularidad): string {
  if (granularidad === 'dia') return etiquetaFecha(clave);
  if (granularidad === 'semana') return `Sem. ${etiquetaFecha(clave)}`;
  return etiquetaMes(clave);
}

/**
 * Balance por día / semana / mes: ventas (lo que se vendió), cobrado (lo que
 * realmente entró), gastos del negocio y la resta. Este es el "balance real"
 * que pide la cliente en el punto 7 de su petición.
 */
export function bucketsBalance(
  ventas: VentaDemo[],
  gastos: GastoDemo[],
  periodo: Periodo,
  granularidad: Granularidad,
): BucketBalance[] {
  const dias = diasDelPeriodo(periodo);
  const clave = (fecha: string) =>
    granularidad === 'dia' ? fecha : granularidad === 'semana' ? claveSemana(fecha) : claveMes(fecha);

  const mapa = new Map<string, BucketBalance>();
  for (const fecha of dias) {
    const k = clave(fecha);
    if (!mapa.has(k)) {
      mapa.set(k, { clave: k, label: etiquetaBucket(k, granularidad), ventas: 0, cobrado: 0, gastos: 0, balance: 0 });
    }
  }
  for (const v of ventas) {
    const b = mapa.get(clave(v.fecha));
    if (b) {
      b.ventas += v.total;
      b.cobrado += cobrado(v);
    }
  }
  for (const g of gastos) {
    const b = mapa.get(clave(g.fecha));
    if (b) b.gastos += g.monto;
  }
  for (const b of mapa.values()) b.balance = b.cobrado - b.gastos;
  return Array.from(mapa.values());
}

/** Últimos `n` buckets (para no dibujar 366 barras cuando el filtro es año). */
export function ultimos<T>(items: T[], n: number): T[] {
  return items.length <= n ? items : items.slice(items.length - n);
}
