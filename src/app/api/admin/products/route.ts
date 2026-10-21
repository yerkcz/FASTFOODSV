import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';
import { sanitize } from '@/lib/security';
import type { ProductoRow } from '@/types/db';

export const dynamic = 'force-dynamic';

async function validateProductInput(body: Record<string, unknown>, partial = false) {
  const updates: Partial<ProductoRow> = {};

  if (body.nombre !== undefined) {
    const name = sanitize(String(body.nombre), 120);
    if (!name) throw new Error('El nombre es obligatorio');
    updates.nombre = name;
  } else if (!partial) {
    throw new Error('El nombre es obligatorio');
  }

  if (body.precio !== undefined) {
    const price = Number(body.precio);
    if (!Number.isFinite(price) || price <= 0) throw new Error('El precio debe ser mayor a 0');
    updates.precio = price;
  } else if (!partial) {
    throw new Error('El precio es obligatorio');
  }

  if (body.categoria_id !== undefined) {
    const categoryId = String(body.categoria_id);
    if (!categoryId) throw new Error('La categoría es obligatoria');
    updates.categoria_id = categoryId;
  } else if (!partial) {
    throw new Error('La categoría es obligatoria');
  }

  if (body.menu_origen !== undefined) {
    updates.menu_origen = sanitize(String(body.menu_origen), 40) || 'menu1';
  }
  if (body.disponible !== undefined) updates.disponible = Boolean(body.disponible);
  return updates;
}

export async function GET(request: NextRequest) {
  const authError = requireStaff(request);
  if (authError) return authError;

  const supabase = getServerSupabase();
  const { data: products, error } = await supabase
    .from('productos')
    .select('id, nombre, precio, disponible, menu_origen, categoria_id, categorias(nombre)')
    .order('nombre');
  if (error) return jsonError(error.message, 500);

  const { data: cats } = await supabase
    .from('categorias')
    .select('id, nombre')
    .order('nombre');

  return jsonOk({ products: products || [], categories: cats || [] });
}

export async function POST(request: NextRequest) {
  const authError = requireStaff(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const updates = await validateProductInput(body);
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('productos')
      .insert(updates)
      .select()
      .single();
    if (error) return jsonError(error.message, 500);
    return jsonOk({ product: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Datos inválidos', 400);
  }
}

export async function PATCH(request: NextRequest) {
  const authError = requireStaff(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return jsonError('id requerido', 400);

    const updates = await validateProductInput(body, true);
    updates.updated_at = new Date().toISOString();

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('productos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return jsonError(error.message, 500);
    return jsonOk({ product: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Datos inválidos', 400);
  }
}

export async function DELETE(request: NextRequest) {
  const authError = requireStaff(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return jsonError('id requerido', 400);

    const supabase = getServerSupabase();
    const { error } = await supabase
      .from('productos')
      .update({ disponible: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return jsonError(error.message, 500);
    return jsonOk({ success: true });
  } catch {
    return jsonError('Datos inválidos', 400);
  }
}
