import { requireStaff } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';
import { sanitize } from '@/lib/security';
import type { OrdenItemRow } from '@/types/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authError = requireStaff(request);
    if (authError) return authError;

    const body = (await request.json()) as {
      orden_nu?: unknown;
      items?: unknown;
    };
    const ordenNu = typeof body.orden_nu === 'string' ? body.orden_nu : '';
    if (!ordenNu) return jsonError('orden_nu requerido');
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonError('items requerido');
    }

    const supabase = getServerSupabase();

    const { data: orden } = await supabase
      .from('ordenes')
      .select('id, estado')
      .eq('id', ordenNu)
      .single();
    if (!orden) return jsonError('Orden no encontrada', 404);
    if (orden.estado !== 'abierta') {
      return jsonError(`No se pueden agregar items a una orden ${orden.estado}`, 400);
    }

    const items = body.items as Array<{
      product_id?: unknown;
      quantity?: unknown;
      notas?: unknown;
    }>;

    const validated: Array<{ product_id: string; quantity: number; notas: string | null }> = [];
    for (const item of items) {
      const productId = typeof item?.product_id === 'string' ? item.product_id : '';
      const quantity = Number(item?.quantity);
      if (!productId) return jsonError('Cada item necesita product_id');
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return jsonError('Cantidad inválida');
      }
      validated.push({
        product_id: productId,
        quantity,
        notas: item?.notas ? sanitize(String(item.notas), 300) : null,
      });
    }

    const { data: products, error: productsError } = await supabase
      .from('productos')
      .select('id, nombre, precio, disponible')
      .in('id', validated.map((item) => item.product_id));
    if (productsError) throw productsError;

    const productMap = new Map((products || []).map((product) => [product.id, product]));
    if (validated.some((item) => !productMap.get(item.product_id)?.disponible)) {
      return jsonError('Uno o más productos no existen o están desactivados', 400);
    }

    const rows: Partial<OrdenItemRow>[] = validated.map((item) => {
      const product = productMap.get(item.product_id)!;
      const price = Number(product.precio) || 0;
      return {
        orden_id: ordenNu,
        producto_id: product.id,
        nombre_producto: product.nombre,
        precio_unitario: price,
        cantidad: item.quantity,
        subtotal: price * item.quantity,
        notas: item.notas,
        estado_kds: 'pendiente',
        listo: false,
      };
    });

    const { error } = await supabase.from('orden_items').insert(rows);
    if (error) throw error;

    return jsonOk({ success: true });
  } catch (err) {
    console.error('Error POST /api/admin/add-items:', err);
    return jsonError('Error al agregar items', 500);
  }
}
