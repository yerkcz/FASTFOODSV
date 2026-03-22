/**
 * Hideaway POS — Shared Time Utilities
 * 
 * Single source of truth for all timestamp parsing and formatting.
 * PostgreSQL may return:
 *   - TIME only:         "15:07:46.910709"      → prepend today's UTC date
 *   - TIMESTAMP no TZ:  "2026-03-21 18:55:00"  → add T and Z
 *   - ISO with TZ:      "2026-03-21T18:55:00Z" → parse directly
 */

/**
 * Normalises any DB time/datetime string to a valid UTC Date.
 */
export function parseHora(s: string | null | undefined): Date {
  if (!s || typeof s !== "string") return new Date(NaN);

  // Full timestamp (has a date part with dashes)
  if (s.includes("-") && s.includes(":")) {
    const withT = s.includes("T") ? s : s.replace(" ", "T");
    const withZ = /[Z+\-]\d{2}$/.test(withT) ? withT : withT + "Z";
    return new Date(withZ);
  }

  // TIME-only string: "HH:MM:SS" or "HH:MM:SS.ffffff"
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const todayUTC = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return new Date(`${todayUTC}T${s}Z`);
  }

  return new Date(NaN);
}

/**
 * Format a DB timestamp to Costa Rica local time (HH:MM am/pm).
 */
export function formatTime(hora: string | null | undefined): string {
  const d = parseHora(hora ?? "");
  if (isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("es-CR", {
    timeZone: "America/Costa_Rica",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Minutes elapsed since hora_registro (UTC-based).
 */
export function getElapsedMins(hora: string | null | undefined): number {
  const d = parseHora(hora ?? "");
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

/**
 * Format Rules — 5-level color system.
 * < 15 min  → Green  (fresh)
 * 15–29 min → Blue   (in progress)
 * 30–34 min → Yellow (attention)
 * 35–39 min → Orange (urgent)
 * ≥ 40 min  → Red    (critical)
 */
export function getTimeColor(hora: string | null | undefined): string {
  const mins = getElapsedMins(hora);
  if (mins >= 40) return "#d93025";
  if (mins >= 35) return "#e37400";
  if (mins >= 30) return "#f9ab00";
  if (mins >= 15) return "#1a73e8";
  return "#1e8e3e";
}

/**
 * Background color for row highlight when urgent.
 */
export function getTimeBg(hora: string | null | undefined): string {
  const mins = getElapsedMins(hora);
  if (mins >= 40) return "#fce8e6";
  if (mins >= 35) return "#fef3e2";
  if (mins >= 30) return "#fef9e7";
  return "transparent";
}

/**
 * Urgency badge text (null = no badge needed).
 */
export function getUrgencyBadge(hora: string | null | undefined): string | null {
  const mins = getElapsedMins(hora);
  if (mins >= 40) return "🔴 CRÍTICO";
  if (mins >= 35) return "⚠️ URGENTE";
  return null;
}

/**
 * Elapsed label: "5m", "1h 20m"
 */
export function getElapsedLabel(hora: string | null | undefined): string {
  const mins = getElapsedMins(hora);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
