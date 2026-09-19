# Offline Maps Implementation Summary

## Overview

Comprehensive offline mapping solution implemented for Sidak GCS, enabling field operations without internet connectivity.

## Files Created

### Documentation

1. **`OFFLINE_MAPS_GUIDE.md`** - Complete guide covering all offline mapping strategies
2. **`OFFLINE_MAPS_QUICKSTART.md`** - 10-minute quick start guide
3. **`OFFLINE_MAPS_SUMMARY.md`** - This file

### Scripts

4. **`scripts/tile-dl.js`** - Tile downloader utility
5. **`scripts/start-tile-server.sh`** - Linux/Mac tile server startup script
6. **`scripts/start-tile-server.ps1`** - Windows PowerShell tile server startup script

### Configuration

7. **`.env.offline.example`** - Example environment configuration for offline mode
8. **`src/lib/tiles.ts`** - Updated to support offline tile sources

## Implementation Details

### Architecture

```
┌──────────────────────────────────────────┐
│         Sidak GCS (Leaflet Map)          │
│  - Displays map with tile layers         │
│  - Configurable tile sources             │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│      Tile Source Resolution              │
│  - Online: MapTiler, OSM, Google         │
│  - Offline: Local tile server            │
│  - Hybrid: Auto-detect and fallback      │
└──────────────┬───────────────────────────┘
               │
          ┌────┴────┐
          │         │
    Online Mode   Offline Mode
          │         │
          ▼         ▼
    ┌─────────┐  ┌────────────────┐
    │Internet │  │ Local Server   │
    │ Tiles   │  │ localhost:8080 │
    └─────────┘  └────────┬───────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │  Tile Storage   │
                 │  /map/tiles/    │
                 │  {z}/{x}/{y}.png│
                 └─────────────────┘
```

### Features Implemented

#### 1. Tile Download Utility

**`scripts/tile-dl.js`** provides:

- Download by center point + radius
- Download by bounding box
- Multiple tile sources (OSM, Esri, USGS, CARTO)
- Concurrent downloads with rate limiting
- Progress tracking
- Storage estimation
- Resume capability (skips existing tiles)

**Usage:**
```bash
node scripts/tile-dl.js --lat 37.7 --lon -122.4 --radius 10 --zoom 12-16
```

#### 2. Tile Server Scripts

**PowerShell** (`start-tile-server.ps1`):
- Windows-compatible
- Pre-flight checks (directory, dependencies)
- Tile count reporting
- Configuration display

**Bash** (`start-tile-server.sh`):
- Linux/Mac compatible
- Same features as PowerShell version

**Both serve tiles via http-server with CORS enabled**

#### 3. Updated Tile Configuration

**`src/lib/tiles.ts`** now supports:

- **OFFLINE_MODE** environment variable
- **TILE_SERVER_URL** configuration
- Offline-first tile resolution
- Fallback to online when offline unavailable
- Offline presets in Integrations UI

**Environment variables:**
```env
OFFLINE_TILES=true
TILE_SERVER_URL=http://localhost:8080
```

**Code changes:**
- Added offline mode detection
- Added offline tile URL templates
- Added offline presets
- Added `checkOfflineTileServer()` utility

#### 4. Configuration Templates

**`.env.offline.example`** provides template for:
- Enabling offline mode
- Setting tile server URL
- Custom tile URLs
- Attribution text

## Usage Scenarios

### Scenario 1: Field Operations (Complete Offline)

**Setup:**
1. Download tiles before deployment
2. Copy tiles to field system
3. Start tile server on boot
4. Configure GCS for offline mode

**Result:** Fully functional without internet

### Scenario 2: Development/Testing (Hybrid)

**Setup:**
1. Download tiles for test area
2. Start tile server locally
3. GCS uses offline tiles when available
4. Falls back to online for missing areas

**Result:** Fast local tiles + online coverage

### Scenario 3: Emergency Response (Pre-cached Areas)

**Setup:**
1. Pre-download common emergency zones
2. Multiple zoom levels for detail
3. Quick deployment package
4. Auto-start tile server

**Result:** Immediate map availability

## Quick Start

### 1-Minute Test

```powershell
# Install tile server
npm install -g http-server

# Download small test area (50MB)
node scripts/tile-dl.js --lat 37.7 --lon -122.4 --radius 2 --zoom 14-15

# Start tile server
.\scripts\start-tile-server.ps1

# In another terminal, start GCS
$env:OFFLINE_TILES="true"; npm run dev

# Visit http://localhost:3000 and verify tiles load from localhost:8080
```

