"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatColones } from "@/lib/format";

type ClosedOrder = {
    orden_nu: string;
    cliente: string;
    fecha: string;
    total: number;
    forma_pago: string;
};

export default function EntregadosPage() {
    const [orders, setOrders] = useState<ClosedOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalDiario, setTotalDiario] = useState(0);

    const fetchOrders = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/closed-orders", {
                headers: { "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin123" }
            });
            if (res.ok) {
                const data = await res.json();
                setOrders(data.orders);
                setTotalDiario(data.total_diario);
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', color: 'var(--text-primary)', fontFamily: 'Roboto, sans-serif' }}>
            <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', background: 'var(--primary-gradient)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 1000 }}>
                <Link href="/inicio" style={{ color: 'white', display: 'flex' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></Link>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>Entregados Hoy</div>
                <button onClick={fetchOrders} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', minHeight: 'auto', padding: '6px' }} aria-label="Actualizar"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg></button>
            </header>

            <div style={{ paddingTop: '76px', paddingBottom: '90px', paddingLeft: '16px', paddingRight: '16px', maxWidth: '800px', margin: '0 auto' }}>
                {/* Summary */}
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: '12px', padding: '18px', marginBottom: '16px', boxShadow: 'var(--card-shadow)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Total Vendido Hoy ({orders.length} órdenes)</div>
                    <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '6px' }}>{formatColones(totalDiario)}</div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Cargando...</div>
                ) : orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.95rem' }}>No hay entregas hoy aún.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {orders.map(o => (
                            <div key={o.orden_nu} style={{ backgroundColor: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: '12px', boxShadow: 'var(--card-shadow)', padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 700 }}>{o.cliente || 'Para Llevar / Mesa 99'}</div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                            #{o.orden_nu} • {new Date(o.fecha).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' })} • {o.forma_pago}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatColones(o.total)}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '4px', fontWeight: 700 }}>Cerrada ✓</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
