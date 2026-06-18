import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, isValidAdminKey, jsonError, jsonOk } from "@/lib/supabase/server-api";

export async function GET(request: NextRequest) {
  if (!isValidAdminKey(request.headers)) return jsonError("No autorizado", 401);
  const supabase = getServerSupabase();

  const { data: products, error } = await supabase
    .from("productos")
    .select(`id, nombre, precio, disponible, menu_origen, categoria_id, categorias(nombre)`)
    .order("nombre");

  if (error) return jsonError(error.message, 500);

  const { data: cats } = await supabase.from("categorias").select("id, nombre").order("nombre");

  return jsonOk({ products: products || [], categories: cats || [] });
}

export async function POST(request: NextRequest) {
  if (!isValidAdminKey(request.headers)) return jsonError("No autorizado", 401);
  const supabase = getServerSupabase();

  const body = await request.json();
  const { nombre, precio, categoria_id, menu_origen } = body;

  if (!nombre || !precio || !categoria_id) return jsonError("nombre, precio y categoria_id requeridos", 400);

  const { data, error } = await supabase
    .from("productos")
    .insert({ nombre, precio: Number(precio), categoria_id, menu_origen: menu_origen || "menu1" })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ product: data });
}

export async function PATCH(request: NextRequest) {
  if (!isValidAdminKey(request.headers)) return jsonError("No autorizado", 401);
  const supabase = getServerSupabase();

  const body = await request.json();
  const { id, nombre, precio, disponible, menu_origen } = body;

  if (!id) return jsonError("id requerido", 400);

  const updates: Record<string, unknown> = {};
  if (nombre !== undefined) updates.nombre = nombre;
  if (precio !== undefined) updates.precio = Number(precio);
  if (disponible !== undefined) updates.disponible = disponible;
  if (menu_origen !== undefined) updates.menu_origen = menu_origen;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("productos")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ product: data });
}

export async function DELETE(request: NextRequest) {
  if (!isValidAdminKey(request.headers)) return jsonError("No autorizado", 401);
  const supabase = getServerSupabase();

  const { id } = await request.json();
  if (!id) return jsonError("id requerido", 400);

  const { error } = await supabase
    .from("productos")
    .update({ disponible: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return jsonError(error.message, 500);
  return jsonOk({ success: true });
}
