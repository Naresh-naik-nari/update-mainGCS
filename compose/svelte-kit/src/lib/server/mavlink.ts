import { MavLinkPacketSplitter, MavLinkPacketParser, common, ardupilotmega, minimal, send, sendSigned } from 'node-mavlink';
import { building } from '$app/environment';
import { REGISTRY } from '$lib/mavlink-registry';
import { convertBigIntToNumber, formatTelemetryLine } from '$lib/telemetry-line';
import { getSettings } from '$lib/server/settings';
import { deriveSigningKey, nextSigningTimestamp } from '$lib/server/mavlink-signing';
import { decideUploadAction, type UploadEvent } from '$lib/server/mission-upload';
import {
    createTransport,
    detectMAVLinkSerialPort,
    listSerialPorts,
    type MAVLinkTransport,
    type TransportConfig,
    type TransportState
} from './mavlink-transport';
import {
    loadConnectionSettings,
    saveConnectionSettings,
    buildTransportConfig,
    shouldEnableMAVLink,
    type ConnectionSettings
} from './mavlink-connection-config';

// Once telemetry has flowed, silence beyond this window means a stalled link
// and the connection recycles. Before the first packet the connection just
// listens: an autopilot pauses its boot on serial0 until a client connects and
// can take a minute before the first bytes, and disconnecting mid-boot resets
// it, so a young quiet connection is left alone.
const STALE_LINK_MS = 4000;
// A connection that never produces a packet recycles eventually, so a dead
// peer cannot hold the link forever.
const FIRST_PACKET_RECYCLE_MS = 300_000;
// Telemetry logs are capped so a long-running station cannot grow them without
// bound; the cap covers several minutes of backlog for the event-log view.
const MAX_LOG_ENTRIES = 5000;

const SUPERVISOR_INTERVAL_MS = 2000;
const GCS_HEARTBEAT_MS = 1000;
// Mission upload: how long to wait for the vehicle to request the next item (or
// send the final ack) before resending, and how many MISSION_COUNT attempts to
// make before giving up when the vehicle never requests an item.
const MISSION_STEP_TIMEOUT_MS = 3000;
const MISSION_MAX_COUNT_TRIES = 3;
// A stream of rejected signatures logs at most once per window so a flood of
// forged or wrong-key packets cannot fill the event log.
const SIG_WARN_INTERVAL_MS = 5000;

// Latest structured telemetry for server-side flows that run with no browser
// attached: identity from HEARTBEAT, position from GLOBAL_POSITION_INT, home
// from HOME_POSITION. Names use the MAVLink enum spellings, which the flight
// mode helpers match.
export interface VehicleSnapshot {
    typeName: string;
    modelName: string;
    baseMode: number;
    heartbeatAt: number;
    position: { lat: number; lon: number; at: number } | null;
    home: { lat: number; lon: number; at: number } | null;
}

function emptySnapshot(): VehicleSnapshot {
    return { typeName: '', modelName: '', baseMode: 0, heartbeatAt: 0, position: null, home: null };
}

interface MavlinkState {
    transport: MAVLinkTransport | null;
    reader: MavLinkPacketParser | null;
    connectionSettings: ConnectionSettings | null;
    transportState: TransportState;
    online: boolean;
    lastPacketAt: number;
    connectedAt: number;
    logs: string[];
    newLogs: string[];
    latestHeartbeat: string;
    snapshot: VehicleSnapshot;
    supervisor: ReturnType<typeof setInterval> | null;
    gcsBeat: ReturnType<typeof setInterval> | null;
    lastErrorMessage: string;
    wasAlive: boolean;
    suspended: boolean;
    // MAVLink 2 signing: a null key sends and accepts unsigned traffic. With a
    // key set, outbound messages are signed and inbound signed messages are
    // verified; strict mode additionally rejects any unsigned inbound message.
    signingKey: Buffer | null;
    signingLinkId: number;
    signingStrict: boolean;
    lastSignAt: number;
    sigRejects: number;
    lastSigWarnAt: number;
    // Set while a mission upload is in flight; the reader routes each
    // MISSION_REQUEST_INT and MISSION_ACK here so the handshake can proceed.
    missionUpload: { onEvent: (event: UploadEvent) => void } | null;
    _onData?: (data: Buffer) => void;
    // Auto-detection state
    detectedPort: { path: string; baud: number } | null;
    detecting: boolean;
}

