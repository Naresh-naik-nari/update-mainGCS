/**
 * MAVLink Connection Management API
 * 
 * Endpoints for configuring and managing MAVLink transport connections
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import {
    getConnectionSettings,
    updateConnectionSettings,
    getTransportStatus,
    forceReconnect
} from '$lib/server/mavlink';
import type { ConnectionSettings } from '$lib/server/mavlink-connection-config';

/**
 * GET /api/mavlink/connection
 * Returns current connection configuration and status
 */
export const GET: RequestHandler = async () => {
    try {
        const [settings, status] = await Promise.all([
            getConnectionSettings(),
            Promise.resolve(getTransportStatus())
        ]);
        
        return json({
            settings,
            status,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Failed to get connection info:', error);
        return json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
};

/**
 * POST /api/mavlink/connection
 * Update connection settings
 * 
 * Body parameters:
 * - settings: Partial<ConnectionSettings> - settings to update
 * - reconnect: boolean - whether to reconnect immediately (default: false)
 */
export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { settings, reconnect = false } = body;
        
        if (!settings || typeof settings !== 'object') {
            return json(
                { error: 'Invalid settings object' },
                { status: 400 }
            );
        }
        
        await updateConnectionSettings(settings as Partial<ConnectionSettings>, reconnect);
        
        const [updatedSettings, status] = await Promise.all([
            getConnectionSettings(),
            Promise.resolve(getTransportStatus())
        ]);
        
        return json({
            success: true,
            settings: updatedSettings,
            status,
            message: reconnect ? 'Settings updated and reconnecting' : 'Settings updated'
        });
    } catch (error) {
        console.error('Failed to update connection settings:', error);
        return json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
};

/**
 * DELETE /api/mavlink/connection
 * Disconnect current connection (force reconnect will happen via supervisor)
 */
export const DELETE: RequestHandler = async () => {
    try {
        // Force reconnect triggers a disconnect and immediate reconnection
        forceReconnect();
        
        return json({
            success: true,
            message: 'Connection reset triggered'
        });
    } catch (error) {
        console.error('Failed to reset connection:', error);
        return json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
};
