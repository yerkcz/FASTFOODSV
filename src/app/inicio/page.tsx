"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function InicioPortal() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    return () => document.body.classList.remove('sidebar-open');
  }, [sidebarOpen]);

  const navButtons = [
    { href: "/mesas", label: "Mesas", icon: "M3 3h18v18H3zM3 9h18M9 21V9", color: "#f9ab00", bg: "#fdf6e3" },
    { href: "/cocina", label: "Monitor Cocina", icon: "M12 3c-1.2 5.4-6 6-6 12h12c0-6-4.8-6.6-6-12zM6 17h12M10 21v-4M14 21v-4", color: "#ea4335", bg: "#fce8e6" },
    { href: "/bebidas-frias", label: "Bebidas Frías", icon: "M8 2v4M12 2v4M6 6h12l-1 14H7L6 6z", color: "#1a73e8", bg: "#e8f0fe" },
    { href: "/bebidas-calientes", label: "Beb. Calientes", icon: "M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM6 2v3M10 2v3M14 2v3", color: "#e65100", bg: "#fff3e0" },
    { href: "/entregados", label: "Entregados", icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3", color: "#1e8e3e", bg: "#e6f4ea" },
    { href: "/?waiter_mode=true", label: "Nueva Comanda", icon: "M12 5v14M5 12h14", color: "#1a73e8", bg: "#e8f0fe" },
  ];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", fontFamily: 'Roboto, sans-serif' }}>
      {/* Top App Bar */}
      <header style={{ 
        position: 'fixed', top: 0, left: 0, right: 0, height: '56px',
        background: 'linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)',
        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', boxShadow: '0 2px 8px rgba(26,115,232,0.4)', zIndex: 1000
      }}>
        {/* Hamburger — touch area is 44px min */}
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menú"
          style={{ 
            background: 'none', border: 'none', cursor: 'pointer', color: 'white',
            padding: '10px', margin: '-10px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: '44px', minHeight: '44px'
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        <div style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.2px' }}>Fast Food San Vicente</div>

        {/* Admin quick-access visible in header */}
        <Link
          href="/admin"
          aria-label="Ir a Admin"
          style={{
            background: 'rgba(255,255,255,0.18)', color: 'white',
            textDecoration: 'none', borderRadius: '20px',
            padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: '6px',
            letterSpacing: '0.3px', whiteSpace: 'nowrap',
            border: '1px solid rgba(255,255,255,0.3)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Admin
        </Link>
      </header>

      {/* Sidebar Drawer */}
      {sidebarOpen && (
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 2000 }} 
          onClick={() => setSidebarOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
        >
          {/* Backdrop */}
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} />
          {/* Drawer */}
          <div 
            onClick={e => e.stopPropagation()} 
            style={{ 
              position: 'absolute', top: 0, left: 0, bottom: 0, width: '280px',
              backgroundColor: 'white', boxShadow: '4px 0 20px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column', animation: 'slideInLeft 0.25s ease-out',
              overflowY: 'auto', WebkitOverflowScrolling: 'touch'
            }}
          >
            {/* Drawer Header */}
            <div style={{ 
              padding: '20px 16px', 
              background: 'linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)',
              color: 'white'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Image src="/LogoFastF.jpeg" alt="Logo" width={44} height={44} style={{ borderRadius: '50%' }} />
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Fast Food San Vicente</div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.8 }}>Sistema POS</div>
                </div>
              </div>
            </div>
            
            {/* Drawer Links */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {/* Admin — featured */}
              <Link 
                href="/admin" 
                onClick={() => setSidebarOpen(false)}
                style={{ 
                  textDecoration: 'none', padding: '14px 16px', 
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: '#e6f4ea', borderLeft: '4px solid #137333'
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#137333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '0.95rem', color: '#137333', fontWeight: 700 }}>Admin / Caja</div>
                  <div style={{ fontSize: '0.78rem', color: '#5f6368', marginTop: '1px' }}>Cobros y reportes del día</div>
                </div>
              </Link>

              <div style={{ height: '1px', background: '#f1f3f4', margin: '4px 0' }} />

              {[
                { href: '/cocina', label: 'Monitor General', desc: 'Comandas en tiempo real' },
                { href: '/mesas', label: 'Mesas', desc: 'Estado del salón' },
                { href: '/bebidas-frias', label: 'Bebidas Frías', desc: 'Station de bebidas frías' },
                { href: '/bebidas-calientes', label: 'Beb. Calientes', desc: 'Café y bebidas calientes' },
                { href: '/entregados', label: 'Entregados', desc: 'Historial de entregas' },
              ].map(item => (
                <Link 
                  key={item.href} 
                  href={item.href} 
                  onClick={() => setSidebarOpen(false)}
                  style={{ textDecoration: 'none', padding: '14px 16px', borderBottom: '1px solid #f1f3f4', display: 'flex', flexDirection: 'column' }}
                >
                  <div style={{ fontSize: '0.95rem', color: '#202124', fontWeight: 500 }}>{item.label}</div>
                  <div style={{ fontSize: '0.78rem', color: '#5f6368', marginTop: '2px' }}>{item.desc}</div>
                </Link>
              ))}

              <div style={{ height: '1px', background: '#f1f3f4', margin: '4px 0' }} />

              <Link 
                href="/?waiter_mode=true" 
                onClick={() => setSidebarOpen(false)}
                style={{ 
                  textDecoration: 'none', padding: '14px 16px', display: 'flex', 
                  alignItems: 'center', gap: '8px', color: '#1a73e8'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Nueva Comanda</div>
                  <div style={{ fontSize: '0.78rem', color: '#5f6368', marginTop: '1px' }}>Crear orden directa (Mesero)</div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{ paddingTop: '72px', paddingBottom: '32px', padding: '72px 16px 32px', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Image src="/LogoFastF.jpeg" alt="Fast Food San Vicente" width={60} height={60} />
          <h1 style={{ fontSize: '1.35rem', marginTop: '10px', color: '#202124', fontWeight: 600 }}>Panel de Control</h1>
        </div>

        <div className="inicio-grid">
          {/* Admin card — full width, prominent */}
          <Link href="/admin" style={{ textDecoration: 'none', gridColumn: '1 / -1' }}>
            <div style={{ 
              backgroundColor: 'white', padding: '18px 20px', borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1.5px solid #e6f4ea',
              display: 'flex', alignItems: 'center', gap: '16px',
              transition: 'box-shadow 0.2s'
            }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#e6f4ea', color: '#137333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#137333' }}>Admin / Caja</div>
                <div style={{ fontSize: '0.8rem', color: '#5f6368', marginTop: '2px' }}>Cobrar mesas, cerrar cuentas y ver reportes del día</div>
              </div>
              <svg style={{ marginLeft: 'auto', color: '#137333' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </Link>

          {navButtons.map(btn => (
            <Link key={btn.href} href={btn.href} style={{ textDecoration: 'none' }}>
              <div style={{ 
                backgroundColor: 'white', padding: '18px 14px', borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #e8eaed',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px',
                minHeight: '110px', transition: 'box-shadow 0.2s'
              }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '50%', backgroundColor: btn.bg, color: btn.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={btn.icon}/>
                  </svg>
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#202124', textAlign: 'center', lineHeight: 1.3 }}>{btn.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        body { margin: 0; background-color: #f3f4f6; }
      `}} />
    </div>
  );
}
