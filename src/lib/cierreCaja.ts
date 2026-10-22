import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { CierreCajaRow, PagoRow } from "@/types/db";

/** Mismo cliente que devuelve `getServerSupabase()`. */
type Supabase = SupabaseClient<Database>;

export function crNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
}

export function crDateOnly(d: Date = crNow()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type CierreDia = {
  fecha: string;
  start: string;
  end: string;
  /** Órdenes únicas. Un split bill cuenta una sola vez. */
  total_ordenes: number;
  /** Comprobantes/pagos emitidos. Puede ser mayor que total_ordenes. */
  total_comprobantes: number;
  total_ingresos: number;
  total_efectivo: number;
  total_tarjeta: number;
  total_sinpe: number;
  total_descuentos: number;
};

export async function fetchCierreDia(supabase: Supabase, fecha: string): Promise<CierreDia> {
  const start = new Date(`${fecha}T00:00:00-06:00`);
  const end = new Date(`${fecha}T23:59:59.999-06:00`);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Fuente de verdad: comprobantes. NO leer de ordenes.total porque el trigger
  // trg_recalcular_total_orden pone total=0 al borrar orden_items en el cierre.
  const { data: comprobantes, error } = await supabase
    .from("comprobantes")
    .select("id, orden_id, pago_id, total, descuento, created_at")
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) throw error;
  const comps = comprobantes || [];

  const pagoIds = comps.map((c) => c.pago_id).filter((id): id is string => Boolean(id));
  const pagosById = new Map<string, Pick<PagoRow, "id" | "forma_pago" | "monto">>();
  if (pagoIds.length > 0) {
    const { data: pagosData } = await supabase
      .from("pagos")
      .select("id, forma_pago, monto")
      .in("id", pagoIds);
    (pagosData || []).forEach((p) => pagosById.set(p.id, p));
  }

  let total_ingresos = 0;
  let total_descuentos = 0;
  let total_efectivo = 0;
  let total_tarjeta = 0;
  let total_sinpe = 0;

  comps.forEach((c) => {
    total_ingresos += Number(c.total || 0);
    if (Number(c.descuento || 0) > 0) total_descuentos += Number(c.descuento);
    // `pago_id` puede ser null: Map.get(null) siempre da undefined, lo mismo
    // que este ternario (los ids nunca son la cadena "null").
    const pago = c.pago_id ? pagosById.get(c.pago_id) : undefined;
    if (!pago) return;
    const fp = (pago.forma_pago || "").toLowerCase();
    const m = Number(pago.monto || 0);
    if (fp === "efectivo") total_efectivo += m;
    else if (fp === "tarjeta") total_tarjeta += m;
    else if (fp === "sinpe") total_sinpe += m;
  });

  const ordenesUnicas = new Set(
    comps.map((c) => c.orden_id || c.id).filter((id): id is string => Boolean(id))
  );

  return {
    fecha,
    start: startIso,
    end: endIso,
    total_ordenes: ordenesUnicas.size,
    total_comprobantes: comps.length,
    total_ingresos,
    total_efectivo,
    total_tarjeta,
    total_sinpe,
    total_descuentos,
  };
}