// The link state lives on globalThis so a dev-server module reload reuses the
// open connection. Module-local state orphans the previous socket on every
// reload, and an orphan holds SITL's single serial-over-TCP slot, leaving every
// later connection byte-less.
const g = globalThis as typeof globalThis & { __sidakgcMavlink?: MavlinkState };
const state: MavlinkState = (g.__sidakgcMavlink ??= {
    transport: null,
    reader: null,
    connectionSettings: null,
    transportState: 'disconnected',
    online: false,
    lastPacketAt: 0,
    connectedAt: 0,
    logs: [],
    newLogs: [],
    latestHeartbeat: '',
    snapshot: emptySnapshot(),
    supervisor: null,
    gcsBeat: null,
    lastErrorMessage: '',
    wasAlive: false,
    suspended: false,
    signingKey: null,
    signingLinkId: 1,
    signingStrict: false,
    lastSignAt: 0,
    sigRejects: 0,
    lastSigWarnAt: 0,
    missionUpload: null,
    detectedPort: null,
    detecting: false
});
// A dev-server reload reuses the cached state object, which may predate fields
// added since; seed any missing ones.
state.snapshot ??= emptySnapshot();
state.detectedPort ??= null;
state.detecting ??= false;

function superviseLink(): void {
    if (state.suspended) return;
    const alive = linkAlive();
    if (alive !== state.wasAlive) {
        state.wasAlive = alive;
        console.log(alive ? 'MAVLink link up' : 'MAVLink link down');
    }
    if (!state.transport) {
        void initializePort();
        return;
    }
    const now = Date.now();
    const streamedThenStalled = state.lastPacketAt > 0 && now - state.lastPacketAt > STALE_LINK_MS;
    const neverStreamed = state.lastPacketAt === 0 && now - state.connectedAt > FIRST_PACKET_RECYCLE_MS;
    if (streamedThenStalled || neverStreamed) {
        // A detected port that went silent may have re-enumerated elsewhere,
        // so the next dial re-scans.
        if (neverStreamed && state.connectionSettings?.serialAutoDetect) {
            state.detectedPort = null;
        }
        teardownConnection();
    }
}

// The server owns the autopilot link and keeps it alive on its own; browser
// heartbeats read the state these loops maintain rather than driving dialing.
// This also guarantees the first client an autopilot sees after boot is one
// stable connection, since SITL binds serial0 to its first client. The loops
// are recreated on module load so a dev reload runs the current logic, and
// prerendering during the build loads this module too, so they stay off there.
if (!building) {
    // Load the signing key once the DB is reachable; a failure here leaves the
    // link unsigned until the operator saves the setting, which reloads it.
    refreshSigningConfig().catch(() => {});
    initTelemetryRates().catch(() => {});

    if (state.supervisor) clearInterval(state.supervisor);
    state.supervisor = setInterval(superviseLink, SUPERVISOR_INTERVAL_MS);

    // A 1 Hz station heartbeat so autopilot GCS-failsafe configurations see the
    // ground station while the link is up.
    if (state.gcsBeat) clearInterval(state.gcsBeat);
    state.gcsBeat = setInterval(() => {
        if (!linkAlive() || !state.transport) return;
        const heartbeat = new minimal.Heartbeat();
        heartbeat.type = minimal.MavType.GCS;
        heartbeat.autopilot = minimal.MavAutopilot.INVALID;
        heartbeat.baseMode = 0 as minimal.MavModeFlag;
        heartbeat.customMode = 0;
        heartbeat.systemStatus = minimal.MavState.ACTIVE;
        heartbeat.mavlinkVersion = 3;
        sendMsg(state.transport, heartbeat).catch(() => {});
    }, GCS_HEARTBEAT_MS);
    
    // Trigger initial connection
    void initializePort();
}

const logs = state.logs;
const newLogs = state.newLogs;

export function latestHeartbeat(): string {
    return state.latestHeartbeat;
}

export function vehicleSnapshot(): VehicleSnapshot {
    return { ...state.snapshot };
}

// Station-originated events enter the same log stream the vehicle telemetry
// rides, so they reach the event log and every stream consumer.
export function pushStationLog(text: string): void {
    pushLog(text);
}

// A firmware upload needs the autopilot's serial device to itself; suspend
// releases the connection and holds the supervisor off until resume, when the
// station dials back into the freshly flashed board.
export function suspendLink(): void {
    state.suspended = true;
    teardownConnection();
}

export function resumeLink(): void {
    state.suspended = false;
}

