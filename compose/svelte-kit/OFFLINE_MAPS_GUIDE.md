# Offline Maps Guide for Sidak GCS

This guide explains how to configure Sidak GCS to work with offline map tiles, essential for field operations without internet connectivity.

## Overview

Sidak GCS supports multiple offline map strategies:

1. **Local Tile Server** - Run a tile server that serves cached tiles (Recommended)
2. **File Protocol Tiles** - Serve tiles directly from the static directory
3. **MBTiles Format** - Use compact MBTiles databases
4. **Hybrid Mode** - Offline tiles with online fallback

## Architecture

```
┌─────────────────────────────────────────────────┐
│         Sidak GCS (Leaflet Map)                 │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│          Tile URL Configuration                  │
│  - Local: http://localhost:8080/{z}/{x}/{y}.png │
│  - File: /map/tiles/{z}/{x}/{y}.png            │
│  - MBTiles: Custom tile server                  │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│          Offline Tile Storage                    │
│  static/map/tiles/{z}/{x}/{y}.png               │
│  OR                                              │
│  tiles.mbtiles (compact database)               │
└─────────────────────────────────────────────────┘
```

## Method 1: Local Tile Server (Recommended)

### Step 1: Install Tile Server

We'll use `tileserver-gl-light` for serving MBTiles or a simple static file server.

**Option A: Using Node.js static server (Simple)**

```bash
# Install http-server globally
npm install -g http-server

# Or use locally in your project
npm install --save-dev http-server
```

**Option B: Using TileServer GL (Advanced)**

```bash
# Install tileserver-gl-light
npm install -g tileserver-gl-light
```

### Step 2: Download Map Tiles

Use one of these tools to download tiles for your operation area:

**Option A: Using MOBAC (Mobile Atlas Creator)**

1. Download MOBAC: https://mobac.sourceforge.io/
2. Select map source (OpenStreetMap, etc.)
3. Define your area of interest
4. Select zoom levels (typically 10-18 for drone operations)
5. Choose "OSM PNG" or "MBTiles" format
6. Export tiles

**Option B: Using tile-dl script** (see scripts/tile-dl.js below)

```bash
# Download tiles for a specific area
node scripts/tile-dl.js --lat=37.7749 --lon=-122.4194 --radius=10 --zoom=10-18
```

**Option C: Using Offline Map Maker Chrome Extension**

1. Install "Offline Map Maker" Chrome extension
2. Navigate to your area on OpenStreetMap
3. Select download area and zoom levels
4. Export as tiles

### Step 3: Organize Tiles

Place downloaded tiles in this structure:

```
static/map/tiles/
  {zoom}/
    {x}/
      {y}.png
```

Example:
```
static/map/tiles/
  10/
    163/
      395.png
      396.png
  11/
    326/
      790.png
```

### Step 4: Start Tile Server

**For Static Files:**

```bash
# From project root
http-server static/map/tiles -p 8080 --cors
```

**For MBTiles:**

```bash
# Place your .mbtiles file in a directory
tileserver-gl-light tiles.mbtiles -p 8080
```

### Step 5: Configure GCS

Update your tile configuration to point to local server:

**In Integrations page:**

1. Navigate to **Integrations** → **Map Tiles**
2. Set custom tile URLs:
   - Light: `http://localhost:8080/{z}/{x}/{y}.png`
   - Dark: `http://localhost:8080/{z}/{x}/{y}.png`
   - Satellite: `http://localhost:8080/{z}/{x}/{y}.png`

**OR via environment variables:**

```env
TILE_LIGHT_URL=http://localhost:8080/{z}/{x}/{y}.png
TILE_DARK_URL=http://localhost:8080/{z}/{x}/{y}.png
TILE_SATELLITE_URL=http://localhost:8080/{z}/{x}/{y}.png
```

## Method 2: File Protocol (No Server Needed)

### Step 1: Place Tiles in Static Directory

```
static/map/tiles/
  osm/     # OpenStreetMap tiles
    {z}/{x}/{y}.png
  sat/     # Satellite tiles
    {z}/{x}/{y}.png
```

### Step 2: Configure URLs

Use relative URLs in your configuration:

```typescript
light: '/map/tiles/osm/{z}/{x}/{y}.png'
satellite: '/map/tiles/sat/{z}/{x}/{y}.png'
```

**Note**: This method works when GCS is served from the same origin. Won't work with `file://` protocol directly.

## Method 3: Docker Tile Server

### Step 1: Create Tile Server Container

**docker-compose.yml addition:**

```yaml
services:
  tileserver:
    image: maptiler/tileserver-gl-light
    ports:
      - "8080:80"
    volumes:
      - ./tiles:/data
    command: --verbose
    restart: unless-stopped
```

### Step 2: Add Tiles

Place `tiles.mbtiles` or tile directories in `./tiles` folder.

### Step 3: Start

```bash
docker-compose up -d tileserver
```

