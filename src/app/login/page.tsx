'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pin.trim() || loading) return;

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error || 'No se pudo iniciar sesión');
        return;
      }

      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/inicio');
      router.refresh();
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--background)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-roboto), Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: '18px',
          padding: '32px 24px',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Image
            src="/logo.svg"
            alt="easystem"
            width={64}
            height={64}
            style={{ borderRadius: '50%', margin: '0 auto 14px' }}
            priority
          />
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>easystem</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '6px' }}>
            Ingresá el PIN de administración
          </p>
        </div>

        <form onSubmit={submit}>
          <label
            htmlFor="pin"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '8px' }}
          >
            PIN
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={32}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            autoFocus
            placeholder="••••"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '1.3rem',
              letterSpacing: '8px',
              textAlign: 'center',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--surface-border)',
              borderRadius: '10px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '10px' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !pin.trim()}
            style={{
              width: '100%',
              marginTop: '18px',
              padding: '14px',
              borderRadius: '10px',
              border: 'none',
              background: pin.trim() ? 'var(--primary)' : 'var(--surface-border)',
              color: 'white',
              fontSize: '0.95rem',
              fontWeight: 800,
              cursor: pin.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'VERIFICANDO…' : 'INGRESAR'}
          </button>
        </form>

        <p style={{ marginTop: '18px', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          La sesión dura 12 horas en este dispositivo.
        </p>
      </div>
    </main>
  );
}
