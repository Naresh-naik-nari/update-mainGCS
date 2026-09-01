# Raspberry Pi Setup Guide for Sidak GCS

Quick setup guide for deploying Sidak GCS on Raspberry Pi with CubeOrange Plus flight controller.

## Hardware Requirements

- Raspberry Pi 4 Model B (4GB+ RAM recommended)
- MicroSD card (32GB+ recommended)
- CubeOrange Plus flight controller
- USB cable (for USB connection) OR
- UART cable/pins (for TELEM2 connection)
- Optional: RFD900x or similar telemetry radio

## Initial Raspberry Pi Setup

### 1. Install Raspberry Pi OS

```bash
# Use Raspberry Pi Imager to flash:
# - Raspberry Pi OS Lite (64-bit) for production
# - Enable SSH before flashing (Settings → Services)
# - Set hostname, username, password, WiFi
```

### 2. Initial Configuration

```bash
# SSH into Pi
ssh pi@sidak-gcs.local  # or use IP address

# Update system
sudo apt update
sudo apt upgrade -y

# Install required packages
sudo apt install -y git nodejs npm
```

## MAVLink Connection Setup

### Option 1: USB Connection (Easiest)

#### Hardware Setup

1. Connect CubeOrange Plus to Raspberry Pi via USB cable
2. Power on the flight controller
3. Device should appear as `/dev/ttyACM0`

#### Verify Connection

```bash
# Check if device is detected
ls -l /dev/ttyACM*

# Should show: /dev/ttyACM0
# If not present, check dmesg for errors
dmesg | tail -20
```

#### Add User to dialout Group

```bash
# Required for serial port access
sudo usermod -a -G dialout $USER

# Apply group membership (logout/login or):
newgrp dialout

# Verify
groups | grep dialout
```

#### GCS Configuration

```bash
# In .env file:
MAVLINK_TRANSPORT_TYPE=serial
MAVLINK_SERIAL_PATH=/dev/ttyACM0
MAVLINK_BAUD=115200
```

Or leave `MAVLINK_SERIAL_PATH` empty for auto-detection.

### Option 2: UART/TELEM2 Connection (Higher Performance)

#### Hardware Setup

1. Connect CubeOrange TELEM2 to Raspberry Pi GPIO:
   - **TELEM2 TX (Pin 2)** → **Pi RX (GPIO 15, Pin 10)**
   - **TELEM2 RX (Pin 3)** → **Pi TX (GPIO 14, Pin 8)**
   - **TELEM2 GND (Pin 6)** → **Pi GND (Pin 6)**
   - Do NOT connect 5V (Pi is 3.3V, FC is 5V tolerant but use level shifter if uncertain)

2. **IMPORTANT:** Use 3.3V signal levels. Most modern flight controllers have 3.3V serial but verify your hardware.

#### Disable Bluetooth (Frees UART)

```bash
# Edit boot config
sudo nano /boot/config.txt

# Add these lines at the end:
dtoverlay=disable-bt
enable_uart=1

# Disable Bluetooth service
sudo systemctl disable hciuart

# Reboot to apply
sudo reboot
```

#### Configure Serial Console

```bash
# Disable login shell on serial (keep hardware enabled)
sudo raspi-config

# Navigate to:
# 3 Interface Options
#   → I6 Serial Port
#     → Login shell: No
#     → Serial hardware: Yes

# Reboot
sudo reboot
```

#### Verify UART

```bash
# Check device exists
ls -l /dev/ttyAMA0

# Should show: /dev/ttyAMA0

# Alternative: check /dev/serial0 (symlink)
ls -l /dev/serial0
```

#### GCS Configuration

```bash
# In .env file:
MAVLINK_TRANSPORT_TYPE=serial
MAVLINK_SERIAL_PATH=/dev/ttyAMA0
MAVLINK_BAUD=921600  # High-speed; use 57600 for longer cables
```

**Recommended Baud Rates:**
- **921600** — Short cables (< 1m), best performance
- **115200** — Medium cables (1-3m), good performance
- **57600** — Long cables or noisy environments

### Option 3: UDP/Telemetry Radio (Wireless)

#### Hardware Setup

1. Connect telemetry radio to flight controller TELEM port
2. Configure radio to send to GCS IP address
3. Ensure Pi and radio are on same network

#### Find Pi IP Address

```bash
# Wired
ip addr show eth0 | grep 'inet '

# WiFi
ip addr show wlan0 | grep 'inet '

# Or simpler
hostname -I
```

#### Configure Firewall

```bash
# Install ufw if not present
sudo apt install -y ufw

# Allow MAVLink UDP
sudo ufw allow 14550/udp

# If using multiple connections
sudo ufw allow 14550:14555/udp

# Enable firewall
sudo ufw enable
```

#### GCS Configuration

```bash
# Server mode (GCS listens for radio):
MAVLINK_TRANSPORT_TYPE=udp
MAVLINK_UDP_MODE=server
MAVLINK_UDP_PORT=14550
MAVLINK_UDP_BIND_HOST=0.0.0.0

# Client mode (GCS connects to radio):
MAVLINK_TRANSPORT_TYPE=udp
MAVLINK_UDP_MODE=client
MAVLINK_UDP_HOST=192.168.1.100  # Radio IP
MAVLINK_UDP_PORT=14550
```

## Persistent Device Names (Optional but Recommended)

Prevent device names from changing on reboot:

```bash
# Find device details
lsusb
udevadm info -a -n /dev/ttyACM0 | grep -E 'idVendor|idProduct'

# Create udev rule
sudo nano /etc/udev/rules.d/99-cube-orange.rules

# Add rule (example for CubeOrange):
SUBSYSTEM=="tty", ATTRS{idVendor}=="26ac", ATTRS{idProduct}=="0032", SYMLINK+="cubeorange", GROUP="dialout", MODE="0660"

# Reload udev
sudo udevadm control --reload-rules
sudo udevadm trigger

# Verify symlink
ls -l /dev/cubeorange
```

Now use `MAVLINK_SERIAL_PATH=/dev/cubeorange` for consistent naming.

## Install and Run Sidak GCS

### 1. Clone Repository

```bash
cd ~
git clone https://github.com/your-org/sidak-gcs.git
cd sidak-gcs/compose/svelte-kit
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
# Copy environment template
cp ../../.env.example ../../.env

# Edit configuration
nano ../../.env

# Set your MAVLink connection settings (see above options)
```

### 4. Build Application

```bash
npm run build
```

### 5. Run Application

```bash
# Development (with hot reload)
npm run dev -- --host 0.0.0.0 --port 3000

# Production
NODE_ENV=production node build
```

### 6. Access GCS

```bash
# From same network:
http://sidak-gcs.local:3000
# or
http://<pi-ip-address>:3000
```

## Systemd Service (Run on Boot)

Create a systemd service to start GCS automatically:

```bash
# Create service file
sudo nano /etc/systemd/system/sidak-gcs.service
```

Add this content:

```ini
[Unit]
Description=Sidak Ground Control Station
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/sidak-gcs/compose/svelte-kit
Environment=NODE_ENV=production
ExecStart=/usr/bin/node build/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable sidak-gcs

# Start service now
sudo systemctl start sidak-gcs

# Check status
sudo systemctl status sidak-gcs

# View logs
sudo journalctl -u sidak-gcs -f
```

## Performance Tuning

### Increase GPU Memory (for video streaming)

```bash
sudo raspi-config
# 4 Performance Options
#   → P2 GPU Memory
#   → Set to 256 MB

sudo reboot
```

### Disable Unnecessary Services

```bash
# Disable services you don't need
sudo systemctl disable bluetooth
sudo systemctl disable cups
sudo systemctl disable triggerhappy
```

### Overclock (Optional, increases heat)

```bash
sudo nano /boot/config.txt

# Add (Raspberry Pi 4):
over_voltage=6
arm_freq=2000
gpu_freq=750

# IMPORTANT: Ensure adequate cooling!
sudo reboot
```

## Troubleshooting

### Serial Device Not Found

```bash
# Check kernel messages
dmesg | grep tty

# List all serial devices
ls /dev/tty*

# Check USB devices
lsusb
```

### Permission Denied on Serial Port

```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Logout and login, or:
newgrp dialout
```

### No MAVLink Heartbeat

```bash
# Check serial connection
cat /dev/ttyACM0  # Should see binary data streaming

# Install screen for interactive testing
sudo apt install -y screen
screen /dev/ttyACM0 115200

# Exit: Ctrl+A, then K, then Y
```

### High CPU Usage

```bash
# Check running processes
htop

# Reduce telemetry rate in flight controller parameters
# Or use low-bandwidth mode in GCS settings
```

### Network Connection Issues

```bash
# Check firewall
sudo ufw status

# Check network
ping 192.168.1.100

# Check UDP port not in use
sudo netstat -ulnp | grep 14550

# Monitor UDP traffic
sudo tcpdump -i any udp port 14550
```

## Testing Connections

### Test Serial with MAVProxy

```bash
# Install MAVProxy
sudo apt install -y python3-pip
pip3 install MAVProxy

# Connect to serial
mavproxy.py --master=/dev/ttyACM0 --baudrate=115200

# Should see MAVLink messages and heartbeat
```

### Test UDP Loopback

```bash
# Install socat
sudo apt install -y socat

# Create UDP loopback
socat UDP-LISTEN:14550,fork UDP:127.0.0.1:14551

# In another terminal
mavproxy.py --master=/dev/ttyACM0 --out=udpout:127.0.0.1:14550
```

## Security Hardening

### Change Default Passwords

```bash
# Change pi user password
passwd

# Consider creating a dedicated user
sudo adduser gcs
sudo usermod -a -G dialout,sudo gcs
```

### Configure SSH Keys

```bash
# Generate key on your computer
ssh-keygen -t ed25519

# Copy to Pi
ssh-copy-id pi@sidak-gcs.local

# Disable password authentication
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart ssh
```

### Enable Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 3000/tcp  # GCS web interface
sudo ufw allow 14550/udp  # MAVLink
sudo ufw enable
```

## Maintenance

### Update GCS

```bash
cd ~/sidak-gcs
git pull
cd compose/svelte-kit
npm install
npm run build
sudo systemctl restart sidak-gcs
```

### View Logs

```bash
# Service logs
sudo journalctl -u sidak-gcs -f

# System logs
sudo journalctl -xe

# Check disk space
df -h
```

### Backup Configuration

```bash
# Backup .env and database
cp ../../.env ~/.env.backup
cp src/data.db ~/data.db.backup

# Or entire data directory
tar -czf ~/gcs-backup-$(date +%Y%m%d).tar.gz ../../.env src/data.db
```

## Support

For issues or questions:
- Check logs: `sudo journalctl -u sidak-gcs -f`
- See full documentation: `MAVLINK_CONNECTION.md`
- Test connections manually with MAVProxy
- Verify hardware connections and permissions