### Step 4: Configure GCS

Point to: `http://localhost:8080/styles/osm-bright/{z}/{x}/{y}.png`

## Downloading Tiles for Your Area

### Using Provided Script

Create `scripts/tile-dl.js`:

```javascript
// See script below
```

**Usage:**

```bash
# Download 10km radius around a location
node scripts/tile-dl.js \\
  --lat 37.7749 \\
  --lon -122.4194 \\
  --radius 10 \\
  --zoom 10-18 \\
  --output ./static/map/tiles

# Download specific bounding box
node scripts/tile-dl.js \\
  --bbox "37.7,-122.5,37.8,-122.3" \\
  --zoom 12-16 \\
  --output ./tiles
```

### Calculating Required Storage

**Rough estimates:**

- **Zoom 10**: ~100 tiles, ~5MB
- **Zoom 12**: ~1,500 tiles, ~75MB
- **Zoom 14**: ~25,000 tiles, ~1.2GB
- **Zoom 16**: ~400,000 tiles, ~20GB
- **Zoom 18**: ~6,400,000 tiles, ~320GB

**For 10km radius at zoom 10-16**: ~1.3GB
**For 10km radius at zoom 10-18**: ~321GB

**Recommendations:**
- **Survey missions**: Zoom 14-18 (detailed)
- **Transit flights**: Zoom 10-14 (overview)
- **Emergency ops**: Zoom 12-16 (balanced)

## Tile Sources for Offline Use

### OpenStreetMap
- **License**: ODbL (Open Database License)
- **Usage**: Free, attribution required
- **Source**: https://tile.openstreetmap.org/{z}/{x}/{y}.png
- **Best for**: Street maps, urban areas

### USGS Imagery
- **License**: Public domain
- **Usage**: Free, no attribution required
- **Source**: https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}
- **Best for**: Satellite imagery (US only)

### Esri World Imagery
- **License**: Esri terms
- **Usage**: Free with attribution
- **Source**: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
- **Best for**: Global satellite imagery

### OpenTopoMap
- **License**: CC-BY-SA
- **Usage**: Free with attribution
- **Source**: https://tile.opentopomap.org/{z}/{x}/{y}.png
- **Best for**: Topographic maps, elevation

## Hybrid Mode (Online + Offline)

Configure fallback behavior:

### Option 1: Primary Offline, Online Fallback

```typescript
// In tiles.ts
export function resolveOfflineTiles(config: TileConfig = {}): TileSources {
  const offline = isOfflineMode(); // Check connectivity
  
  if (offline) {
    return {
      light: 'http://localhost:8080/osm/{z}/{x}/{y}.png',
      dark: 'http://localhost:8080/osm/{z}/{x}/{y}.png',
      satellite: 'http://localhost:8080/sat/{z}/{x}/{y}.png',
      osmAttribution: 'OpenStreetMap (Offline)',
      satelliteAttribution: 'Satellite (Offline)'
    };
  }
  
  // Fall back to online
  return resolveTiles(config);
}
```

### Option 2: Auto-detect and Switch

```typescript
// Check if local tile server is available
async function checkTileServer(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8080/10/163/395.png', {
      method: 'HEAD',
      timeout: 1000
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

## Raspberry Pi Setup

### Running Tile Server on Pi

```bash
# Install Node.js (if not already)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install tile server
sudo npm install -g http-server

# Create systemd service
sudo nano /etc/systemd/system/tileserver.service
```

**Service file:**

```ini
[Unit]
Description=Map Tile Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/gcs/static/map
ExecStart=/usr/bin/http-server tiles -p 8080 --cors
Restart=always

[Install]
WantedBy=multi-user.target
```

**Enable and start:**

```bash
sudo systemctl enable tileserver
sudo systemctl start tileserver
```

### Storage Options

**SD Card**: 32GB+ recommended
**USB Drive**: Mount and store tiles
**Network Storage**: NFS/SMB mount

```bash
# Mount USB drive
sudo mount /dev/sda1 /mnt/tiles

# Update tile path
ExecStart=/usr/bin/http-server /mnt/tiles -p 8080 --cors
```

## MBTiles Format (Recommended)

MBTiles is a compact SQLite database format for tiles.

### Creating MBTiles

**Using MOBAC:**
1. Select "MBTiles SQLite" format
2. Export your area

**Using tilelive-copy:**

```bash
npm install -g @mapbox/tilelive @mapbox/mbtiles tilelive-http

tilelive-copy \\
  --minzoom=10 --maxzoom=16 \\
  --bounds="37.7,-122.5,37.8,-122.3" \\
  "http://tile.openstreetmap.org/{z}/{x}/{y}.png" \\
  tiles.mbtiles
```

### Serving MBTiles

```bash
npm install -g @mapbox/mbtiles tileserver-gl-light

tileserver-gl-light tiles.mbtiles -p 8080
```

**URL format:**
`http://localhost:8080/styles/basic/{z}/{x}/{y}.png`

