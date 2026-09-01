# MAVLink Dual-Transport Connectivity

This document describes the dual-transport MAVLink connectivity system in Sidak GCS, which supports USB serial, TCP, and UDP connections to flight controllers.

## Overview

Sidak GCS supports three MAVLink transport types:

1. **Serial (USB/UART)** — Direct connection via USB or UART pins for bench testing and tethered flight
2. **TCP** — Network connection for SITL development and TCP bridges
3. **UDP** — Wireless telemetry for field operations with radio modems

The transport layer is fully abstracted, allowing runtime switching between transports without restarting the application.

## Architecture

### Transport Abstraction Layer

**Location:** `src/lib/server/mavlink-transport.ts`

The transport abstraction provides a unified interface for all connection types:

```typescript
interface MAVLinkTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(data: Buffer): Promise<void>;
  
  // Events
  on('connected', () => void);
  on('disconnected', () => void);
  on('error', (error: Error) => void);
  on('data', (buffer: Buffer) => void);
}
```

**Implementations:**
- `SerialTransport` — Uses `serialport` library
- `TCPTransport` — Uses Node.js `net.Socket`
- `UDPTransport` — Uses Node.js `dgram.Socket`

### Configuration Management

**Location:** `src/lib/server/mavlink-connection-config.ts`

Connection settings are persisted in the database with environment variable fallback. Settings include:

- Transport type selection
- Serial: port path, baud rate, auto-detect flag
- TCP: host, port
- UDP: mode (client/server), host, port, bind address

### Core MAVLink Module

**Location:** `src/lib/server/mavlink.ts`

The main MAVLink module has been refactored to use the transport abstraction. Key changes:

- `state.port` replaced with `state.transport`
- `sendMsg()` now writes to transport buffers instead of streams
- Connection supervisor handles reconnection logic
- Auto-detection for serial ports

### API Endpoints

**Location:** `src/routes/api/mavlink/connection/`

- **GET `/api/mavlink/connection`** — Get current settings and status
- **POST `/api/mavlink/connection`** — Update settings with optional reconnect
- **DELETE `/api/mavlink/connection`** — Force reconnection
- **GET `/api/mavlink/connection/ports`** — List available serial ports
- **POST `/api/mavlink/connection/ports/detect`** — Trigger serial auto-detection
- **GET `/api/mavlink/connection/status`** — Lightweight status polling

### UI Component

**Location:** `src/components/ConnectionSettings.svelte`

Comprehensive connection management UI with:

- Transport type selector
- Dynamic configuration forms for each transport
- Serial port auto-detection
- Real-time connection status
- Save/reconnect actions

## Transport Configuration

### Serial (USB/UART)

**Use Cases:**
- USB connection to flight controller for bench testing
- UART TELEM ports for direct connection on vehicles
- Development and firmware flashing

**Configuration:**

```bash
# Enable serial transport
MAVLINK_TRANSPORT_TYPE=serial

# Auto-detect (scans all available ports)
MAVLINK_SERIAL_PATH=
MAVLINK_BAUD=115200

# Or pin to specific port
MAVLINK_SERIAL_PATH=/dev/ttyACM0
MAVLINK_BAUD=115200
```

**Common Serial Devices:**
- `/dev/ttyACM0` — USB CDC (most flight controllers)
- `/dev/ttyUSB0` — USB-to-serial adapter
- `/dev/ttyAMA0` — Raspberry Pi UART (TELEM2 connection)
- `/dev/serial0` — Raspberry Pi serial alias

**Baud Rates:**
- `57600` — Traditional MAVLink default
- `115200` — Common for USB connections
- `921600` — High-speed UART (requires good cable/short distance)

**Auto-Detection:**

When `MAVLINK_SERIAL_PATH` is empty, the system probes available serial ports for MAVLink traffic (looking for valid frame start bytes `0xFE` or `0xFD`). Detection takes 3 seconds per port and tries common baud rates.

### TCP (Network/SITL)

**Use Cases:**
- ArduPilot SITL development (`sim_vehicle.py`)
- MAVProxy TCP bridges
- Network-connected flight controllers

**Configuration:**

```bash
MAVLINK_TRANSPORT_TYPE=tcp
MAVLINK_TCP_HOST=sitl
MAVLINK_TCP_PORT=5760
```

**Common Setups:**
- SITL: `sitl:5760` (Docker Compose service name)
- Local SITL: `localhost:5760`
- MAVProxy: `localhost:14550`
- PX4 SITL: `localhost:4560`

### UDP (Telemetry Radio)

**Use Cases:**
- RFD900x/RFD868x telemetry radios
- SiK radio modems
- 3DR Radio
- ESP8266/ESP32 WiFi telemetry
- Network telemetry over WiFi/Ethernet

**Configuration:**

#### Server Mode (GCS listens for incoming traffic)

```bash
MAVLINK_TRANSPORT_TYPE=udp
MAVLINK_UDP_MODE=server
MAVLINK_UDP_PORT=14550
MAVLINK_UDP_BIND_HOST=0.0.0.0  # Listen on all interfaces
```

**Use when:**
- Telemetry radio is configured to send to GCS IP
- Vehicle is configured to stream to a known GCS address
- Standard ground control station setup

#### Client Mode (GCS connects to remote)

```bash
MAVLINK_TRANSPORT_TYPE=udp
MAVLINK_UDP_MODE=client
MAVLINK_UDP_HOST=192.168.1.100  # Vehicle/radio IP
MAVLINK_UDP_PORT=14550
```

**Use when:**
- GCS initiates connection to vehicle
- Connecting to MAVProxy UDP endpoint
- Testing with local UDP bridges

**Common UDP Ports:**
- `14550` — Standard MAVLink UDP port
- `14551` — Secondary MAVLink port
- `14555` — SITL UDP broadcast

