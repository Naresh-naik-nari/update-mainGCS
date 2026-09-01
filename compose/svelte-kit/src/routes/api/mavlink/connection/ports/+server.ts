/**
 * Serial Ports Discovery API
 * 
 * Endpoints for listing and detecting available serial ports
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import {
    getAvailableSerialPorts,
    triggerSerialDetection
} from '$lib/server/mavlink';

/**
 * GET /api/mavlink/connection/ports
 * List all available serial ports on the system
 */
export const GET: RequestHandler = async () => {
    try {
        const ports = await getAvailableSerialPorts();
        
        return json({
            ports,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Failed to list serial ports:', error);
        return json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
};

/**
 * POST /api/mavlink/connection/ports/detect
 * Trigger MAVLink serial port auto-detection
 * 
 * This actively probes serial ports for MAVLink traffic
 */
export const POST: RequestHandler = async () => {
    try {
        const detected = await triggerSerialDetection();
        
        if (detected) {
            return json({
                success: true,
                detected: {
                    path: detected.path,
                    baudRate: detected.baudRate
                },
                message: `Detected MAVLink on ${detected.path} at ${detected.baudRate} baud`
            });
        } else {
            return json({
                success: false,
                detected: null,
                message: 'No MAVLink serial port detected'
            });
        }
    } catch (error) {
        console.error('Failed to detect serial ports:', error);
        return json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
};
