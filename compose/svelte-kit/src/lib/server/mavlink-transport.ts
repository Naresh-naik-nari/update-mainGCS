/**
 * MAVLink Transport Abstraction Layer
 * 
 * Provides a unified interface for MAVLink communication over different transports:
 * - Serial (USB/UART)
 * - TCP (for SITL and network bridges)
 * - UDP (for telemetry radios and wireless links)
 */

import { SerialPort } from 'serialport';
import { Socket, connect } from 'net';
import { createSocket, Socket as UDPSocket } from 'dgram';
import { EventEmitter } from 'events';
import { existsSync, readdirSync, realpathSync } from 'node:fs';

// Transport types
export type TransportType = 'serial' | 'tcp' | 'udp';
export type UDPMode = 'client' | 'server';

// Configuration interfaces
export interface SerialConfig {
    type: 'serial';
    path: string;
    baudRate: number;
}

export interface TCPConfig {
    type: 'tcp';
    host: string;
    port: number;
}

export interface UDPConfig {
    type: 'udp';
    mode: UDPMode;
    // Client mode: connect to this host:port
    host?: string;
    port: number;
    // Server mode: bind to this port (host optional, defaults to 0.0.0.0)
    bindHost?: string;
}

export type TransportConfig = SerialConfig | TCPConfig | UDPConfig;

// Transport state
export type TransportState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Events emitted by transports
export interface TransportEvents {
    data: (buffer: Buffer) => void;
    connected: () => void;
    disconnected: () => void;
    error: (error: Error) => void;
    stateChange: (state: TransportState) => void;
}

/**
 * Base transport interface - all transports implement this
 */
export interface MAVLinkTransport extends EventEmitter {
    readonly config: TransportConfig;
    readonly state: TransportState;
    
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    // node-mavlink's send()/sendSigned() call stream.write(buffer, callback) and
    // only resolve once that callback fires. Accept and invoke it here so those
    // promises settle; callers that await write() directly still work because a
    // Promise is returned as well.
    write(data: Buffer, callback?: (error?: Error | null) => void): Promise<void>;
    
    // Required EventEmitter override
    on<K extends keyof TransportEvents>(event: K, listener: TransportEvents[K]): this;
    once<K extends keyof TransportEvents>(event: K, listener: TransportEvents[K]): this;
    emit<K extends keyof TransportEvents>(event: K, ...args: Parameters<TransportEvents[K]>): boolean;
}

/**
 * Serial Transport (USB/UART)
 */
export class SerialTransport extends EventEmitter implements MAVLinkTransport {
    readonly config: SerialConfig;
    private port: SerialPort | null = null;
    private _state: TransportState = 'disconnected';

    constructor(config: SerialConfig) {
        super();
        this.config = config;
    }

    get state(): TransportState {
        return this._state;
    }

    private setState(state: TransportState): void {
        if (this._state !== state) {
            this._state = state;
            this.emit('stateChange', state);
        }
    }

    async connect(): Promise<void> {
        if (this.port) {
            throw new Error('Already connected or connecting');
        }

        this.setState('connecting');

        return new Promise((resolve, reject) => {
            try {
                this.port = new SerialPort({
                    path: this.config.path,
                    baudRate: this.config.baudRate,
                    lock: false,
                    autoOpen: false
                });

                this.port.on('data', (data: Buffer) => {
                    this.emit('data', data);
                });

                this.port.on('close', () => {
                    this.setState('disconnected');
                    this.emit('disconnected');
                });

                this.port.on('error', (err) => {
                    this.setState('error');
                    this.emit('error', err);
                });

                this.port.open((error) => {
                    if (error) {
                        this.setState('error');
                        this.port = null;
                        reject(error);
                    } else {
                        this.setState('connected');
                        this.emit('connected');
                        resolve();
                    }
                });
            } catch (error) {
                this.setState('error');
                this.port = null;
                reject(error);
            }
        });
    }

    async disconnect(): Promise<void> {
        if (!this.port) return;

        return new Promise((resolve) => {
            const port = this.port!;
            this.port = null;
            
            port.removeAllListeners();
            
            if (port.isOpen) {
                port.close(() => {
                    this.setState('disconnected');
                    resolve();
                });
            } else {
                this.setState('disconnected');
                resolve();
            }
        });
    }

    async write(data: Buffer, callback?: (error?: Error | null) => void): Promise<void> {
        if (!this.port || !this.port.isOpen) {
            const err = new Error('Serial port not connected');
            callback?.(err);
            throw err;
        }

        return new Promise((resolve, reject) => {
            this.port!.write(data, (error) => {
                if (error) {
                    callback?.(error);
                    reject(error);
                } else {
                    callback?.();
                    resolve();
                }
            });
        });
    }
}

/**
 * TCP Transport (for SITL and network connections)
 */