export async function cierreExistente(
  supabase: Supabase,
  fecha: string
): Promise<CierreCajaRow | null> {
  // No usar maybeSingle: la tabla histórica permite varias filas por fecha
  // cuando cajero_id es NULL. Con el índice único nuevo solo habrá una, pero
  // esto también tolera bases que todavía no tienen la migración aplicada.
  const { data, error } = await supabase
    .from("cierres_caja")
    .select("*")
    .eq("fecha", fecha)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

function estaCerrada(cierre: CierreCajaRow): boolean {
  return Boolean(cierre.cerrado_at);
}

export async function abrirCaja(
  supabase: Supabase,
  args: {
    fecha: string;
    cajero_id?: string | null;
    fondo_inicial?: number;
    observaciones?: string | null;
  }
) {
  const existente = await cierreExistente(supabase, args.fecha);

  if (existente) {
    if (estaCerrada(existente)) {
      return { ya_cerrado: true, ya_abierta: false, cierre: existente };
    }
    return { ya_cerrado: false, ya_abierta: true, cierre: existente };
  }

  const fondo = Number.isFinite(Number(args.fondo_inicial))
    ? Math.max(0, Number(args.fondo_inicial))
    : 0;

  const { data, error } = await supabase
    .from("cierres_caja")
    .insert({
      fecha: args.fecha,
      cajero_id: args.cajero_id || null,
      fondo_inicial: fondo,
      gastos_efectivo: 0,
      total_ordenes: 0,
      total_comprobantes: 0,
      total_ingresos: 0,
      total_efectivo: 0,
      total_tarjeta: 0,
      total_sinpe: 0,
      total_descuentos: 0,
      abierta_at: new Date().toISOString(),
      cerrado_at: null,
      observaciones: args.observaciones || null,
    })
    .select()
    .single();

  if (error) throw error;
  return { ya_cerrado: false, ya_abierta: false, cierre: data };
}

export async function cerrarCaja(
  supabase: Supabase,
  args: {
    fecha: string;
    cajero_id?: string | null;
    fondo_inicial?: number;
    gastos_efectivo?: number;
    efectivo_contado?: number | null;
    observaciones?: string | null;
  }
) {
  let existente = await cierreExistente(supabase, args.fecha);
  let autoAbierta = false;

  if (existente && estaCerrada(existente)) {
    return { ya_cerrado: true, cierre: existente, totales: null, auto_abierta: false };
  }

  // Compatibilidad: si nadie abrió la caja, se crea con el fondo indicado
  // (o 0) para no bloquear el cierre. La UI recomienda abrir primero.
  if (!existente) {
    autoAbierta = true;
    const fondo = Number.isFinite(Number(args.fondo_inicial))
      ? Math.max(0, Number(args.fondo_inicial))
      : 0;
    const { data, error } = await supabase
      .from("cierres_caja")
      .insert({
        fecha: args.fecha,
        cajero_id: args.cajero_id || null,
        fondo_inicial: fondo,
        gastos_efectivo: 0,
        total_ordenes: 0,
        total_comprobantes: 0,
        total_ingresos: 0,
        total_efectivo: 0,
        total_tarjeta: 0,
        total_sinpe: 0,
        total_descuentos: 0,
        abierta_at: new Date().toISOString(),
        cerrado_at: null,
        observaciones: args.observaciones || null,
      })
      .select()
      .single();
    if (error) throw error;
    existente = data;
  }

  const totales = await fetchCierreDia(supabase, args.fecha);
  const gastos = Number.isFinite(Number(args.gastos_efectivo))
    ? Math.max(0, Number(args.gastos_efectivo))
    : 0;
  const contado =
    args.efectivo_contado != null && Number.isFinite(Number(args.efectivo_contado))
      ? Math.max(0, Number(args.efectivo_contado))
      : null;

  const { data, error } = await supabase
    .from("cierres_caja")
    .update({
      total_ordenes: totales.total_ordenes,
      total_comprobantes: totales.total_comprobantes,
      total_ingresos: totales.total_ingresos,
      total_efectivo: totales.total_efectivo,
      total_tarjeta: totales.total_tarjeta,
      total_sinpe: totales.total_sinpe,
      total_descuentos: totales.total_descuentos,
      gastos_efectivo: gastos,
      efectivo_contado: contado,
      observaciones: args.observaciones || existente.observaciones || null,
      cerrado_at: new Date().toISOString(),
    })
    .eq("id", existente.id)
    .select()
    .single();

  if (error) throw error;
  return { ya_cerrado: false, cierre: data, totales, auto_abierta: autoAbierta };
}

/**
 * Compatibilidad con el nombre anterior. El endpoint nuevo usa `cerrarCaja`
 * directamente; esto se conserva para no romper imports viejos.
 */
export async function ejecutarCierre(
  supabase: Supabase,
  args: {
    fecha: string;
    cajero_id?: string | null;
    efectivo_contado?: number | null;
    observaciones?: string | null;
    fondo_inicial?: number;
    gastos_efectivo?: number;
  }
) {
  return cerrarCaja(supabase, args);
}