### 10-Minute Full Setup

See `OFFLINE_MAPS_QUICKSTART.md`

## Storage Requirements

### By Coverage Area (Zoom 12-16)

| Radius | Storage | Tiles | Download Time* |
|--------|---------|-------|----------------|
| 2 km | ~50 MB | ~1,200 | 2 min |
| 5 km | ~500 MB | ~12,000 | 20 min |
| 10 km | ~1.3 GB | ~32,000 | 50 min |
| 25 km | ~8 GB | ~200,000 | 5 hours |

*Approximate, depends on connection speed and rate limiting

### By Zoom Level (10km radius)

| Zoom Levels | Storage | Use Case |
|-------------|---------|----------|
| 10-14 | ~200 MB | Overview, transit |
| 12-16 | ~1.3 GB | General operations |
| 14-18 | ~20 GB | Detailed survey |
| 10-18 | ~22 GB | Complete coverage |

## Deployment Options

### Option 1: Embedded System (Raspberry Pi)

```bash
# systemd service for auto-start
sudo systemctl enable tileserver
sudo systemctl start tileserver
```

Tiles stored on SD card or USB drive

### Option 2: Laptop/Tablet (Portable)

- Tiles on laptop hard drive
- Start tile server before field ops
- No internet required

### Option 3: Docker Container

```yaml
# docker-compose.yml
services:
  tileserver:
    image: nginx:alpine
    volumes:
      - ./tiles:/usr/share/nginx/html:ro
    ports:
      - "8080:80"
```

### Option 4: Static Files (No Server)

Serve tiles directly from GCS static directory:
```
static/map/tiles/{z}/{x}/{y}.png
```

Use URL: `/map/tiles/{z}/{x}/{y}.png`

## Supported Tile Sources

### OpenStreetMap (Free)
- **URL**: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- **Max Zoom**: 19
- **License**: ODbL (attribution required)
- **Best For**: Street maps, urban areas

### Esri World Imagery (Free)
- **URL**: `https://server.arcgisonline.com/.../tile/{z}/{y}/{x}`
- **Max Zoom**: 19
- **License**: Esri terms (attribution required)
- **Best For**: Satellite imagery, global coverage

### USGS Imagery (Public Domain)
- **URL**: `https://basemap.nationalmap.gov/.../tile/{z}/{y}/{x}`
- **Max Zoom**: 16
- **License**: Public domain
- **Best For**: US satellite imagery, no attribution needed

### CARTO (Free)
- **Light/Dark**: Basemap styles
- **Max Zoom**: 20
- **License**: CC-BY (attribution required)
- **Best For**: Clean, minimal maps

## Configuration Methods

### Method 1: Environment Variable (Recommended)

```env
# .env.local
OFFLINE_TILES=true
TILE_SERVER_URL=http://localhost:8080
```

**Pros:**
- Easy to toggle
- No UI changes needed
- Can be committed to repo (with .example)

### Method 2: Integrations UI

1. Navigate to Integrations
2. Set custom tile URLs
3. Save configuration

**Pros:**
- User-friendly
- No file editing
- Per-user configuration

### Method 3: Direct URLs

Hardcode in `tiles.ts`:

**Pros:**
- No configuration needed
- Works immediately

**Cons:**
- Less flexible
- Requires code change

## Testing & Verification

### Verify Offline Mode

1. **Check Network Tab:**
   - Open browser DevTools
   - Go to Network tab
   - Filter for "tile" or "png"
   - Verify requests go to localhost:8080

2. **Test Tile Server:**
   ```powershell
   # Test direct tile access
   Start-Process "http://localhost:8080/osm/10/163/395.png"
   ```

3. **Simulate Complete Offline:**
   - Disable network adapter
   - Or block online tile servers in hosts file
   - Verify map still loads

### Check Coverage

Create a simple checker:

```javascript
// scripts/check-coverage.js
const fs = require('fs');

function checkTile(z, x, y, source = 'osm') {
  const path = `./static/map/tiles/${source}/${z}/${x}/${y}.png`;
  return fs.existsSync(path);
}

// Check tiles along a route
const waypoints = [
  { lat: 37.7749, lon: -122.4194 },
  { lat: 37.7849, lon: -122.4094 }
];

// Convert to tiles and check availability
```

