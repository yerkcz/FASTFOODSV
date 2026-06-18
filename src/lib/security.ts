export function sanitize(str: string, maxLength: number = 200): string {
    if (!str) return "";
    const clean = str.replace(/[<>]/g, "").trim();
    return clean.substring(0, maxLength);
}