// Drops the current vehicle connection and dials a fresh one immediately, so
// the operator can recover a flapping link without reloading the app and
// losing their session state.
export function forceReconnect(): void {
    state.suspended = false;
    teardownConnection();
    initializePort();
}

// Stream consumers receive each message the instant it is parsed, so the
// marker and HUD reach a fresh fix instead of one drained on the next poll.
// Vehicle messages travel as their raw wire frames and station events as
// text lines.
export interface TelemetryStreamSubscriber {
    onFrame(tsMs: number, frame: Buffer): void;
    onLine(tsMs: number, line: string): void;
}
const streamSubscribers = new Set<TelemetryStreamSubscriber>();
export function subscribeTelemetry(sub: TelemetryStreamSubscriber): () => void {
    streamSubscribers.add(sub);
    return () => streamSubscribers.delete(sub);
}

function pushLog(entry: string, tsMs = Date.now(), frame?: Buffer): void {
    logs.push(entry);
    newLogs.push(entry);
    if (logs.length > MAX_LOG_ENTRIES) logs.splice(0, logs.length - MAX_LOG_ENTRIES);
    if (newLogs.length > MAX_LOG_ENTRIES) newLogs.splice(0, newLogs.length - MAX_LOG_ENTRIES);
    for (const sub of streamSubscribers) {
        try {
            if (frame) sub.onFrame(tsMs, frame);
            else sub.onLine(tsMs, entry);
        } catch {
            // A broken stream consumer must not stall telemetry parsing.
        }
    }
}

function linkAlive(): boolean {
    return Boolean(
        state.transport && 
        state.reader && 
        state.transportState === 'connected' &&
        state.lastPacketAt > 0 && 
        Date.now() - state.lastPacketAt < STALE_LINK_MS
    );
}

// Loads the signing passphrase, link id, and strict flag from settings (env as
// a fallback) and caches the derived 32-byte key. Called at startup and each
// time the operator saves the setting, so a key change takes effect without a
// restart.
export async function refreshSigningConfig(): Promise<void> {
    const s = await getSettings('mavlink.');
    const passphrase = s['mavlink.signingKey'] ?? process.env.MAVLINK_SIGNING_KEY ?? '';
    state.signingKey = deriveSigningKey(passphrase);
    const linkId = Math.trunc(Number(s['mavlink.signingLinkId'] ?? 1));
    state.signingLinkId = Number.isFinite(linkId) ? Math.min(255, Math.max(0, linkId)) : 1;
    state.signingStrict = (s['mavlink.signingStrict'] ?? 'false') === 'true';
}

// Pushes the signing key to the vehicle with SETUP_SIGNING so one passphrase set
// in the app keys both ends. The vehicle has to be connected to receive it; it
// is re-sent automatically whenever the link comes up while a key is set.
export async function provisionVehicleSigning(): Promise<{ ok: boolean; message: string }> {
    const key = state.signingKey;
    if (!key) return { ok: false, message: 'No signing passphrase is set.' };
    if (!linkAlive() || !state.transport) {
        return { ok: false, message: 'Vehicle offline; its key is set automatically when the link comes up.' };
    }
    const msg = new common.SetupSigning();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.secretKey = Array.from(key);
    const ts = nextSigningTimestamp(Date.now(), state.lastSignAt);
    state.lastSignAt = ts;
    msg.initialTimestamp = BigInt(ts);
    await sendMsg(state.transport, msg);
    pushLog('MAVLink signing: pushed the key to the vehicle (SETUP_SIGNING)');
    return { ok: true, message: 'Signing key pushed to the vehicle.' };
}

// Sends a message signed when a key is configured, plain otherwise. The
// timestamp is forced strictly upward so a burst inside one millisecond still
// satisfies the receiver's replay check.
async function sendMsg(
    transport: MAVLinkTransport,
    msg: Parameters<typeof send>[1]
): Promise<void> {
    if (!state.signingKey) {
        // Send unsigned
        await send(transport as unknown as Parameters<typeof send>[0], msg);
        return;
    }
    
    // Send signed
    const ts = nextSigningTimestamp(Date.now(), state.lastSignAt);
    state.lastSignAt = ts;
    await sendSigned(transport as unknown as Parameters<typeof sendSigned>[0], msg, state.signingKey, state.signingLinkId, undefined, undefined, ts);
}

function noteSignatureReject(reason: string): void {
    state.sigRejects++;
    const now = Date.now();
    if (now - state.lastSigWarnAt > SIG_WARN_INTERVAL_MS) {
        state.lastSigWarnAt = now;
        pushLog(`MAVLink signing: dropped a message (${reason}); ${state.sigRejects} rejected so far`);
    }
}

