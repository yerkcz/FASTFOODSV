/**
 * Fast Food San Vicente POS — Shared Time Utilities
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
    const hasTZ = withT.endsWith("Z") || /[+-]\d{2}(:\d{2})?$/.test(withT);
    const withZ = hasTZ ? withT : withT + "Z";
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
 * Format Rules — 4-level color system (confirmed by restaurant).
 * < 30 min  → Green  (fresh, all good)
 * 30–34 min → Yellow (getting slow)
 * 35–39 min → Orange (urgent)
 * ≥ 40 min  → Red    (critical — must act now)
 */
export function getTimeColor(hora: string | null | undefined): string {
  const mins = getElapsedMins(hora);
  if (mins >= 40) return "#d93025";
  if (mins >= 35) return "#e37400";
  if (mins >= 30) return "#f9ab00";
  return "#1e8e3e";
}

/**
 * Background color for row highlight when urgent.
 * Uses semi-transparent tints so it works on both light and dark themes
 * without washing out text (project enforces permanent dark mode).
 */
export function getTimeBg(hora: string | null | undefined): string {
  const mins = getElapsedMins(hora);
  if (mins >= 40) return "rgba(217, 48, 37, 0.18)";
  if (mins >= 35) return "rgba(227, 116, 0, 0.18)";
  if (mins >= 30) return "rgba(249, 171, 0, 0.15)";
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
