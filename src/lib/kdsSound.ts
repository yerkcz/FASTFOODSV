"use client";

import { useEffect } from "react";

// Alerta sonora de comanda nueva para el KDS.
//
// ponytail: oscillator de WebAudio, 0 archivos de audio y 0 dependencias.
// Antes no habia sonido real — `soundEnabled` era solo el flag del splash.
//
// Los navegadores bloquean el audio hasta que hay un gesto del usuario, asi
// que `unlock()` se llama desde el boton "Iniciar Tablero" del splash.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** Llamar desde un click del usuario. Habilita el audio para el resto de la sesion. */
export function unlock(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

/** Dos tonos cortos. Silencioso si el navegador no dejo reproducir audio. */
export function beep(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  const now = c.currentTime;
  const tone = (freq: number, at: number) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Envolvente para que no clipee
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.2);
  };

  tone(880, now);
  tone(1174, now + 0.22);
}

/**
 * Habilita el audio con el primer toque/tecla del usuario.
 * Para las pantallas KDS que no tienen splash (bebidas frias/calientes) y por
 * lo tanto no tienen ningun gesto de usuario donde desbloquear el contexto.
 */
export function useUnlockOnFirstGesture(): void {
  useEffect(() => {
    const go = () => {
      unlock();
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
    };
    window.addEventListener("pointerdown", go);
    window.addEventListener("keydown", go);
    return () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
    };
  }, []);
}