// Opens the connection and starts listening; the link counts as alive once the
// first packet arrives. Safe to call repeatedly, it only dials when no
// connection exists.
async function initializePort(): Promise<void> {
    if (state.transport || state.suspended) return;
    
    // Load connection settings
    if (!state.connectionSettings) {
        state.connectionSettings = await loadConnectionSettings();
    }
    
    if (!shouldEnableMAVLink(state.connectionSettings)) {
        return; // MAVLink disabled (e.g., MSP-only mode)
    }
    
    try {
        // Reload signing config on every dial so a fresh link always picks up
        // the current key, self-healing a startup that raced the DB.
        await refreshSigningConfig();
        
        // Handle serial auto-detection
        if (state.connectionSettings.transportType === 'serial' && 
            state.connectionSettings.serialAutoDetect && 
            !state.connectionSettings.serialPath) {
            
            if (!state.detectedPort && !state.detecting) {
                void detectSerialConnection();
            }
            return; // Wait for detection to complete
        }
        
        // Build transport config
        let config: TransportConfig;
        
        if (state.connectionSettings.transportType === 'serial' && state.detectedPort) {
            // Use detected port
            config = {
                type: 'serial',
                path: state.detectedPort.path,
                baudRate: state.detectedPort.baud
            };
        } else {
            config = buildTransportConfig(state.connectionSettings);
        }
        
        // Create and connect transport
        state.transport = createTransport(config);
        setupTransportListeners();
        
        await state.transport.connect();
        state.connectedAt = Date.now();
        
        pushLog(`MAVLink connecting via ${config.type}: ${describeConfig(config)}`);
    } catch (error) {
        teardownConnection();
        const message = (error as Error).message;
        if (message !== state.lastErrorMessage) {
            state.lastErrorMessage = message;
            console.error('Failed to initialize MAVLink connection:', message);
        }
        
        // Reset detection state on failure
        if (state.connectionSettings?.serialAutoDetect) {
            state.detectedPort = null;
        }
    }
}

function describeConfig(config: TransportConfig): string {
    switch (config.type) {
        case 'serial':
            return `${config.path} @ ${config.baudRate} baud`;
        case 'tcp':
            return `${config.host}:${config.port}`;
        case 'udp':
            return config.mode === 'server' 
                ? `listening on ${config.bindHost || '0.0.0.0'}:${config.port}`
                : `client to ${config.host}:${config.port}`;
    }
}

async function detectSerialConnection(): Promise<void> {
    if (state.detecting) return;
    state.detecting = true;
    
    try {
        const detected = await detectMAVLinkSerialPort();
        if (detected) {
            state.detectedPort = { path: detected.path, baud: detected.baudRate };
            pushLog(`MAVLink autodetected ${detected.path} at ${detected.baudRate} baud`);
            // Trigger immediate connection attempt
            void initializePort();
        }
    } finally {
        state.detecting = false;
    }
}

function teardownConnection(): void {
    state.reader?.removeAllListeners();
    state.reader = null;
    if (state.transport) {
        state.transport.removeAllListeners();
        state.transport.disconnect().catch(() => {});
        state.transport = null;
    }
    state.online = false;
    state.lastPacketAt = 0;
    state.connectedAt = 0;
    state.transportState = 'disconnected';
}

// A blank MAVLINK_TCP_HOST in development marks an MSP-only profile (Betaflight
// or INAV), which carries no MAVLink vehicle, so the link stays down instead of
// churning a doomed reconnect and the dashboard skips its offline nag.
export function mavlinkConfigured(): boolean {
    if (!state.connectionSettings) {
        return process.env.NODE_ENV === 'production' || (process.env.MAVLINK_TCP_HOST ?? 'sitl') !== '';
    }
    return shouldEnableMAVLink(state.connectionSettings);
}

function setupTransportListeners(): void {
    if (!state.transport) return;
    
    state.transport.on('connected', () => {
        state.transportState = 'connected';
        state.lastErrorMessage = '';
        setupPacketReader();
    });
    
    state.transport.on('disconnected', () => {
        state.transportState = 'disconnected';
        teardownConnection();
        pushLog('MAVLink connection closed');
    });
    
    state.transport.on('error', (err: Error) => {
        state.transportState = 'error';
        if (err.message !== state.lastErrorMessage) {
            state.lastErrorMessage = err.message;
            pushLog(`MAVLink connection error: ${err.message}`);
        }
    });
    
    state.transport.on('stateChange', (newState: TransportState) => {
        state.transportState = newState;
    });
}

