"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevaComandaPage() {
  const router = useRouter();
  const [mesa, setMesa] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"Restaurante" | "Llevar">("Restaurante");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!mesa.trim()) {
      setError(tipo === "Restaurante" 
        ? "El número de mesa es obligatorio." 
        : "El nombre del cliente es obligatorio.");
      return;
    }

    const encodedMesa = encodeURIComponent(mesa.trim());
    const encodedNombre = nombre.trim() ? `&nombre=${encodeURIComponent(nombre.trim())}` : "";
    router.push(`/?mesa=${encodedMesa}${encodedNombre}&waiter_mode=true`);
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6", fontFamily: "Roboto, sans-serif" }}>
      {/* TOP APP BAR */}
      <header style={{ 
        position: 'fixed', top: 0, left: 0, right: 0, height: '56px',
        backgroundColor: '#1a73e8', color: 'white', display: 'flex', alignItems: 'center',
        padding: '0 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 1000, gap: '16px'
      }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 500 }}>Nueva Comanda</div>
      </header>

      <div style={{ paddingTop: '72px', paddingBottom: '90px', maxWidth: '500px', margin: '0 auto', padding: '72px 16px 90px' }}>
        
        <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          
          {/* TIPO: Restaurante / Llevar */}
          <div style={{ padding: '16px', borderBottom: '1px solid #f1f3f4' }}>
            <div style={{ fontSize: '0.75rem', color: '#5f6368', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 500 }}>Tipo</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {["Restaurante", "Llevar"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTipo(t as any); setMesa(""); }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '4px', fontSize: '0.9375rem', fontWeight: 500,
                    border: '1px solid', cursor: 'pointer', transition: 'all 0.2s',
                    ...(tipo === t 
                      ? { backgroundColor: '#e8f0fe', color: '#1a73e8', borderColor: '#1a73e8' }
                      : { backgroundColor: 'white', color: '#5f6368', borderColor: '#dadce0' })
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* MESA / CLIENTE */}
          <div style={{ padding: '16px', borderBottom: '1px solid #f1f3f4' }}>
            <div style={{ fontSize: '0.75rem', color: '#5f6368', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 500 }}>
              {tipo === "Llevar" ? "Cliente" : "Mesa N°"} *
            </div>
            <input
              type="text"
              placeholder={tipo === "Llevar" ? "Nombre del cliente..." : "Ej: 10, Barra, VIP..."}
              value={mesa}
              onChange={(e) => setMesa(e.target.value)}
              autoComplete="off"
              autoFocus
              style={{ 
                width: '100%', padding: '12px', fontSize: '1.125rem', border: '1px solid #dadce0', 
                borderRadius: '4px', outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s'
              }}
            />
            <div style={{ fontSize: '0.75rem', color: '#9aa0a6', marginTop: '6px' }}>
              {tipo === "Restaurante" 
                ? "Pedidos con el mismo número de mesa se agrupan automáticamente."
                : "Se creará una orden para llevar."}
            </div>
          </div>

          {/* NOMBRE — Optional */}
          {tipo === "Restaurante" && (
            <div style={{ padding: '16px', borderBottom: '1px solid #f1f3f4' }}>
              <div style={{ fontSize: '0.75rem', color: '#5f6368', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 500 }}>
                Nombre (opcional)
              </div>
              <input
                type="text"
                placeholder="Nombre del cliente..."
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="off"
                style={{ 
                  width: '100%', padding: '12px', fontSize: '1rem', border: '1px solid #dadce0', 
                  borderRadius: '4px', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div style={{ padding: '12px 16px', backgroundColor: '#fce8e6', color: '#d93025', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          {/* SUBMIT */}
          <div style={{ padding: '16px' }}>
            <button
              type="submit"
              style={{ 
                width: '100%', padding: '14px', backgroundColor: '#1a73e8', color: 'white',
                border: 'none', borderRadius: '4px', fontSize: '0.9375rem', fontWeight: 500,
                letterSpacing: '0.25px', textTransform: 'uppercase', cursor: 'pointer'
              }}
            >
              COMANDAR →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