## Raspberry Pi Setup

### Hardware Connections

#### USB Connection

1. Connect flight controller to Raspberry Pi via USB
2. Power on — device should enumerate as `/dev/ttyACM0`
3. No additional setup needed (auto-detected)

#### UART Connection (TELEM2)

1. Connect FC TELEM2 to Pi GPIO:
   - FC TX → Pi RX (GPIO 15)
   - FC RX → Pi TX (GPIO 14)
   - FC GND → Pi GND
2. Enable UART on Raspberry Pi:

```bash
# Disable Bluetooth to free UART
sudo raspi-config
# Interface Options → Serial Port
# Login shell: No
# Serial hardware: Yes

# Edit /boot/config.txt
sudo nano /boot/config.txt
# Add: dtoverlay=disable-bt

sudo systemctl disable hciuart
sudo reboot
```

3. Configure GCS:

```bash
MAVLINK_SERIAL_PATH=/dev/ttyAMA0
MAVLINK_BAUD=921600  # Or 57600 for longer cables
```

### Permissions

The GCS user needs access to serial devices:

```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Logout and login for group to take effect
# Or for immediate effect:
newgrp dialout
```

### UDP Network Setup

#### Telemetry Radio

1. Configure radio to send MAVLink to GCS IP
2. On Raspberry Pi:

```bash
# Find Pi IP address
hostname -I

# Configure GCS to listen
MAVLINK_UDP_MODE=server
MAVLINK_UDP_PORT=14550
MAVLINK_UDP_BIND_HOST=0.0.0.0
```

#### Firewall

If using `ufw` or `iptables`, allow UDP traffic:

```bash
# Allow MAVLink UDP port
sudo ufw allow 14550/udp

# Or open range for multiple connections
sudo ufw allow 14550:14555/udp
```

### Persistent Device Names (udev)

To ensure consistent device naming across reboots:

```bash
# Create udev rule
sudo nano /etc/udev/rules.d/99-flight-controller.rules

# Add rule (adjust idVendor/idProduct from lsusb output):
SUBSYSTEM=="tty", ATTRS{idVendor}=="26ac", ATTRS{idProduct}=="0032", SYMLINK+="flight-controller"

# Reload rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Then use `/dev/flight-controller` as the serial path.

## Runtime Transport Switching

The GCS supports changing transports at runtime via the UI or API without restarting.

### Via UI

1. Navigate to the Integrations or Connection Settings page
2. Select desired transport type
3. Configure transport-specific settings
4. Click "Save & Reconnect"

### Via API

```bash
# Update settings
curl -X POST http://localhost:3000/api/mavlink/connection \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "transportType": "udp",
      "udpMode": "server",
      "udpPort": 14550
    },
    "reconnect": true
  }'

# Force reconnection
curl -X DELETE http://localhost:3000/api/mavlink/connection
```

## Troubleshooting

### Serial Connection Issues

**Problem:** `/dev/ttyACM0` not found

**Solutions:**
- Check USB cable and port
- Run `ls /dev/tty*` to see available devices
- Check `dmesg | tail` after plugging in USB
- Try different USB ports

**Problem:** Permission denied

**Solution:**
```bash
sudo usermod -a -G dialout $USER
# Then logout and login
```

**Problem:** Auto-detection finds wrong device

**Solution:**
- Disable auto-detect
- Manually specify serial path
- Create udev rule for consistent naming

### UDP Connection Issues

**Problem:** No telemetry received (server mode)

**Solutions:**
- Check firewall: `sudo ufw status`
- Verify radio is sending to correct IP
- Check port is not in use: `sudo netstat -ulnp | grep 14550`
- Try binding to specific interface instead of `0.0.0.0`

**Problem:** Connection timeout (client mode)

**Solutions:**
- Verify remote host is reachable: `ping 192.168.1.100`
- Check remote port is open
- Verify remote MAVLink service is running

### General Issues

**Problem:** Connection drops frequently

**Solutions:**
- Check cable quality (serial)
- Check signal strength (wireless)
- Reduce telemetry rate if bandwidth is limited
- Check for USB power issues (add powered hub)

**Problem:** No heartbeat received

**Solutions:**
- Verify flight controller is powered and booted
- Check baud rate matches flight controller
- For TCP: verify SITL is running and listening
- For UDP: check firewall and network connectivity

## Development

### Testing Transports

```bash
# Test serial with socat
socat -d -d pty,raw,echo=0 pty,raw,echo=0
# Connect to one of the created ptys

# Test TCP with MAVProxy
mavproxy.py --master=/dev/ttyACM0 --out=tcpin:0.0.0.0:5760

# Test UDP with MAVProxy
mavproxy.py --master=/dev/ttyACM0 --out=udpout:127.0.0.1:14550
```

### Adding New Transport Types

1. Create transport class in `mavlink-transport.ts`:

```typescript
export class MyTransport extends EventEmitter implements MAVLinkTransport {
  async connect(): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
  async write(data: Buffer): Promise<void> { /* ... */ }
}
```

2. Update `createTransport()` factory function
3. Add configuration interface to `mavlink-connection-config.ts`
4. Add UI controls in `ConnectionSettings.svelte`

## References

- [MAVLink Protocol](https://mavlink.io/)
- [ArduPilot Serial Configuration](https://ardupilot.org/copter/docs/common-serial-options.html)
- [PX4 MAVLink](https://docs.px4.io/main/en/companion_computer/mavlink.html)
- [RFD900x Manual](https://files.rfdesign.com.au/Files/documents/RFD900x%20DataSheet.pdf)
- [SiK Radio Configuration](https://ardupilot.org/copter/docs/common-sik-telemetry-radio.html)