## Testing Offline Mode

### Verify Tiles Load

1. Start GCS with offline tile configuration
2. Open browser DevTools → Network tab
3. Navigate the map
4. Verify tile requests go to localhost:8080
5. Check for 404 errors (missing tiles)

### Test Coverage

```bash
# Check tile availability for a route
node scripts/check-tile-coverage.js \\
  --route waypoints.json \\
  --zoom 14
```

### Simulate Offline

```bash
# Block external tile servers in /etc/hosts
echo "127.0.0.1 tile.openstreetmap.org" | sudo tee -a /etc/hosts
echo "127.0.0.1 basemaps.cartocdn.com" | sudo tee -a /etc/hosts
```

## Troubleshooting

### Tiles Not Loading

**Check CORS:**
```bash
# Test CORS headers
curl -I -H "Origin: http://localhost:3000" http://localhost:8080/10/163/395.png
```

**Solution:**
```bash
# Add CORS flag
http-server tiles -p 8080 --cors
```

### 404 Errors (Missing Tiles)

**Problem**: Tiles not downloaded for that zoom/area

**Solution**: Download additional tiles or reduce zoom level

### Performance Issues

**Problem**: Slow tile loading

**Solutions:**
- Use MBTiles format (faster than file system)
- Enable tile caching
- Use SSD storage
- Reduce max zoom level

### Storage Full

**Problem**: Tiles consume too much space

**Solutions:**
- Reduce zoom levels
- Reduce coverage area
- Use JPEG for satellite (smaller than PNG)
- Use MBTiles (better compression)

## Best Practices

1. **Download During Planning Phase**: Download tiles before going to the field
2. **Test Offline**: Verify offline mode works before deployment
3. **Backup Tiles**: Keep a backup of your tile database
4. **Document Coverage**: Note which areas/zooms you have offline
5. **Update Periodically**: Refresh tiles for changing areas
6. **Use MBTiles**: More efficient than loose files
7. **Right Zoom Levels**: Don't over-download ultra-high zoom
8. **Check Licenses**: Respect tile source terms of service

## Legal Considerations

### Tile Usage Policies

**OpenStreetMap**: 
- Must provide attribution
- Don't exceed usage limits when downloading
- Consider running your own tile server for heavy use

**Google Maps**:
- Terms prohibit offline caching without license
- Use for reference only during development

**Esri**:
- Free with attribution
- Check current terms for offline usage

**USGS**:
- Public domain, no restrictions

### Fair Use Guidelines

- Don't hammer tile servers (rate limit downloads)
- Use tile expiry/update mechanisms
- Provide proper attribution
- Consider contributing to OSM for updates

## Production Deployment

### Embedded Systems (Raspberry Pi)

1. Pre-download tiles before deployment
2. Run local tile server on boot
3. Configure GCS to use localhost
4. Test in disconnected environment

### Air-gapped Systems

1. Download tiles on connected system
2. Transfer MBTiles file via USB
3. Install on air-gapped system
4. Configure for file:// or localhost URLs

### Mobile/Field Operations

1. Download tiles for mission area
2. Copy to laptop/tablet
3. Use USB tile server or local files
4. Verify coverage before departure

## Example Configurations

### Configuration 1: Urban Survey

```bash
# Download urban area, high detail
node scripts/tile-dl.js \\
  --lat 40.7128 --lon -74.0060 \\
  --radius 5 \\
  --zoom 14-18 \\
  --output ./tiles/nyc
```

**Storage**: ~800MB
**Coverage**: 5km radius, zoom 14-18
**Use case**: Detailed urban inspection

### Configuration 2: Rural Operations

```bash
# Download rural area, lower detail
node scripts/tile-dl.js \\
  --lat 44.9778 --lon -93.2650 \\
  --radius 25 \\
  --zoom 10-16 \\
  --output ./tiles/rural
```

**Storage**: ~2GB
**Coverage**: 25km radius, zoom 10-16
**Use case**: Agricultural, infrastructure

### Configuration 3: Emergency Response

```bash
# Download disaster zone, balanced detail
node scripts/tile-dl.js \\
  --bbox "29.9,-90.2,30.1,-89.9" \\
  --zoom 12-17 \\
  --output ./tiles/emergency
```

**Storage**: ~1.5GB
**Coverage**: City area, zoom 12-17
**Use case**: Search and rescue

## Next Steps

1. Choose your offline strategy (tile server recommended)
2. Download tiles for your operational area
3. Configure GCS to use offline tiles
4. Test in offline mode
5. Deploy to field systems

## Resources

- [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
- [MBTiles Specification](https://github.com/mapbox/mbtiles-spec)
- [TileServer GL](https://tileserver.readthedocs.io/)
- [Mobile Atlas Creator](https://mobac.sourceforge.io/)
- [Leaflet Documentation](https://leafletjs.com/reference.html)