function setupPacketReader(): void {
    if (!state.transport) return;
    
	// Transport emits 'data' events; feed them through the MAVLink transforms.
	const splitter = new MavLinkPacketSplitter();
	const parser = new MavLinkPacketParser();
	splitter.pipe(parser);
	state.reader = parser;
	const onData = (data: Buffer) => splitter.write(data);
	state.transport?.on('data', onData);
	state._onData = onData;

    state.reader?.on('data', (packet) => {
        // With signing on, a signed message must verify against the key, and a
        // dropped packet never counts as link traffic, so a wrong key or a
        // forged stream surfaces as a down link rather than trusted telemetry.
        if (state.signingKey) {
            if (packet.signature) {
                if (!packet.signature.matches(state.signingKey)) {
                    noteSignatureReject('invalid signature');
                    return;
                }
            } else if (state.signingStrict) {
                noteSignatureReject('unsigned message');
                return;
            }
        }
        const firstPacket = state.lastPacketAt === 0;
        if (firstPacket) {
            state.lastErrorMessage = '';
            pushLog('MAVLink connection initialized');
            // A real board streams nothing until asked (its stream-rate
            // parameters commonly sit at zero), so every consumed message gets
            // an explicit interval as soon as the link produces traffic.
            setTimeout(() => requestTelemetryStreams().catch(() => {}), 1000);
        }
        state.online = true;
        state.lastPacketAt = Date.now();
        if (firstPacket && state.signingKey) provisionVehicleSigning().catch(() => {});
        const clazz = REGISTRY[packet.header.msgid];
        if (clazz) {
            const data = packet.protocol.data(packet.payload, clazz);
            const sanitizedData = convertBigIntToNumber(data);
            const now = Date.now();
            const logEntry = formatTelemetryLine(clazz, sanitizedData, new Date(now).toISOString());
            pushLog(logEntry, now, packet.buffer);
            // The vehicle heartbeat arrives at 1 Hz while attitude and position
            // stream far faster, so it can rotate out of the capped ring between
            // client polls; the newest one is kept aside so every poll sees it.
            // Non-vehicle senders on the bus (GCS=6, ADSB=27, ONBOARD_CONTROLLER=18)
            // must never shadow the vehicle's heartbeat.
            const NON_VEHICLE_TYPES = new Set([6, 18, 27]);
            if (clazz.MSG_NAME === 'HEARTBEAT' && !NON_VEHICLE_TYPES.has((sanitizedData as { type?: number }).type ?? -1)) {
                state.latestHeartbeat = logEntry;
                const hb = sanitizedData as { type: number; autopilot: number; baseMode: number };
                state.snapshot.typeName = minimal.MavType[hb.type] ?? '';
                state.snapshot.modelName = minimal.MavAutopilot[hb.autopilot] ?? '';
                state.snapshot.baseMode = hb.baseMode ?? 0;
                state.snapshot.heartbeatAt = Date.now();
            }
            if (clazz.MSG_NAME === 'GLOBAL_POSITION_INT') {
                const p = sanitizedData as { lat: number; lon: number };
                if (p.lat !== 0 || p.lon !== 0) {
                    state.snapshot.position = { lat: p.lat / 1e7, lon: p.lon / 1e7, at: Date.now() };
                }
            }
            if (clazz.MSG_NAME === 'HOME_POSITION') {
                const h = sanitizedData as { latitude: number; longitude: number };
                if (h.latitude !== 0 || h.longitude !== 0) {
                    state.snapshot.home = { lat: h.latitude / 1e7, lon: h.longitude / 1e7, at: Date.now() };
                }
            }
            // Drive the mission-upload handshake: the vehicle requests each item
            // in turn and acks the completed plan.
            if (state.missionUpload) {
                if (clazz.MSG_NAME === 'MISSION_REQUEST_INT' || clazz.MSG_NAME === 'MISSION_REQUEST') {
                    state.missionUpload.onEvent({ kind: 'request', seq: (sanitizedData as { seq: number }).seq });
                } else if (clazz.MSG_NAME === 'MISSION_ACK') {
                    state.missionUpload.onEvent({ kind: 'ack', type: (sanitizedData as { type: number }).type });
                }
            }
            if (logEntry.includes('_ACK') && !logEntry.includes('"command":512')) console.log(logEntry);
        }
    });
}

