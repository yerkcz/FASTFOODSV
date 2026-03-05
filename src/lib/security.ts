// Simple in-memory rate limiter
const rateLimits = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(ip: string, maxRequests: number = 10, windowMs: number = 60000): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const record = rateLimits.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
        record.count = 0;
        record.resetTime = now + windowMs;
    }

    record.count += 1;
    rateLimits.set(ip, record);

    return {
        allowed: record.count <= maxRequests,
        remaining: Math.max(0, maxRequests - record.count),
    };
}

// Basic string sanitization to prevent XSS and limit length
export function sanitize(str: string, maxLength: number = 200): string {
    if (!str) return "";
    // Strip control characters and basic HTML tags
    const clean = str.replace(/[<>]/g, "").trim();
    return clean.substring(0, maxLength);
}

// Ensure the API key is valid
export function validateApiKey(key: string | null): boolean {
    const validKey = process.env.SELF_ORDER_API_KEY;
    if (!validKey) {
        console.error("SELF_ORDER_API_KEY is not configured in environment.");
        return false;
    }
    return key === validKey;
}

// Type to describe expected order payload
export interface OrderPayloadItem {
    name: string;
    price: number;
    quantity: number;
}

export interface OrderPayload {
    mesa: string;
    cliente?: string;
    notas?: string;
    items: OrderPayloadItem[];
}

// Validate the structure of the incoming order payload
export function validateOrderPayload(body: any): { valid: boolean; error?: string; data?: OrderPayload } {
    if (!body || typeof body !== "object") return { valid: false, error: "Invalid body format" };

    const { mesa, cliente, notas, items } = body;

    if (!mesa || typeof mesa !== "string" || mesa.length > 50) {
        return { valid: false, error: "Invalid or missing 'mesa'" };
    }

    if (cliente !== undefined && (typeof cliente !== "string" || cliente.length > 100)) {
        return { valid: false, error: "Invalid 'cliente' format or length" };
    }

    if (notas !== undefined && (typeof notas !== "string" || notas.length > 200)) {
        return { valid: false, error: "Invalid 'notas' format or length" };
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
        return { valid: false, error: "Invalid 'items' array. Must contain 1-50 items." };
    }

    for (const item of items) {
        if (!item.name || typeof item.name !== "string" || item.name.length > 100) {
            return { valid: false, error: "Invalid item name" };
        }
        if (typeof item.quantity !== "number" || item.quantity < 1 || item.quantity > 50) {
            return { valid: false, error: "Invalid item quantity (must be 1-50)" };
        }
    }

    // Return the sanitised payload
    return {
        valid: true,
        data: {
            mesa: sanitize(mesa, 50),
            cliente: cliente ? sanitize(cliente, 100) : "",
            notas: notas ? sanitize(notas, 200) : "",
            items: items.map(item => ({
                name: sanitize(item.name, 100),
                price: Number(item.price), // Price will be verified vs DB later, but keep it in payload
                quantity: Math.floor(item.quantity)
            }))
        }
    };
}