## Performance Optimization

### MBTiles Format

Convert loose tiles to SQLite database:

```bash
npm install -g @mapbox/mbutil
mb-util --image_format=png ./tiles/osm osm.mbtiles
```

**Benefits:**
- Faster access (one file vs thousands)
- Better compression
- Easier to transfer

### Nginx vs http-server

For production, use Nginx:

```nginx
server {
    listen 8080;
    location / {
        root /path/to/tiles;
        add_header Access-Control-Allow-Origin *;
        expires 30d;
        access_log off;
    }
}
```

**Benefits:**
- Much faster
- Better caching
- Production-ready

### Tile Compression

Use JPEG for satellite imagery:

```bash
node scripts/tile-dl.js --format jpg --source esri
```

**Benefits:**
- 60-80% smaller files
- Still good quality
- Faster downloads

## Maintenance

### Updating Tiles

Periodically refresh tiles for changing areas:

```bash
# Re-download area (skips existing tiles)
node scripts/tile-dl.js --lat LAT --lon LON --radius 10 --zoom 12-16
```

### Backup Strategy

```powershell
# Backup tiles
Compress-Archive -Path ./static/map/tiles -DestinationPath tiles-backup.zip

# Restore
Expand-Archive -Path tiles-backup.zip -DestinationPath ./static/map
```

### Monitor Storage

```powershell
# Check tile storage usage
Get-ChildItem -Path ./static/map/tiles -Recurse | 
  Measure-Object -Property Length -Sum | 
  Select-Object @{Name="SizeMB";Expression={[math]::Round($_.Sum / 1MB, 2)}}
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Gray tiles | Tiles not downloaded | Download for that zoom level |
| CORS error | Missing --cors flag | Add --cors to http-server |
| 404 errors | Wrong tile path | Verify URL format matches storage |
| Slow loading | Too many tiles | Use MBTiles format |
| Out of storage | Too much coverage | Reduce zoom levels or area |

### Debug Mode

Enable verbose logging:

```typescript
// In Map.svelte
console.log('Loading tile:', url);
```

## Best Practices

1. **Plan Before Download**
   - Map your operational area
   - Choose appropriate zoom levels
   - Estimate storage requirements

2. **Test Offline Mode**
   - Verify before field deployment
   - Test with network disabled
   - Check all zoom levels work

3. **Backup Your Tiles**
   - Keep a copy on another drive
   - Document coverage areas
   - Version your tile sets

4. **Respect Tile Policies**
   - Rate limit downloads (100-200ms delay)
   - Provide attribution
   - Don't redistribute without permission

5. **Optimize Storage**
   - Use JPEG for satellite
   - Delete unnecessary zoom levels
   - Consider MBTiles format

## Production Checklist

- [ ] Tiles downloaded for operational area
- [ ] Tile server configured for auto-start
- [ ] GCS configured for offline mode
- [ ] Tested with network disabled
- [ ] Tile backup created
- [ ] Coverage documented
- [ ] Attribution configured
- [ ] Performance tested

## Future Enhancements

Potential improvements:

1. **Auto-download on mission planning**
2. **Built-in tile server** (eliminate external dependency)
3. **Tile expiry/refresh system**
4. **Coverage visualizer** (show which areas are cached)
5. **Tile priority download** (mission path first)
6. **WebP support** (better compression)
7. **Vector tiles** (smaller, scalable)
8. **Differential updates** (only changed tiles)

## Resources

- [Full Guide](OFFLINE_MAPS_GUIDE.md)
- [Quick Start](OFFLINE_MAPS_QUICKSTART.md)
- [OpenStreetMap Tile Policy](https://operations.osmfoundation.org/policies/tiles/)
- [MBTiles Specification](https://github.com/mapbox/mbtiles-spec)
- [Leaflet Documentation](https://leafletjs.com/)

## Support

For issues or questions:
1. Check troubleshooting section
2. Review browser console for errors
3. Test tile server directly
4. Verify tile download completed
5. Check environment configuration

---

**Quick Commands:**

```powershell
# Download tiles
node scripts/tile-dl.js --lat 37.7 --lon -122.4 --radius 10 --zoom 12-16

# Start tile server
.\scripts\start-tile-server.ps1

# Start GCS offline
$env:OFFLINE_TILES="true"; npm run dev
```

## License

Same as Sidak GCS project. Respect tile source licenses when downloading and using tiles.
