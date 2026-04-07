/**
 * useAdaptivePolling — Hook de polling inteligente para Hideaway KDS
 * 
 * Ajusta dinámicamente la frecuencia de polling basándose en:
 * 1. Si hay items pendientes (más frecuente) o no (menos frecuente)
 * 2. Si la pestaña del navegador está visible o en background
 * 
 * Esto reduce drásticamente las consultas a la DB cuando la pantalla
 * está inactiva o sin pedidos pendientes.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

interface AdaptivePollingOptions {
  /** Intervalo cuando hay items pendientes y tab visible (ms) */
  activeIntervalMs: number;
  /** Intervalo cuando NO hay items pendientes (ms) */
  idleIntervalMs: number;
  /** Intervalo cuando la pestaña está en background (ms) */
  backgroundIntervalMs: number;
  /** Si hay datos pendientes actualmente */
  hasActiveData: boolean;
}

export function useAdaptivePolling(
  fetchFn: () => Promise<void>,
  options: AdaptivePollingOptions
) {
  const { activeIntervalMs, idleIntervalMs, backgroundIntervalMs, hasActiveData } = options;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isBackground, setIsBackground] = useState(false);

  // Detectar visibility change
  useEffect(() => {
    const handleVisibility = () => {
      setIsBackground(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Calcular intervalo actual
  const currentInterval = isBackground
    ? backgroundIntervalMs
    : hasActiveData
      ? activeIntervalMs
      : idleIntervalMs;

  // Manejar el polling con intervalo dinámico
  useEffect(() => {
    // Limpiar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Crear nuevo intervalo con la frecuencia actualizada
    intervalRef.current = setInterval(fetchFn, currentInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchFn, currentInterval]);

  // Fetch inmediato cuando la pestaña vuelve a estar visible
  const prevIsBackground = useRef(isBackground);
  useEffect(() => {
    if (prevIsBackground.current && !isBackground) {
      // Tab acaba de volver a ser visible => fetch inmediato
      fetchFn();
    }
    prevIsBackground.current = isBackground;
  }, [isBackground, fetchFn]);

  return { isBackground, currentInterval };
}
