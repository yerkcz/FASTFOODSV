import { NextResponse } from 'next/server';
import { cache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';
import { validateApiKey } from '@/lib/security';

export async function GET(request: Request) {
  const apiKey = request.headers.get('x-api-key');
  if (!validateApiKey(apiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = cache.getStats();
  
  const getCacheInfo = (key: string, ttlSec: number) => {
    const cached = cache.get(key);
    return {
      cached: cached !== null,
      ttl: ttlSec,
      key
    };
  };

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    stats: {
      menu: {
        hits: stats.menu.hits,
        misses: stats.menu.misses,
        hitRate: stats.menu.hits + stats.menu.misses > 0 
          ? Math.round((stats.menu.hits / (stats.menu.hits + stats.menu.misses)) * 100) + '%'
          : '0%'
      },
      kitchen: {
        hits: stats.kitchen.hits,
        misses: stats.kitchen.misses,
        hitRate: stats.kitchen.hits + stats.kitchen.misses > 0 
          ? Math.round((stats.kitchen.hits / (stats.kitchen.hits + stats.kitchen.misses)) * 100) + '%'
          : '0%'
      },
      tables: {
        hits: stats.tables.hits,
        misses: stats.tables.misses,
        hitRate: stats.tables.hits + stats.tables.misses > 0 
          ? Math.round((stats.tables.hits / (stats.tables.hits + stats.tables.misses)) * 100) + '%'
          : '0%'
      }
    },
    cacheInfo: {
      menu: getCacheInfo(CACHE_KEYS.MENU, CACHE_TTL.MENU / 1000),
      kitchen: getCacheInfo(CACHE_KEYS.KITCHEN_ORDERS, CACHE_TTL.KITCHEN_ORDERS / 1000),
      tables: getCacheInfo(CACHE_KEYS.TABLES_OPEN, CACHE_TTL.TABLES / 1000)
    },
    note: '⚠️ Esta API es solo para debugging. Deshabilitar en producción.'
  });
}

export async function POST(request: Request) {
  const apiKey = request.headers.get('x-api-key');
  if (!validateApiKey(apiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  cache.resetStats();
  return NextResponse.json({ 
    success: true, 
    message: 'Stats reseteados a cero',
    timestamp: new Date().toISOString()
  });
}
