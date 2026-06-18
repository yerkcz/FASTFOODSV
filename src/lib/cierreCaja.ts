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
  total_ordenes: number;
  total_ingresos: number;
  total_efectivo: number;
  total_tarjeta: number;
  total_sinpe: number;
  total_descuentos: number;
};

export async function fetchCierreDia(supabase: any, fecha: string): Promise<CierreDia> {
  const start = new Date(`${fecha}T00:00:00-06:00`);
  const end = new Date(`${fecha}T23:59:59.999-06:00`);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Fuente de verdad: comprobantes. NO leer de ordenes.total porque el trigger
  // trg_recalcular_total_orden pone total=0 al borrar orden_items en el cierre.
  const { data: comprobantes, error } = await supabase
    .from("comprobantes")
    .select("id, pago_id, total, descuento, created_at")
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) throw error;
  const comps = (comprobantes as any[]) || [];

  const pagoIds = comps.map((c) => c.pago_id).filter(Boolean);
  let pagosById = new Map<string, any>();
  if (pagoIds.length > 0) {
    const { data: pagosData } = await supabase
      .from("pagos")
      .select("id, forma_pago, monto")
      .in("id", pagoIds);
    (pagosData || []).forEach((p: any) => pagosById.set(p.id, p));
  }

  let total_ingresos = 0;
  let total_descuentos = 0;
  let total_efectivo = 0;
  let total_tarjeta = 0;
  let total_sinpe = 0;

  comps.forEach((c: any) => {
    total_ingresos += Number(c.total || 0);
    if (Number(c.descuento || 0) > 0) total_descuentos += Number(c.descuento);
    const pago = pagosById.get(c.pago_id);
    if (!pago) return;
    const fp = (pago.forma_pago || "").toLowerCase();
    const m = Number(pago.monto || 0);
    if (fp === "efectivo") total_efectivo += m;
    else if (fp === "tarjeta") total_tarjeta += m;
    else if (fp === "sinpe") total_sinpe += m;
  });

  return {
    fecha,
    start: startIso,
    end: endIso,
    total_ordenes: comps.length,
    total_ingresos,
    total_efectivo,
    total_tarjeta,
    total_sinpe,
    total_descuentos,
  };
}

export async function cierreExistente(supabase: any, fecha: string) {
  const { data } = await supabase
    .from("cierres_caja")
    .select("*")
    .eq("fecha", fecha)
    .maybeSingle();
  return data || null;
}

export async function ejecutarCierre(
  supabase: any,
  args: {
    fecha: string;
    cajero_id?: string | null;
    efectivo_contado?: number | null;
    observaciones?: string | null;
  }
) {
  const existente = await cierreExistente(supabase, args.fecha);
  if (existente) {
    return { ya_cerrado: true, cierre: existente };
  }

  const totales = await fetchCierreDia(supabase, args.fecha);

  const diferencia =
    args.efectivo_contado != null
      ? Number(args.efectivo_contado) - Number(totales.total_efectivo)
      : null;

  const { data, error } = await supabase
    .from("cierres_caja")
    .insert({
      fecha: args.fecha,
      cajero_id: args.cajero_id || null,
      total_ordenes: totales.total_ordenes,
      total_ingresos: totales.total_ingresos,
      total_efectivo: totales.total_efectivo,
      total_tarjeta: totales.total_tarjeta,
      total_sinpe: totales.total_sinpe,
      total_descuentos: totales.total_descuentos,
      efectivo_contado: args.efectivo_contado ?? null,
      diferencia,
      observaciones: args.observaciones || null,
    })
    .select()
    .single();

  if (error) throw error;
  return { ya_cerrado: false, cierre: data, totales };
}