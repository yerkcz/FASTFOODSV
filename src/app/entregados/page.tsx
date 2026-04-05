"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type ClosedOrder = {
    orden_nu: string;
    cliente: string;
    fecha: string;
    total: number;
    forma_pago: string;
};

function formatColones(amount: number): string {
    const rounded = Math.round(amount).toString();
    return "\u20A1" + rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export default function EntregadosPage() {
    const [orders, setOrders] = useState<ClosedOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalDiario, setTotalDiario] = useState(0);
    const [diezPorciento, setDiezPorciento] = useState(0);

    const fetchOrders = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/closed-orders", {
                headers: { "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin123" }
            });
            if (res.ok) {
                const data = await res.json();
                setOrders(data.orders);
                setTotalDiario(data.total_diario);
                setDiezPorciento(data.diez_porciento || 0);
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'Roboto, sans-serif' }}>
            <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: '#1e8e3e', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 1000 }}>
                <Link href="/inicio" style={{ color: 'white', display: 'flex' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></Link>
                <div style={{ fontSize: '1.25rem', fontWeight: 500 }}>Entregados Hoy</div>
                <div onClick={fetchOrders} style={{ cursor: 'pointer' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg></div>
            </header>

            <div style={{ paddingTop: '70px', paddingBottom: '90px', padding: '70px 16px 90px', maxWidth: '800px', margin: '0 auto' }}>
                {/* Summary */}
                <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#5f6368', textTransform: 'uppercase' }}>Total Vendido Hoy ({orders.length} órdenes)</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1e8e3e', marginTop: '4px' }}>{formatColones(totalDiario)}</div>
                    <div style={{ fontSize: '0.85rem', color: '#5f6368', marginTop: '4px' }}>10% Servicio: {formatColones(diezPorciento)}</div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#80868b' }}>Cargando...</div>
                ) : orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#80868b' }}>No hay entregas hoy aún.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {orders.map(o => (
                            <div key={o.orden_nu} style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', padding: '14px 16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '1rem', color: '#202124', fontWeight: 500 }}>{o.cliente}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#5f6368', marginTop: '4px' }}>
                                            #{o.orden_nu} • {new Date(o.fecha).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' })} • {o.forma_pago}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#202124' }}>{formatColones(o.total)}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#1e8e3e', marginTop: '2px' }}>Cerrada ✓</div>
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
