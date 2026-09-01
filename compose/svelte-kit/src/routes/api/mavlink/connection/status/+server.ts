/**
 * Connection Status API
 * 
 * Lightweight endpoint for polling connection status
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getTransportStatus, linkAlive } from '$lib/server/mavlink';

/**
 * GET /api/mavlink/connection/status
 * Get current connection status (lighter than full connection info)
 */
export const GET: RequestHandler = async () => {
    try {
        const status = getTransportStatus();
        const alive = linkAlive();
        
        return json({
            ...status,
            alive,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Failed to get connection status:', error);
        return json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
};
