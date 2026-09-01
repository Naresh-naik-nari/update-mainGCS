/**
 * MAVLink Connection Configuration Management
 * 
 * Handles persistence and retrieval of connection settings from the database
 */

import { getSetting, setSetting, getSettings } from './settings';
import type { TransportConfig, TransportType, UDPMode } from './mavlink-transport';

const CONFIG_PREFIX = 'mavlink.connection.';

export interface ConnectionSettings {
    // Transport type
    transportType: TransportType;
    
    // Serial settings
    serialPath: string;
    serialBaud: number;
    serialAutoDetect: boolean;
    
    // TCP settings
    tcpHost: string;
    tcpPort: number;
    
    // UDP settings
    udpMode: UDPMode;
    udpHost: string;
    udpPort: number;
    udpBindHost: string;
}

/**
 * Default connection settings based on environment
 */
export function getDefaultConnectionSettings(): ConnectionSettings {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
        transportType: isProduction ? 'serial' : 'tcp',
        
        // Serial defaults
        serialPath: process.env.MAVLINK_SERIAL_PATH || '',
        serialBaud: Number(process.env.MAVLINK_BAUD || 115200),
        serialAutoDetect: !process.env.MAVLINK_SERIAL_PATH, // Auto-detect if no path configured
        
        // TCP defaults (for SITL development)
        tcpHost: process.env.MAVLINK_TCP_HOST || 'sitl',
        tcpPort: Number(process.env.MAVLINK_TCP_PORT || 5760),
        
        // UDP defaults
        udpMode: (process.env.MAVLINK_UDP_MODE as UDPMode) || 'server',
        udpHost: process.env.MAVLINK_UDP_HOST || '127.0.0.1',
        udpPort: Number(process.env.MAVLINK_UDP_PORT || 14550),
        udpBindHost: process.env.MAVLINK_UDP_BIND_HOST || '0.0.0.0'
    };
}

/**
 * Load connection settings from database (with env fallback)
 */
export async function loadConnectionSettings(): Promise<ConnectionSettings> {
    const defaults = getDefaultConnectionSettings();
    const stored = await getSettings(CONFIG_PREFIX);
    
    return {
        transportType: (stored[`${CONFIG_PREFIX}transportType`] as TransportType) || defaults.transportType,
        
        serialPath: stored[`${CONFIG_PREFIX}serialPath`] || defaults.serialPath,
        serialBaud: Number(stored[`${CONFIG_PREFIX}serialBaud`] || defaults.serialBaud),
        serialAutoDetect: stored[`${CONFIG_PREFIX}serialAutoDetect`] === 'true' || defaults.serialAutoDetect,
        
        tcpHost: stored[`${CONFIG_PREFIX}tcpHost`] || defaults.tcpHost,
        tcpPort: Number(stored[`${CONFIG_PREFIX}tcpPort`] || defaults.tcpPort),
        
        udpMode: (stored[`${CONFIG_PREFIX}udpMode`] as UDPMode) || defaults.udpMode,
        udpHost: stored[`${CONFIG_PREFIX}udpHost`] || defaults.udpHost,
        udpPort: Number(stored[`${CONFIG_PREFIX}udpPort`] || defaults.udpPort),
        udpBindHost: stored[`${CONFIG_PREFIX}udpBindHost`] || defaults.udpBindHost
    };
}

/**
 * Save connection settings to database
 */
export async function saveConnectionSettings(settings: Partial<ConnectionSettings>): Promise<void> {
    const savePromises: Promise<void>[] = [];
    
    if (settings.transportType !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}transportType`, settings.transportType));
    }
    
    if (settings.serialPath !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}serialPath`, settings.serialPath));
    }
    
    if (settings.serialBaud !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}serialBaud`, String(settings.serialBaud)));
    }
    
    if (settings.serialAutoDetect !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}serialAutoDetect`, String(settings.serialAutoDetect)));
    }
    
    if (settings.tcpHost !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}tcpHost`, settings.tcpHost));
    }
    
    if (settings.tcpPort !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}tcpPort`, String(settings.tcpPort)));
    }
    
    if (settings.udpMode !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}udpMode`, settings.udpMode));
    }
    
    if (settings.udpHost !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}udpHost`, settings.udpHost));
    }
    
    if (settings.udpPort !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}udpPort`, String(settings.udpPort)));
    }
    
    if (settings.udpBindHost !== undefined) {
        savePromises.push(setSetting(`${CONFIG_PREFIX}udpBindHost`, settings.udpBindHost));
    }
    
    await Promise.all(savePromises);
}

/**
 * Build a TransportConfig from ConnectionSettings
 */
export function buildTransportConfig(settings: ConnectionSettings): TransportConfig {
    switch (settings.transportType) {
        case 'serial':
            return {
                type: 'serial',
                path: settings.serialPath,
                baudRate: settings.serialBaud
            };
            
        case 'tcp':
            return {
                type: 'tcp',
                host: settings.tcpHost,
                port: settings.tcpPort
            };
            
        case 'udp':
            return {
                type: 'udp',
                mode: settings.udpMode,
                host: settings.udpMode === 'client' ? settings.udpHost : undefined,
                port: settings.udpPort,
                bindHost: settings.udpMode === 'server' ? settings.udpBindHost : undefined
            };
            
        default:
            throw new Error(`Unknown transport type: ${settings.transportType}`);
    }
}

/**
 * Check if MAVLink should be enabled based on configuration
 */
export function shouldEnableMAVLink(settings: ConnectionSettings): boolean {
    // In development, empty TCP host means MAVLink is disabled (MSP-only mode)
    if (process.env.NODE_ENV !== 'production' && settings.transportType === 'tcp') {
        return settings.tcpHost !== '';
    }
    
    // In production with serial, must have a path or auto-detect enabled
    if (settings.transportType === 'serial') {
        return settings.serialPath !== '' || settings.serialAutoDetect;
    }
    
    // TCP and UDP are always enabled if selected
    return true;
}