// No longer need setupPortListeners - transport handles events

// The telemetry the app consumes, streamed at fixed rates so the link behaves
// the same on a serial autopilot as on a SITL: attitude drives the HUD and the
// marker, position the map, and the rest the dashboard and alerts.
const TELEMETRY_INTERVALS: [messageId: number, intervalUs: number][] = [
    [common.Attitude.MSG_ID, 100_000],
    [common.GlobalPositionInt.MSG_ID, 200_000],
    [common.GpsRawInt.MSG_ID, 1_000_000],
    [common.BatteryStatus.MSG_ID, 1_000_000],
    [common.Vibration.MSG_ID, 1_000_000],
    [common.MissionCurrent.MSG_ID, 1_000_000],
    [common.HomePosition.MSG_ID, 2_000_000]
];

// The marginal-link posture stretches every telemetry interval so the
// autopilot streams a fraction of the messages. The dividing factor keeps the
// fastest messages (attitude, position) frequent enough to fly by while
// dropping the total frame rate.
const LOW_BANDWIDTH_DIVISOR = 4;
let lowBandwidth = false;

// A fresh dial re-applies whatever posture the operator last saved.
export async function initTelemetryRates(): Promise<void> {
    lowBandwidth = (await getSettings('mode.'))['mode.lowBandwidth'] === 'true';
}

export async function setTelemetryRates(low: boolean): Promise<void> {
    lowBandwidth = low;
    if (linkAlive()) await requestTelemetryStreams();
}

async function requestTelemetryStreams(): Promise<void> {
    const factor = lowBandwidth ? LOW_BANDWIDTH_DIVISOR : 1;
    for (const [messageId, intervalUs] of TELEMETRY_INTERVALS) {
        await sendMavlinkCommand('SET_MESSAGE_INTERVAL', [messageId, intervalUs * factor], true);
    }
}

async function requestStatus() {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }

    let request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GlobalPositionInt.MSG_ID;
    request.responseTarget = 1;
    await sendMsg(state.transport, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GpsRawInt.MSG_ID;
    request.responseTarget = 1;
    await sendMsg(state.transport, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.MissionCurrent.MSG_ID;
    request.responseTarget = 1;
    await sendMsg(state.transport, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.BatteryStatus.MSG_ID;
    request.responseTarget = 1;
    await sendMsg(state.transport, request);
}

async function requestParameters() {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }

    const request = new common.ParamRequestList();
    request.targetSystem = 1;
    request.targetComponent = 1;
    await sendMsg(state.transport, request);
}

async function writeParameter(id: string, value: number, type: number) {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }

    const request = new common.ParamSet();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.paramId = id;
    request.paramValue = value;
    request.paramType = type;
    await sendMsg(state.transport, request);
}

async function sendMavlinkCommand(command: string, params: number[], useCmdLong = false, useArduPilotMega = false) {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }

    let commandMsg: common.CommandInt | common.CommandLong;
    if (useCmdLong) commandMsg = new common.CommandLong();
    else {
        commandMsg = new common.CommandInt();
        commandMsg.frame = 0; // MAV_FRAME_GLOBAL;
    };

    commandMsg.targetSystem = 1;
    commandMsg.targetComponent = 1;

    if (useArduPilotMega) commandMsg.command = parseInt(`${ardupilotmega.MavCmd[command as keyof typeof ardupilotmega.MavCmd]}`);
    else commandMsg.command = common.MavCmd[command as keyof typeof common.MavCmd];

    // Assign every param the caller supplied, including 0 and NaN. A truthy
    // guard would drop them, and NAV_TAKEOFF needs NaN lat/lon to mean "take
    // off in place" rather than the CommandLong's 0 default (which sends the
    // vehicle toward coordinate 0,0).
    if (params[0] !== undefined) commandMsg._param1 = params[0];
    if (params[1] !== undefined) commandMsg._param2 = params[1];
    if (params[2] !== undefined) commandMsg._param3 = params[2];
    if (params[3] !== undefined) commandMsg._param4 = params[3];
    if (params[4] !== undefined) commandMsg._param5 = params[4];
    if (params[5] !== undefined) commandMsg._param6 = params[5];
    if (params[6] !== undefined) commandMsg._param7 = params[6];
    await sendMsg(state.transport, commandMsg);
}

