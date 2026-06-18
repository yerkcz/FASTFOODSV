import { NextRequest } from "next/server";
import { getServerSupabase, jsonError, jsonOk, isValidAdminKey } from "@/lib/supabase/server-api";
import {
  cierreExistente,
  crDateOnly,
  ejecutarCierre,
  fetchCierreDia,
} from "@/lib/cierreCaja";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError("No autorizado", 401);

    const supabase = getServerSupabase();
    const { searchParams } = new URL(request.url);
    const fecha = searchParams.get("fecha") || crDateOnly();

    const totales = await fetchCierreDia(supabase, fecha);
    const existente = await cierreExistente(supabase, fecha);

    return jsonOk({
      fecha,
      totales,
      cierre: existente,
      cerrado: !!existente,
    });
  } catch (err) {
    console.error("Error GET /api/cierre-caja:", err);
    return jsonError("Error al obtener cierre", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isValidAdminKey(request.headers)) return jsonError("No autorizado", 401);

    const body = await request.json().catch(() => ({}));
    const supabase = getServerSupabase();
    const fecha = (body.fecha as string) || crDateOnly();

    const resultado = await ejecutarCierre(supabase, {
      fecha,
      cajero_id: body.cajero_id || null,
      efectivo_contado: body.efectivo_contado != null ? Number(body.efectivo_contado) : null,
      observaciones: body.observaciones || null,
    });

    return jsonOk(resultado);
  } catch (err: any) {
    console.error("Error POST /api/cierre-caja:", err);
    return jsonError(err?.message || "Error al cerrar caja", 500);
  }
}