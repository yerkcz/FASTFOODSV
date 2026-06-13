import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, jsonError, jsonOk } from '@/lib/supabase/server-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orden_nu, pagos } = body;
    if (!orden_nu) return jsonError('orden_nu requerido');
    if (!Array.isArray(pagos) || pagos.length === 0) return jsonError('pagos requerido');

    const supabase = getServerSupabase();
    const pagosList = Array.isArray(pagos) ? pagos : [pagos];

    for (const pago of pagosList) {
      const { data: pagoRow, error: pagoErr } = await (supabase.from('pagos') as any)
        .insert({
          orden_id: orden_nu,
          forma_pago: pago.forma_pago,
          monto: Number(pago.monto),
          monto_recibido: pago.monto_recibido ? Number(pago.monto_recibido) : null,
          vuelto: pago.vuelto ? Number(pago.vuelto) : 0,
          referencia: pago.referencia || null,
        })
        .select()
        .single() as { data: any; error: any };
      if (pagoErr) throw pagoErr;

      let nextNum = 1;
      try {
        const { data: rpcNum } = await supabase.rpc('get_siguiente_numero_comprobante');
        if (typeof rpcNum === 'number') nextNum = rpcNum;
      } catch {}

      await (supabase.from('comprobantes') as any).insert({
        numero: nextNum,
        orden_id: orden_nu,
        pago_id: pagoRow.id,
        total: Number(pago.monto),
        subtotal: Number(pago.monto),
      });
    }

    await (supabase.from('ordenes') as any)
      .update({ estado: 'cerrada', closed_at: new Date().toISOString() })
      .eq('id', orden_nu);

    const { data: orden } = await supabase
      .from('ordenes')
      .select('mesa_numero, tipo')
      .eq('id', orden_nu)
      .single() as { data: any; error: any };

    if (orden?.tipo === 'mesa') {
      await (supabase.from('mesas') as any)
        .update({ estado: 'libre', orden_actual_id: null })
        .eq('numero', orden.mesa_numero);
    }

    return jsonOk({ success: true });
  } catch (err) {
    console.error('Error POST /api/admin/close-table:', err);
    return jsonError('Error al cerrar mesa', 500);
  }
}