// One frame of the gamepad stream; axes arrive pre-normalized to the
// MANUAL_CONTROL -1000..1000 ranges.
async function sendManualControl(x: number, y: number, z: number, r: number, buttons: number) {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }

    const msg = new common.ManualControl();
    msg.target = 1;
    msg.x = x;
    msg.y = y;
    msg.z = z;
    msg.r = r;
    msg.buttons = buttons;
    await sendMsg(state.transport, msg);
}

function sendMissionCount(numItems: number): void {
    if (!state.transport) return;
    const count = new common.MissionCount();
    count.targetSystem = 1;
    count.targetComponent = 1;
    count.count = numItems;
    count.opaqueId = 0;
    count.missionType = 0; // MAV_MISSION_TYPE_MISSION
    void sendMsg(state.transport, count);
}

export interface MissionItemInput {
    command: number;
    frame: number;
    lat: number;
    lon: number;
    alt: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
}

async function loadMissionItem(item: MissionItemInput, index: number) {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }

    const msg = new common.MissionItemInt();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.seq = index;
    msg.frame = item.frame;
    msg.command = item.command;
    msg.current = index === 0 ? 1 : 0;
    msg.autocontinue = 1;
    msg.param1 = item.param1;
    msg.param2 = item.param2;
    msg.param3 = item.param3;
    msg.param4 = item.param4;
    msg.x = Number((item.lat * 1e7).toFixed(0));
    msg.y = Number((item.lon * 1e7).toFixed(0));
    msg.z = item.alt;
    msg.missionType = 0;
    await sendMsg(state.transport, msg);
}

async function clearAllMissionItems() {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }

    const msg = new common.MissionClearAll();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    await sendMsg(state.transport, msg);
}

export interface MissionUploadResult {
    ok: boolean;
    message: string;
}

// Uploads a plan with the MISSION_REQUEST_INT handshake: send the count, then
// send each item the vehicle asks for, and resolve on its final MISSION_ACK.
// Every step has a timeout that resends, and an unanswered count gives up after
// a few tries, so a lost packet cannot hang the upload.
async function uploadMission(items: MissionItemInput[]): Promise<MissionUploadResult> {
    if (!state.transport || !state.reader) return { ok: false, message: 'No vehicle link.' };
    if (items.length === 0) {
        await clearAllMissionItems();
        return { ok: true, message: 'Mission cleared.' };
    }

    return new Promise<MissionUploadResult>((resolve) => {
        let settled = false;
        let stepTimer: ReturnType<typeof setTimeout> | null = null;
        let countTries = 0;

        const finish = (ok: boolean, message: string) => {
            if (settled) return;
            settled = true;
            if (stepTimer) clearTimeout(stepTimer);
            state.missionUpload = null;
            resolve({ ok, message });
        };

        const sendCount = () => {
            countTries++;
            sendMissionCount(items.length);
            if (stepTimer) clearTimeout(stepTimer);
            stepTimer = setTimeout(() => {
                if (countTries >= MISSION_MAX_COUNT_TRIES) {
                    finish(false, 'The vehicle did not request any mission item.');
                } else {
                    sendCount();
                }
            }, MISSION_STEP_TIMEOUT_MS);
        };

        state.missionUpload = {
            onEvent: (event) => {
                const action = decideUploadAction(event, items.length);
                if (action.kind === 'send') {
                    void loadMissionItem(items[action.seq], action.seq);
                    if (stepTimer) clearTimeout(stepTimer);
                    stepTimer = setTimeout(
                        () => finish(false, 'Timed out waiting for the vehicle to request the next item.'),
                        MISSION_STEP_TIMEOUT_MS
                    );
                } else if (action.kind === 'done') {
                    finish(true, 'The vehicle accepted the mission.');
                } else {
                    finish(false, action.reason);
                }
            }
        };

        sendCount();
    });
}

async function setPositionLocal(x: number, y: number, z: number) {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }
    const msg = new common.SetPositionTargetLocalNed();

    msg.timeBootMs = 0;
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.coordinateFrame = 1; // MAV_FRAME_LOCAL_NED
    // @ts-expect-error typeMask is declared readonly upstream but must be set per message
    msg.typeMask = 0b011111111000; // ignore all but position
    msg.x = x;
    msg.y = y;
    msg.z = z;
    msg.yawRate = 0;
    await sendMsg(state.transport, msg);
  }

