/**
 * MAVLink Connect API
 * 
 * Endpoint for establishing MAVLink connection with specified transport
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { updateConnectionSettings } from '$lib/server/mavlink';
import type { ConnectionSettings } from '$lib/server/mavlink-connection-config';

interface ConnectionConfig {
    type: 'serial' | 'tcp' | 'udp';
    port?: string;
    host?: string;
    portNumber?: number;
    bindPort?: number;
}

/**
 * POST /api/mavlink/connect
 * Connect to MAVLink device with specified configuration
 * 
 * Body parameters:
 * - type: 'serial' | 'tcp' | 'udp'
 * - port: string (for serial)
 * - host: string (for tcp/udp)
 * - portNumber: number (for tcp/udp)
 * - bindPort: number (for udp)
 */
export const POST: RequestHandler = async ({ request }) => {
    try {
        const config: ConnectionConfig = await request.json();
        
        if (!config.type) {
            return json(
                { error: 'Connection type is required' },
                { status: 400 }
            );
        }
        
        // Build settings object based on connection type
        let settings: Partial<ConnectionSettings>;
        
        switch (config.type) {
            case 'serial':
                if (!config.port) {
                    return json(
                        { error: 'Serial port is required for serial connection' },
                        { status: 400 }
                    );
                }
                settings = {
                    transportType: 'serial',
                    serialPath: config.port,
                    serialAutoDetect: false,
                    serialBaud: 115200 // Default baud rate
                };
                break;
                
            case 'tcp':
                if (!config.host || !config.portNumber) {
                    return json(
                        { error: 'Host and port are required for TCP connection' },
                        { status: 400 }
                    );
                }
                settings = {
                    transportType: 'tcp',
                    tcpHost: config.host,
                    tcpPort: config.portNumber
                };
                break;
                
            case 'udp':
                if (!config.host || !config.portNumber) {
                    return json(
                        { error: 'Host and port are required for UDP connection' },
                        { status: 400 }
                    );
                }
                settings = {
                    transportType: 'udp',
                    udpMode: 'client',
                    udpHost: config.host,
                    udpPort: config.portNumber,
                    udpBindHost: config.bindPort ? `0.0.0.0` : '0.0.0.0'
                };
                
                // If bindPort specified, use server mode
                if (config.bindPort) {
                    settings.udpMode = 'server';
                    settings.udpPort = config.bindPort;
                }
                break;
                
            default:
                return json(
                    { error: `Unsupported connection type: ${config.type}` },
                    { status: 400 }
                );
        }
        
        // Update settings and trigger reconnection
        await updateConnectionSettings(settings, true);
        
        return json({
            success: true,
            message: `Connecting via ${config.type}...`,
            config
        });
    } catch (error) {
        console.error('Failed to connect:', error);
        return json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
};
