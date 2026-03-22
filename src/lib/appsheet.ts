const APP_ID = process.env.APPSHEET_APP_ID;
const ACCESS_KEY = process.env.APPSHEET_ACCESS_KEY;

/**
 * Makes a request to the AppSheet API.
 * Used to force cache refresh (Find) so AppSheet picks up 
 * data inserted directly into Neon PostgreSQL.
 */
async function appSheetRequest(tableName: string, action: string) {
    if (!APP_ID || !ACCESS_KEY) {
        console.warn('AppSheet credentials not configured — skipping sync');
        return { success: false, error: 'AppSheet not configured' };
    }

    const url = `https://api.appsheet.com/api/v2/apps/${APP_ID}/tables/${tableName}/Action`;

    const payload = {
        Action: action,
        Properties: {
            Locale: 'es-CR',
            Timezone: 'America/Costa_Rica'
        },
        Rows: []
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'applicationAccessKey': ACCESS_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`AppSheet ${action} error for ${tableName}:`, response.status, errorText);
            return { success: false, error: `AppSheet error: ${response.status}` };
        }

        return { success: true };
    } catch (error) {
        console.error(`AppSheet request failed for ${tableName}:`, error);
        return { success: false, error: 'AppSheet request failed' };
    }
}

/**
 * Forces AppSheet to refresh its cache for CLIENTES and PEDIDOS tables.
 * 
 * Since AppSheet reads directly from Neon PostgreSQL (Data Source: database-1),
 * we do NOT need to insert data via the API (that would create duplicates).
 * Instead, we use the "Find" action which forces AppSheet to re-read from the DB,
 * making new orders appear instantly without manual refresh.
 */
export async function refreshAppSheetCache(): Promise<{ success: boolean }> {
    try {
        const [clientesResult, pedidosResult] = await Promise.all([
            appSheetRequest('CLIENTES', 'Find'),
            appSheetRequest('PEDIDOS', 'Find')
        ]);

        const success = clientesResult.success && pedidosResult.success;

        if (success) {
            console.log('✅ AppSheet cache refreshed successfully');
        } else {
            console.warn('⚠️ AppSheet cache refresh partially failed:', { clientesResult, pedidosResult });
        }

        return { success };
    } catch (error) {
        console.error('❌ AppSheet cache refresh FAILED:', error);
        return { success: false };
    }
}
