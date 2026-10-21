import { NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';
import { sanitize } from '@/lib/security';
import type { OrdenItemRow } from '@/types/db';

export const dynamic = 'force-dynamic';

type OrderItemInput = {
  product_id?: unknown;
  quantity?: unknown;
  notas?: unknown;
};

type ValidItem = {
  product_id: string;
  quantity: number;
  notas: string | null;
};

/**
 * Crea una orden completa en un solo request.
 *
 * El precio SIEMPRE sale de `productos.precio`; lo que mande el navegador
 * (nombre, precio) se ignora. Si un producto no existe o está desactivado se
 * rechaza la orden entera para no guardar comandas incompletas.
 */
export async function POST(request: NextRequest) {
  const authError = requireStaff(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      mesa?: unknown;
      tipo?: unknown;
      cliente?: unknown;
      notas?: unknown;
      items?: unknown;
    };

    const tipo = body.tipo === 'llevar' ? 'llevar' : 'mesa';
    const mesaNumber =
      tipo === 'llevar'
        ? 99
        : Number.parseInt(String(body.mesa ?? '').replace(/\D/g, ''), 10);

    if (tipo === 'mesa' && (!Number.isInteger(mesaNumber) || mesaNumber < 1 || mesaNumber > 6)) {
      return jsonError('Mesa inválida: debe ser un número del 1 al 6');
    }
    if (tipo === 'llevar' && mesaNumber !== 99) {
      return jsonError('Mesa inválida para pedido para llevar');
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonError('Agregá al menos un producto');
    }
    if (body.items.length > 100) return jsonError('Demasiados items en la orden');

    const seen = new Set<string>();
    const items: ValidItem[] = [];
    for (const raw of body.items as OrderItemInput[]) {
      if (!raw || typeof raw !== 'object') return jsonError('Item inválido');
      const productId = typeof raw.product_id === 'string' ? raw.product_id : '';
      const quantity = Number(raw.quantity);
      if (!productId) return jsonError('Cada item necesita product_id');
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return jsonError('Cantidad inválida: debe ser un entero entre 1 y 99');
      }
      if (seen.has(productId)) {
        return jsonError('Hay productos repetidos; sumá la cantidad en un solo item');
      }
      seen.add(productId);
      items.push({
        product_id: productId,
        quantity,
        notas: raw.notas ? sanitize(String(raw.notas), 300) : null,
      });
    }

    const supabase = getServerSupabase();

    const productIds = items.map((item) => item.product_id);
    const { data: products, error: productsError } = await supabase
      .from('productos')
      .select('id, nombre, precio, categoria_id, disponible')
      .in('id', productIds);
    if (productsError) throw productsError;

    const productMap = new Map((products || []).map((product) => [product.id, product]));
    const missing = productIds.filter((id) => !productMap.get(id)?.disponible);
    if (missing.length > 0) {
      return jsonError('Uno o más productos no existen o están desactivados', 400);
    }

    const { data: mesaRow, error: mesaError } = await supabase
      .from('mesas')
      .select('id, numero')
      .eq('numero', mesaNumber)
      .single();
    if (mesaError || !mesaRow) return jsonError('La mesa no existe', 400);

    const customerName = sanitize(
      typeof body.cliente === 'string' ? body.cliente : '',
      120
    );
    const clienteNombre =
      tipo === 'llevar'
        ? customerName || 'Para Llevar'
        : customerName
          ? `Mesa ${mesaNumber} - ${customerName}`
          : `Mesa ${mesaNumber}`;

    const { data: order, error: orderError } = await supabase
      .from('ordenes')
      .insert({
        mesa_id: mesaRow.id,
        mesa_numero: mesaNumber,
        tipo,
        cliente_nombre: clienteNombre,
        notas: body.notas ? sanitize(String(body.notas), 500) : null,
        estado: 'abierta',
      })
      .select('id')
      .single();
    if (orderError) throw orderError;

    const itemRows: Partial<OrdenItemRow>[] = items.map((item) => {
      const product = productMap.get(item.product_id)!;
      const price = Number(product.precio) || 0;
      return {
        orden_id: order.id,
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

    const { error: itemsError } = await supabase.from('orden_items').insert(itemRows);
    if (itemsError) {
      // Rollback manual: la orden sin items es basura y bloquea la mesa.
      await supabase.from('ordenes').delete().eq('id', order.id);
      throw itemsError;
    }

    if (tipo === 'mesa') {
      const { error: mesaUpdateError } = await supabase
        .from('mesas')
        .update({ estado: 'ocupada', orden_actual_id: order.id })
        .eq('numero', mesaNumber);
      if (mesaUpdateError) {
        console.error('No se pudo marcar la mesa como ocupada:', mesaUpdateError);
      }
    }

    return jsonOk({ success: true, orden_nu: order.id });
  } catch (error) {
    console.error('Error POST /api/orders:', error);
    return jsonError('Error procesando la orden', 500);
  }
}