export class TCPTransport extends EventEmitter implements MAVLinkTransport {
    readonly config: TCPConfig;
    private socket: Socket | null = null;
    private _state: TransportState = 'disconnected';

    constructor(config: TCPConfig) {
        super();
        this.config = config;
    }

    get state(): TransportState {
        return this._state;
    }

    private setState(state: TransportState): void {
        if (this._state !== state) {
            this._state = state;
            this.emit('stateChange', state);
        }
    }

    async connect(): Promise<void> {
        if (this.socket) {
            throw new Error('Already connected or connecting');
        }

        this.setState('connecting');

        return new Promise((resolve, reject) => {
            try {
                this.socket = connect({
                    host: this.config.host,
                    port: this.config.port
                });

                this.socket.setKeepAlive(true, 1000);
                this.socket.setNoDelay(true);

                this.socket.on('connect', () => {
                    this.setState('connected');
                    this.emit('connected');
                    resolve();
                });

                this.socket.on('data', (data: Buffer) => {
                    this.emit('data', data);
                });

                this.socket.on('close', () => {
                    this.setState('disconnected');
                    this.emit('disconnected');
                });

                this.socket.on('error', (err) => {
                    this.setState('error');
                    this.emit('error', err);
                    if (this.socket && !this.socket.destroyed) {
                        this.socket.destroy();
                    }
                    reject(err);
                });
            } catch (error) {
                this.setState('error');
                this.socket = null;
                reject(error);
            }
        });
    }

    async disconnect(): Promise<void> {
        if (!this.socket) return;

        const socket = this.socket;
        this.socket = null;
        
        socket.removeAllListeners();
        socket.destroy();
        this.setState('disconnected');
    }

    async write(data: Buffer, callback?: (error?: Error | null) => void): Promise<void> {
        if (!this.socket || this.socket.destroyed) {
            const err = new Error('TCP socket not connected');
            callback?.(err);
            throw err;
        }

        return new Promise((resolve, reject) => {
            this.socket!.write(data, (error) => {
                if (error) {
                    callback?.(error);
                    reject(error);
                } else {
                    callback?.();
                    resolve();
                }
            });
        });
    }
}

/**
 * UDP Transport (for telemetry radios and wireless links)
 */
export class UDPTransport extends EventEmitter implements MAVLinkTransport {
    readonly config: UDPConfig;
    private socket: UDPSocket | null = null;
    private _state: TransportState = 'disconnected';
    private remoteAddress: string | null = null;
    private remotePort: number | null = null;

    constructor(config: UDPConfig) {
        super();
        this.config = config;
    }

    get state(): TransportState {
        return this._state;
    }

    private setState(state: TransportState): void {
        if (this._state !== state) {
            this._state = state;
            this.emit('stateChange', state);
        }
    }

    async connect(): Promise<void> {
        if (this.socket) {
            throw new Error('Already connected or connecting');
        }

        this.setState('connecting');

        return new Promise((resolve, reject) => {
            try {
                this.socket = createSocket('udp4');

                this.socket.on('message', (data: Buffer, rinfo) => {
                    // Remember the first sender for server mode replies
                    if (this.config.mode === 'server' && !this.remoteAddress) {
                        this.remoteAddress = rinfo.address;
                        this.remotePort = rinfo.port;
                    }
                    this.emit('data', data);
                });

                this.socket.on('error', (err) => {
                    this.setState('error');
                    this.emit('error', err);
                    if (this.socket) {
                        this.socket.close();
                    }
                    reject(err);
                });

                this.socket.on('close', () => {
                    this.setState('disconnected');
                    this.emit('disconnected');
                });

                if (this.config.mode === 'server') {
                    // Server mode: bind to a local port and wait for messages
                    const bindHost = this.config.bindHost || '0.0.0.0';
                    this.socket.bind(this.config.port, bindHost, () => {
                        this.setState('connected');
                        this.emit('connected');
                        resolve();
                    });
                } else {
                    // Client mode: bind to any port, will send to configured host:port
                    if (!this.config.host) {
                        throw new Error('UDP client mode requires host configuration');
                    }
                    this.remoteAddress = this.config.host;
                    this.remotePort = this.config.port;
                    
                    this.socket.bind(() => {
                        this.setState('connected');
                        this.emit('connected');
                        resolve();
                    });
                }
            } catch (error) {
                this.setState('error');
                this.socket = null;
                reject(error);
            }
        });
    }

    async disconnect(): Promise<void> {
        if (!this.socket) return;

        return new Promise((resolve) => {
            const socket = this.socket!;
            this.socket = null;
            this.remoteAddress = null;
            this.remotePort = null;
            
            socket.removeAllListeners();
            socket.close(() => {
                this.setState('disconnected');
                resolve();
            });
        });
    }

