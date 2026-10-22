import { requireStaff } from '@/lib/auth';
import { NextRequest } from "next/server";
import { getServerSupabase, jsonError, jsonOk } from "@/lib/supabase/server-api";
import { sanitize } from "@/lib/security";
import {
  abrirCaja,
  cerrarCaja,
  cierreExistente,
  crDateOnly,
  fetchCierreDia,
} from "@/lib/cierreCaja";

export const dynamic = "force-dynamic";

function fechaValida(value: unknown): string {
  const fecha = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  return crDateOnly();
}

/**
 * Detecta el error de PostgREST cuando la migracion 0002 todavia no esta
 * aplicada en la base (PGRST204: "Could not find the 'x' column ...").
 */
function esErrorMigracion(mensaje: unknown): boolean {
  if (typeof mensaje !== "string") return false;
  return /PGRST204|schema cache|does not exist|not found in the schema/i.test(mensaje);
}

const MENSAJE_MIGRACION =
  "Falta aplicar la migracion 0002_caja_chica.sql en Supabase (fondo de caja, gastos y comprobantes).";

function numeroNoNegativo(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    const authError = requireStaff(request);

    if (authError) return authError;

    const supabase = getServerSupabase();
    const { searchParams } = new URL(request.url);
    const fecha = fechaValida(searchParams.get("fecha") || crDateOnly());

    const totales = await fetchCierreDia(supabase, fecha);
    const cierre = await cierreExistente(supabase, fecha);

    const fondo = Number(cierre?.fondo_inicial || 0);
    const gastos = Number(cierre?.gastos_efectivo || 0);
    const esperado = Number(cierre?.efectivo_esperado ?? (
      fondo + Number(totales.total_efectivo || 0) - gastos
    ));
    const contado = cierre?.efectivo_contado == null ? null : Number(cierre.efectivo_contado);
    const diferencia = contado == null ? null : contado - esperado;

    let historial: unknown[] | undefined;
    if (searchParams.get("historial") === "1") {
      const { data, error } = await supabase
        .from("cierres_caja")
        .select(
          "id,fecha,total_ordenes,total_comprobantes,total_ingresos,total_efectivo,total_tarjeta,total_sinpe,total_descuentos,fondo_inicial,gastos_efectivo,efectivo_esperado,efectivo_contado,diferencia,observaciones,abierta_at,cerrado_at,created_at"
        )
        .order("fecha", { ascending: false })
        .limit(30);
      if (error) {
        // La base puede todavía no tener la migracion 0002. El historial es
        // informativo: no debe tumbar el cierre del dia.
        const fallback = await supabase
          .from("cierres_caja")
          .select(
            "id,fecha,total_ordenes,total_ingresos,total_efectivo,total_tarjeta,total_sinpe,total_descuentos,efectivo_contado,diferencia,observaciones,cerrado_at,created_at"
          )
          .order("fecha", { ascending: false })
          .limit(30);
        historial = fallback.data || [];
      } else {
        historial = data || [];
      }
    }

    return jsonOk({
      fecha,
      totales,
      cierre,
      abierto: Boolean(cierre && !cierre.cerrado_at),
      cerrado: Boolean(cierre?.cerrado_at),
      efectivo_esperado: esperado,
      diferencia,
      historial,
    });
  } catch (err) {
    console.error("Error GET /api/cierre-caja:", err);
    const mensaje = (err as { message?: unknown })?.message;
    if (esErrorMigracion(mensaje)) {
      return jsonError(MENSAJE_MIGRACION, 500);
    }
    return jsonError("Error al obtener cierre", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = requireStaff(request);

    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const supabase = getServerSupabase();
    const fecha = fechaValida(body.fecha);
    const accion = body.accion === "abrir" ? "abrir" : "cerrar";
    const observaciones = body.observaciones
      ? sanitize(String(body.observaciones), 500)
      : null;

    const fondo = numeroNoNegativo(body.fondo_inicial);
    const gastos = numeroNoNegativo(body.gastos_efectivo);
    const contado = numeroNoNegativo(body.efectivo_contado);

    if (accion === "abrir") {
      if (fondo == null) {
        return jsonError("El fondo inicial debe ser un número igual o mayor a 0.");
      }
      const resultado = await abrirCaja(supabase, {
        fecha,
        cajero_id: typeof body.cajero_id === "string" ? body.cajero_id : null,
        fondo_inicial: fondo,
        observaciones,
      });
      const totales = await fetchCierreDia(supabase, fecha);
      return jsonOk({ ...resultado, totales });
    }

    if (body.efectivo_contado != null && contado == null) {
      return jsonError("El efectivo contado debe ser un número igual o mayor a 0.");
    }
    if (body.gastos_efectivo != null && gastos == null) {
      return jsonError("Los gastos de caja chica deben ser un número igual o mayor a 0.");
    }

    const resultado = await cerrarCaja(supabase, {
      fecha,
      cajero_id: typeof body.cajero_id === "string" ? body.cajero_id : null,
      fondo_inicial: fondo ?? 0,
      gastos_efectivo: gastos ?? 0,
      efectivo_contado: contado,
      observaciones,
    });

    return jsonOk(resultado);
  } catch (err: unknown) {
    console.error("Error POST /api/cierre-caja:", err);
    const mensaje = (err as { message?: unknown })?.message;
    if (esErrorMigracion(mensaje)) {
      return jsonError(MENSAJE_MIGRACION, 500);
    }
    return jsonError((mensaje as string) || "Error al cerrar caja", 500);
  }
}
