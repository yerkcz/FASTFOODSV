import { createClient } from '@/lib/supabase/client';
import type { Categoria, Producto, Mesa, Orden, Comprobante } from '@/lib/supabase/types';

export const api = {
  async getCategorias(): Promise<Categoria[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('activo', true)
      .order('orden');
    if (error) throw error;
    return (data || []) as Categoria[];
  },

  async getProductos(): Promise<Producto[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('disponible', true)
      .order('orden');
    if (error) throw error;
    return (data || []) as Producto[];
  },

  async getMesas(): Promise<Mesa[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('mesas')
      .select('*')
      .order('numero');
    if (error) throw error;
    return (data || []) as Mesa[];
  },

  async getMesasAbiertas(): Promise<Record<string, unknown>[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('ordenes')
      .select(`
        id, mesa_numero, cliente_nombre, opened_at, estado, total, subtotal, descuento,
        orden_items ( id, nombre_producto, precio_unitario, cantidad, subtotal, estado_kds, listo, notas )
      `)
      .eq('estado', 'abierta')
      .order('opened_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((o: any) => ({
      orden_nu: o.id,
      mesa: o.mesa_numero,
      cliente: o.cliente_nombre,
      fecha: o.opened_at,
      estado: o.estado,
      total: o.total,
      subtotal: o.subtotal,
      descuento: o.descuento,
      items: o.orden_items || [],
    }));
  },

  async getKitchenOrders(filtroCategoria?: string): Promise<Record<string, unknown>[]> {
    const supabase = createClient();
    const queryPromise = supabase
      .from('orden_items')
      .select(`
        id, nombre_producto, cantidad, notas, listo, estado_kds, hora_registro, orden_id,
        ordenes!inner ( id, mesa_numero, cliente_nombre, opened_at, estado ),
        productos ( categorias ( nombre ) )
      `)
      .in('estado_kds', ['pendiente', 'preparando', 'listo'])
      .eq('ordenes.estado', 'abierta')
      .order('hora_registro');

    const { data, error } = await queryPromise;
    if (error) throw error;

    const ordenesMap = new Map<string, any>();
    for (const item of (data as any[]) || []) {
      if (filtroCategoria && filtroCategoria !== 'all') {
        const cat = item.productos?.categorias?.nombre;
        if (cat !== filtroCategoria) continue;
      }
      const oid = item.ordenes.id;
      if (!ordenesMap.has(oid)) {
        ordenesMap.set(oid, {
          orden_nu: oid,
          mesa: item.ordenes.mesa_numero,
          cliente: item.ordenes.cliente_nombre,
          hora_apertura: item.ordenes.opened_at,
          items: [],
        });
      }
      ordenesMap.get(oid).items.push({
        id: item.id,
        articulo: item.nombre_producto,
        cantidad: item.cantidad,
        notas: item.notas,
        listo: item.listo,
        estado_kds: item.estado_kds,
        hora_registro: item.hora_registro,
        categoria: item.productos?.categorias?.nombre || 'Otros',
      });
    }

    return Array.from(ordenesMap.values());
  },

  async markItemReady(itemId: string, listo: boolean): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('orden_items')
      .update({
        listo,
        estado_kds: listo ? 'listo' : 'pendiente',
      })
      .eq('id', itemId);
    if (error) throw error;
  },

  async createOrden(opts: {
    mesa_numero: number;
    tipo: 'mesa' | 'llevar';
    cliente_nombre?: string;
    mesero_id?: string;
  }): Promise<Orden> {
    const supabase = createClient();
    const { mesa_numero, tipo, cliente_nombre, mesero_id } = opts;

    const { data: mesa } = await supabase
      .from('mesas')
      .select('id')
      .eq('numero', mesa_numero)
      .single();

    const { data, error } = await supabase
      .from('ordenes')
      .insert({
        mesa_id: mesa?.id,
        mesa_numero,
        tipo,
        cliente_nombre: cliente_nombre || null,
        mesero_id: mesero_id || null,
        estado: 'abierta',
      })
      .select()
      .single();
    if (error) throw error;

    if (tipo === 'mesa') {
      await supabase
        .from('mesas')
        .update({ estado: 'ocupada', orden_actual_id: data.id })
        .eq('numero', mesa_numero);
    }

    return data as Orden;
  },

  async addItems(orden_id: string, items: Array<{ producto_id: string; nombre_producto: string; precio_unitario: number; cantidad: number; notas?: string }>): Promise<void> {
    const supabase = createClient();
    const rows = items.map((it) => ({
      orden_id,
      producto_id: it.producto_id,
      nombre_producto: it.nombre_producto,
      precio_unitario: it.precio_unitario,
      cantidad: it.cantidad,
      subtotal: it.precio_unitario * it.cantidad,
      notas: it.notas || null,
    }));
    const { error } = await supabase.from('orden_items').insert(rows);
    if (error) throw error;
  },

  async removeItem(itemId: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.from('orden_items').delete().eq('id', itemId);
    if (error) throw error;
  },

  async closeOrden(orden_id: string, pago: { forma_pago: string; monto: number; monto_recibido?: number; vuelto?: number; referencia?: string; cajero_id?: string }): Promise<Comprobante> {
    const supabase = createClient();

    const { data: pagoRow, error: pagoError } = await supabase
      .from('pagos')
      .insert({
        orden_id,
        forma_pago: pago.forma_pago,
        monto: pago.monto,
        monto_recibido: pago.monto_recibido || null,
        vuelto: pago.vuelto || 0,
        referencia: pago.referencia || null,
        cajero_id: pago.cajero_id || null,
      })
      .select()
      .single();
    if (pagoError) throw pagoError;

    const { data: orden } = await supabase
      .from('ordenes')
      .select('subtotal, total, descuento, tipo, mesa_numero')
      .eq('id', orden_id)
      .single();

    const { data: numeroRow } = await supabase.rpc('get_siguiente_numero_comprobante');
    const numero = numeroRow || 1;

    const { data: comprobante, error: compError } = await supabase
      .from('comprobantes')
      .insert({
        numero,
        orden_id,
        pago_id: pagoRow.id,
        total: orden?.total || pago.monto,
        subtotal: orden?.subtotal || pago.monto,
        descuento: orden?.descuento || 0,
      })
      .select()
      .single();
    if (compError) throw compError;

    await supabase
      .from('ordenes')
      .update({ estado: 'cerrada', closed_at: new Date().toISOString() })
      .eq('id', orden_id);

    if (orden?.tipo === 'mesa') {
      await supabase
        .from('mesas')
        .update({ estado: 'libre', orden_actual_id: null })
        .eq('numero', orden.mesa_numero);
    }

    return comprobante as Comprobante;
  },

  async closeOrdenMultiple(
    orden_id: string,
    pagos: Array<{ forma_pago: string; monto: number; monto_recibido?: number; vuelto?: number; referencia?: string; cajero_id?: string }>,
  ): Promise<Comprobante[]> {
    const supabase = createClient();

    const { data: orden } = await supabase
      .from('ordenes')
      .select('subtotal, total, descuento, tipo, mesa_numero')
      .eq('id', orden_id)
      .single();
    if (!orden) throw new Error('Orden no encontrada');

    const comprobantes: Comprobante[] = [];
    let totalPagado = 0;

    for (const pago of pagos) {
      const { data: pagoRow, error: pagoError } = await supabase
        .from('pagos')
        .insert({
          orden_id,
          forma_pago: pago.forma_pago,
          monto: pago.monto,
          monto_recibido: pago.monto_recibido || null,
          vuelto: pago.vuelto || 0,
          referencia: pago.referencia || null,
          cajero_id: pago.cajero_id || null,
        })
        .select()
        .single();
      if (pagoError) throw pagoError;

      const { data: numeroRow } = await supabase.rpc('get_siguiente_numero_comprobante');
      const numero = numeroRow || 1;

      const { data: comprobante, error: compError } = await supabase
        .from('comprobantes')
        .insert({
          numero,
          orden_id,
          pago_id: pagoRow.id,
          total: pago.monto,
          subtotal: pago.monto,
          descuento: 0,
        })
        .select()
        .single();
      if (compError) throw compError;

      comprobantes.push(comprobante as Comprobante);
      totalPagado += pago.monto;
    }

    if (totalPagado >= orden.total) {
      await supabase
        .from('ordenes')
        .update({ estado: 'cerrada', closed_at: new Date().toISOString() })
        .eq('id', orden_id);

      if (orden.tipo === 'mesa') {
        await supabase
          .from('mesas')
          .update({ estado: 'libre', orden_actual_id: null })
          .eq('numero', orden.mesa_numero);
      }
    }

    return comprobantes;
  },

  async validarPin(pin: string): Promise<{ id: string; nombre: string; rol: string } | null> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('validar_pin', { p_pin: pin });
    if (error) throw error;
    if (!data || data.length === 0) return null;
    return data[0];
  },

  async getConfig(clave: string): Promise<string | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', clave)
      .single();
    if (error) return null;
    return data?.valor || null;
  },

  async getOrdenById(orden_id: string): Promise<any> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('ordenes')
      .select(`
        *,
        orden_items ( id, nombre_producto, precio_unitario, cantidad, subtotal, notas, estado_kds, listo ),
        pagos ( id, forma_pago, monto, monto_recibido, vuelto, referencia, created_at ),
        cuenta_division ( id, numero_persona, nombre_persona, tipo_division, items_asignados, monto_asignado, pago_id )
      `)
      .eq('id', orden_id)
      .single();
    if (error) throw error;
    return data;
  },

  async getMesasReales(): Promise<Mesa[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('mesas')
      .select('*')
      .neq('numero', 99)
      .order('numero');
    if (error) throw error;
    return (data || []) as Mesa[];
  },

  async getOrdenesLlevarAbiertas(): Promise<Record<string, unknown>[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('ordenes')
      .select(`
        id, mesa_numero, cliente_nombre, opened_at, estado, total, subtotal, descuento, tipo,
        orden_items ( id, nombre_producto, precio_unitario, cantidad, subtotal, estado_kds, listo, notas )
      `)
      .eq('tipo', 'llevar')
      .eq('estado', 'abierta')
      .order('opened_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((o: any) => ({
      orden_nu: o.id,
      mesa: o.mesa_numero,
      cliente: o.cliente_nombre,
      fecha: o.opened_at,
      estado: o.estado,
      total: o.total,
      subtotal: o.subtotal,
      descuento: o.descuento,
      tipo: o.tipo,
      items: o.orden_items || [],
    }));
  },

  async saveCuentaDivision(opts: {
    orden_id: string;
    divisiones: Array<{
      numero_persona: number;
      nombre_persona?: string;
      tipo_division: string;
      items_asignados: string[];
      monto_asignado: number;
    }>;
  }): Promise<void> {
    const supabase = createClient();
    await supabase.from('cuenta_division').delete().eq('orden_id', opts.orden_id);
    if (opts.divisiones.length === 0) return;
    const rows = opts.divisiones.map((d) => ({
      orden_id: opts.orden_id,
      numero_persona: d.numero_persona,
      nombre_persona: d.nombre_persona || null,
      tipo_division: d.tipo_division,
      items_asignados: d.items_asignados,
      monto_asignado: d.monto_asignado,
    }));
    const { error } = await supabase.from('cuenta_division').insert(rows);
    if (error) throw error;
  },

  async getConfiguracion(): Promise<Record<string, string>> {
    const supabase = createClient();
    const { data, error } = await supabase.from('configuracion').select('clave, valor');
    if (error) return {};
    const map: Record<string, string> = {};
    (data || []).forEach((row: { clave: string; valor: string }) => {
      map[row.clave] = row.valor;
    });
    return map;
  },
};