    async write(data: Buffer, callback?: (error?: Error | null) => void): Promise<void> {
        if (!this.socket) {
            const err = new Error('UDP socket not connected');
            callback?.(err);
            throw err;
        }

        // In server mode, wait for the first incoming message to know where to reply.
        // Drop outbound packets until a remote client is known — throwing here
        // crashes the Node process when requestParameters fires on startup. Still
        // acknowledge the write so node-mavlink's send() promise does not hang.
        if (this.config.mode === 'server' && (!this.remoteAddress || !this.remotePort)) {
            callback?.();
            return; // No remote client yet; packet dropped gracefully.
        }

        const targetHost = this.remoteAddress!;
        const targetPort = this.remotePort!;

        return new Promise((resolve, reject) => {
            this.socket!.send(data, 0, data.length, targetPort, targetHost, (error) => {
                if (error) {
                    callback?.(error);
                    reject(error);
                } else {
                    callback?.();
                    resolve();
                }
            });
        });
    }
}

/**
 * Transport Factory
 */
export function createTransport(config: TransportConfig): MAVLinkTransport {
    switch (config.type) {
        case 'serial':
            return new SerialTransport(config);
        case 'tcp':
            return new TCPTransport(config);
        case 'udp':
            return new UDPTransport(config);
        default:
            throw new Error(`Unknown transport type: ${(config as TransportConfig).type}`);
    }
}

/**
 * Utility: List available serial ports
 */
export async function listSerialPorts(): Promise<Array<{
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    vendorId?: string;
    productId?: string;
}>> {
    const ports = await SerialPort.list();
    return ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        vendorId: p.vendorId,
        productId: p.productId
    }));
}

/**
 * Utility: Detect serial ports with MAVLink traffic
 * Listens on each candidate port for a short time to detect valid MAVLink frames
 */
export async function detectMAVLinkSerialPort(
    baudRates: number[] = [115200, 921600, 57600],
    timeoutMs: number = 3000,
    minFrames: number = 2
): Promise<{ path: string; baudRate: number } | null> {
    const candidates = serialCandidates();
    
    for (const path of candidates) {
        const isCDC = /ttyACM/.test(path);
        const rates = isCDC ? [baudRates[0]] : baudRates;
        
        for (const baudRate of rates) {
            const detected = await probePort(path, baudRate, timeoutMs, minFrames);
            if (detected) {
                return { path, baudRate };
            }
        }
    }
    
    return null;
}

function serialCandidates(): string[] {
    const paths: string[] = [];
    const add = (candidate: string) => {
        try {
            const real = realpathSync(candidate);
            if (!paths.includes(real)) paths.push(real);
        } catch {
            // Device doesn't exist
        }
    };
    
    try {
        for (const name of readdirSync('/dev/serial/by-id')) {
            add(`/dev/serial/by-id/${name}`);
        }
    } catch {
        // No by-id directory
    }
    
    const commonPaths = [
        '/dev/ttyACM0', '/dev/ttyACM1', '/dev/ttyACM2',
        '/dev/ttyAMA0', '/dev/serial0',
        '/dev/ttyUSB0', '/dev/ttyUSB1'
    ];
    
    for (const p of commonPaths) {
        if (existsSync(p)) add(p);
    }

    // Windows COM ports — SerialPort.list() already enumerates these, so we
    // only need to add them here when calling serialCandidates() directly.
    // On Windows, existsSync doesn't reliably check COM ports, so we include
    // common ones and let the probe attempt settle it.
    if (process.platform === 'win32') {
        for (let i = 1; i <= 16; i++) {
            paths.push(`COM${i}`);
        }
    }
    
    return paths;
}

async function probePort(
    path: string,
    baudRate: number,
    timeoutMs: number,
    minFrames: number
): Promise<boolean> {
    return new Promise((resolve) => {
        let port: SerialPort;
        try {
            port = new SerialPort({ path, baudRate, lock: false, autoOpen: false });
        } catch {
            resolve(false);
            return;
        }
        
        let settled = false;
        let frames = 0;
        
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            port.removeAllListeners();
            if (port.isOpen) {
                port.close(() => resolve(ok));
            } else {
                resolve(ok);
            }
        };
        
        const timer = setTimeout(() => finish(false), timeoutMs);
        
        // Simple MAVLink frame detection: look for valid start bytes (0xFE for v1, 0xFD for v2)
        port.on('data', (data: Buffer) => {
            for (let i = 0; i < data.length; i++) {
                if (data[i] === 0xFE || data[i] === 0xFD) {
                    frames++;
                    if (frames >= minFrames) {
                        finish(true);
                        return;
                    }
                }
            }
        });
        
        port.on('error', () => finish(false));
        
        port.open((error) => {
            if (error) finish(false);
        });
    });
}
