/**
 * MAVLink List Serial Ports API
 * 
 * Endpoint for listing available serial ports
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getAvailableSerialPorts } from '$lib/server/mavlink';

/**
 * POST /api/mavlink/list_ports
 * Returns list of available serial ports with device information
 */
export const POST: RequestHandler = async () => {
    try {
        const ports = await getAvailableSerialPorts();
        
        // Transform to match the expected interface
        const portList = ports.map(port => ({
            path: port.path,
            manufacturer: port.manufacturer,
            serialNumber: port.serialNumber,
            vendorId: port.vendorId,
            productId: port.productId
        }));
        
        return json(portList);
    } catch (error) {
        console.error('Failed to list serial ports:', error);
        return json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
};