// Commands a submarine's depth-hold target. Depth is an altitude below the
// surface, so it goes as a global setpoint with lat/lon masked out: the sub
// holds the commanded depth on its barometer without needing a horizontal
// position. A positive depthM dives that many meters below the surface.
async function setDepthGlobal(depthM: number) {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }
    const msg = new common.SetPositionTargetGlobalInt();
    msg.timeBootMs = 0;
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.coordinateFrame = 5; // MAV_FRAME_GLOBAL_INT
    // @ts-expect-error typeMask is declared readonly upstream but must be set per message
    msg.typeMask = 0b110111111011; // ignore all but altitude (depth)
    msg.latInt = 0;
    msg.lonInt = 0;
    msg.alt = -depthM; // negative meters below the surface
    msg.yawRate = 0;
    await sendMsg(state.transport, msg);
  }

// Sends a GUIDED air vehicle to a target altitude above home while holding its
// current horizontal position. A plane acts on a global destination, not the
// local-NED origin a copter accepts, so the current lat/lon travel with the
// altitude and the vehicle loiters there as it climbs or descends.
async function setAltitudeGlobal(lat: number, lon: number, alt: number) {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }
    const msg = new common.SetPositionTargetGlobalInt();
    msg.timeBootMs = 0;
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.coordinateFrame = 6; // MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
    // @ts-expect-error typeMask is declared readonly upstream but must be set per message
    msg.typeMask = 0b110111111000; // position (lat, lon, alt) only
    msg.latInt = Math.round(lat * 1e7);
    msg.lonInt = Math.round(lon * 1e7);
    msg.alt = alt;
    msg.yawRate = 0;
    await sendMsg(state.transport, msg);
}

// Establishes the vehicle's global origin so a vehicle with no GPS can hold a
// local position referenced to a manual start point, and sets home to the same
// point. This gives the local-NED moves and the map one shared reference instead
// of a missing global fix.
async function setGlobalOrigin(lat: number, lon: number, altM: number) {
    if (!state.transport || !state.reader) {
        state.online = false;
        return;
    }
    const origin = new common.SetGpsGlobalOrigin();
    origin.targetSystem = 1;
    origin.latitude = Math.round(lat * 1e7);
    origin.longitude = Math.round(lon * 1e7);
    origin.altitude = Math.round(altM * 1000);
    await sendMsg(state.transport, origin);
    await sendMavlinkCommand('DO_SET_HOME', [0, 0, 0, 0, lat, lon, altM]);
}

export {
    initializePort,
    requestStatus,
    requestParameters,
    writeParameter,
    sendMavlinkCommand,
    sendManualControl,
    uploadMission,
    clearAllMissionItems,
    setPositionLocal,
    setDepthGlobal,
    setAltitudeGlobal,
    setGlobalOrigin,
    linkAlive,
    logs,
    newLogs,
};

// ── Connection Management API ────────────────────────────────────────────────

/**
 * Get current connection settings
 */
export async function getConnectionSettings(): Promise<ConnectionSettings> {
    if (!state.connectionSettings) {
        state.connectionSettings = await loadConnectionSettings();
    }
    return { ...state.connectionSettings };
}

/**
 * Update connection settings and optionally reconnect
 */
export async function updateConnectionSettings(
    settings: Partial<ConnectionSettings>,
    reconnect = false
): Promise<void> {
    await saveConnectionSettings(settings);
    
    // Reload full settings
    state.connectionSettings = await loadConnectionSettings();
    
    if (reconnect) {
        await forceReconnectWithNewSettings();
    }
}

/**
 * Force reconnect with current settings
 */
async function forceReconnectWithNewSettings(): Promise<void> {
    teardownConnection();
    state.detectedPort = null; // Reset auto-detection
    await initializePort();
}

/**
 * Get current transport state information
 */
export function getTransportStatus(): {
    type: string | null;
    state: TransportState;
    config: TransportConfig | null;
    online: boolean;
    lastPacketAt: number;
} {
    return {
        type: state.connectionSettings?.transportType || null,
        state: state.transportState,
        config: state.transport?.config || null,
        online: state.online,
        lastPacketAt: state.lastPacketAt
    };
}

/**
 * List available serial ports
 */
export async function getAvailableSerialPorts(): Promise<Array<{ 
    path: string; 
    manufacturer?: string; 
    serialNumber?: string;
    vendorId?: string;
    productId?: string;
}>> {
    return await listSerialPorts();
}

/**
 * Manually trigger serial port detection
 */
export async function triggerSerialDetection(): Promise<{ path: string; baudRate: number } | null> {
    const detected = await detectMAVLinkSerialPort();
    if (detected) {
        state.detectedPort = { path: detected.path, baud: detected.baudRate };
    }
    return detected;
}
