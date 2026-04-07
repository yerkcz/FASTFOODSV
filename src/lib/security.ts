// Simple in-memory rate limiter
import { timingSafeEqual } from 'crypto';

const rateLimits = new Map<string, { count: number; resetTime: number }>();

// Define operating hours for the restaurant (Costa Rica timezone)
const OPERATING_HOURS = {
    open: 5,  // 5:00 AM (Temporalmente para hacer pruebas)
    close: 21 // 9:00 PM (21:00)
};

export function checkOperatingHours(): { isOpen: boolean; currentHourCR: number } {
    // Get current time in Costa Rica timezone
    const nowStr = new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" });
    const now = new Date(nowStr);

    // We use getHours() from the CR localized date string
    const currentHourCR = now.getHours();

    const isOpen = currentHourCR >= OPERATING_HOURS.open && currentHourCR < OPERATING_HOURS.close;
    return { isOpen, currentHourCR };
}

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

// Timing-safe string comparison to prevent timing attacks
export function timingSafeCompare(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }

    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
        return false;
    }

    try {
        return timingSafeEqual(bufA, bufB);
    } catch {
        return bufA.equals(bufB);
    }
}

// =====================================================
// Guest Token Functions
// =====================================================

interface GuestTokenPayload {
    mesa: string;
    ordenNu: string;
}

export async function generateGuestToken(mesa: string, ordenNu: string): Promise<string> {
    const secret = process.env.PARTY_PIN_SECRET || 'fallback-secret-123';

    const payload: GuestTokenPayload = {
        mesa,
        ordenNu,
    };

    const payloadStr = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const key = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const data = encoder.encode(payloadStr);
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    const sigArray = new Uint8Array(signature);
    return btoa(String.fromCharCode(...sigArray));
}

export async function validateGuestToken(
    guestToken: string,
    mesa: string,
    ordenNu: string
): Promise<boolean> {
    const secret = process.env.PARTY_PIN_SECRET || 'fallback-secret-123';

    try {
        const payload: GuestTokenPayload = {
            mesa,
            ordenNu,
        };

        const encoder = new TextEncoder();
        const key = encoder.encode(secret);
        const payloadStr = JSON.stringify(payload);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const data = encoder.encode(payloadStr);
        
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
        const sigArray = new Uint8Array(signature);
        const expectedToken = btoa(String.fromCharCode(...sigArray));

        return timingSafeCompare(guestToken, expectedToken);
    } catch {
        return false;
    }
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
    const validKey = process.env.SELF_ORDER_API_KEY || process.env.NEXT_PUBLIC_SELF_ORDER_API_KEY;
    if (!validKey) {
        console.error("SELF_ORDER_API_KEY is not configured in environment.");
        return false;
    }
    if (!key) return false;
    return timingSafeCompare(key, validKey);
}

// Type to describe expected order payload
export interface OrderPayloadItem {
    name: string;
    price: number;
    quantity: number;
    notas?: string;
}

export interface OrderPayload {
    mesa: string;
    cliente?: string;
    session_token?: string;
    guest_token?: string;
    items: OrderPayloadItem[];
}

// Validate the structure of the incoming order payload
export function validateOrderPayload(body: unknown): { valid: boolean; error?: string; data?: OrderPayload } {
    if (!body || typeof body !== "object") return { valid: false, error: "Invalid body format" };

    const record = body as Record<string, unknown>;
    const { mesa, cliente, session_token, guest_token, items } = record;

    if (!mesa || typeof mesa !== "string" || mesa.length > 50) {
        return { valid: false, error: "Invalid or missing 'mesa'" };
    }

    if (cliente !== undefined && (typeof cliente !== "string" || cliente.length > 100)) {
        return { valid: false, error: "Invalid 'cliente' format or length" };
    }

    if (session_token !== undefined) {
        if (typeof session_token !== "string" || session_token.length > 36) {
            return { valid: false, error: "Invalid 'session_token' format or length" };
        }
    }

    if (guest_token !== undefined) {
        if (typeof guest_token !== "string" || guest_token.length > 100) {
            return { valid: false, error: "Invalid 'guest_token' format or length" };
        }
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
        return { valid: false, error: "Invalid 'items' array. Must contain 1-50 items." };
    }

    const typedItems = items as Record<string, unknown>[];
    for (const item of typedItems) {
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
            session_token: session_token || undefined,
            guest_token: guest_token || undefined,
            items: items.map(item => ({
                name: sanitize(item.name, 100),
                price: Number(item.price),
                quantity: Math.floor(item.quantity),
                notas: typeof (item as Record<string, unknown>).notas === 'string' 
                    ? sanitize((item as Record<string, unknown>).notas as string, 200) 
                    : undefined
            }))
        }
    };
}
