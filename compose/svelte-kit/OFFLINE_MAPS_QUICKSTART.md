# Offline Maps - Quick Start Guide

Get your Sidak GCS running with offline maps in 10 minutes.

## Prerequisites

- Node.js installed
- Internet connection (for initial tile download)
- ~1-5GB free storage (depending on coverage area)

## Step 1: Install Dependencies

```powershell
# Install http-server for serving tiles
npm install -g http-server
```

## Step 2: Download Map Tiles

Download tiles for your operational area. Examples:

### Small Urban Area (500MB)
```powershell
node scripts/tile-dl.js `
  --lat 37.7749 `
  --lon -122.4194 `
  --radius 5 `
  --zoom 12-16 `
  --source osm
```

### Rural/Agricultural Area (1GB)
```powershell
node scripts/tile-dl.js `
  --lat 44.9778 `
  --lon -93.2650 `
  --radius 15 `
  --zoom 10-15 `
  --source osm
```

### Satellite Imagery (Larger)
```powershell
node scripts/tile-dl.js `
  --lat 37.7749 `
  --lon -122.4194 `
  --radius 5 `
  --zoom 14-17 `
  --source esri `
  --output ./static/map/tiles/satellite
```

**Note**: The script will show you an estimate before downloading. Press 'y' to confirm.

## Step 3: Start Tile Server

### Option A: Using PowerShell Script (Recommended)
```powershell
.\scripts\start-tile-server.ps1
```

### Option B: Manually
```powershell
http-server ./static/map/tiles -p 8080 --cors
```

Leave this running in a separate terminal.

## Step 4: Configure GCS for Offline Mode

### Option A: Environment Variable (Recommended)
```powershell
# Create .env.local file
Copy-Item .env.offline.example .env.local

# Edit .env.local and set:
OFFLINE_TILES=true
TILE_SERVER_URL=http://localhost:8080
```

Then start GCS normally:
```powershell
npm run dev
```

### Option B: Via Integrations UI

1. Start GCS: `npm run dev`
2. Navigate to **Integrations** page
3. Scroll to **Map Tiles** section
4. Set custom URLs:
   - **Light**: `http://localhost:8080/osm/{z}/{x}/{y}.png`
   - **Dark**: `http://localhost:8080/carto_dark/{z}/{x}/{y}.png`
   - **Satellite**: `http://localhost:8080/satellite/{z}/{x}/{y}.png`
5. Click **Save**

## Step 5: Verify

1. Open the map in GCS
2. Pan around your downloaded area
3. Check browser DevTools → Network tab
4. Verify tiles load from `localhost:8080`
5. No external requests to `tile.openstreetmap.org`

## Quick Reference

### Download Commands

**By Center + Radius:**
```powershell
node scripts/tile-dl.js --lat LAT --lon LON --radius KM --zoom MIN-MAX
```

**By Bounding Box:**
```powershell
node scripts/tile-dl.js --bbox "minLat,minLon,maxLat,maxLon" --zoom MIN-MAX
```

### Tile Sources
- `osm` - OpenStreetMap (street maps)
- `esri` - Esri World Imagery (satellite)
- `usgs` - USGS Imagery (US only, satellite)
- `carto_light` - CARTO Light (clean street map)
- `carto_dark` - CARTO Dark (dark mode street map)

### Storage Estimates

| Coverage | Zoom Levels | Storage |
|----------|-------------|---------|
| 5km radius | 14-17 | ~500MB |
| 10km radius | 12-16 | ~1.3GB |
| 25km radius | 10-15 | ~2GB |
| 50km radius | 10-14 | ~1.5GB |

Higher zoom = more detail = more storage.

### Recommended Zoom Levels

| Mission Type | Recommended Zoom |
|--------------|------------------|
| **Overview/Transit** | 10-14 |
| **Survey/Mapping** | 14-18 |
| **Inspection** | 16-19 |
| **Emergency Ops** | 12-16 |

## Troubleshooting

### Tiles Not Loading

**Check tile server is running:**
```powershell
# Test in browser
Start-Process "http://localhost:8080/osm/10/163/395.png"
```

If 404: Tiles not downloaded or wrong path.
If connection refused: Tile server not running.

**Solution:**
```powershell
# Restart tile server
.\scripts\start-tile-server.ps1
```

### CORS Errors

**Symptom**: Console shows CORS policy errors

**Solution**: Ensure `--cors` flag is used:
```powershell
http-server ./static/map/tiles -p 8080 --cors
```

### Gray Tiles

**Symptom**: Map shows gray squares instead of tiles

**Causes:**
1. Tiles not downloaded for that zoom level
2. Wrong tile path/URL
3. Tile server not running

**Solution**: Download tiles for missing zoom levels:
```powershell
node scripts/tile-dl.js --lat LAT --lon LON --radius 10 --zoom 14-16
```

### Out of Storage

**Symptom**: Download fails or runs out of space

**Solutions:**
- Reduce zoom range (e.g., 12-15 instead of 10-18)
- Reduce coverage area (smaller radius)
- Use external USB drive
- Delete unnecessary zoom levels

## Production Deployment

### Raspberry Pi

```bash
# Install dependencies
sudo npm install -g http-server

# Create systemd service
sudo nano /etc/systemd/system/tileserver.service
```

**Service file:**
```ini
[Unit]
Description=Offline Tile Server
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

### Docker

Add to your `docker-compose.yml`:

```yaml
services:
  tileserver:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./static/map/tiles:/usr/share/nginx/html:ro
    command: sh -c "echo 'add_header Access-Control-Allow-Origin *;' > /etc/nginx/conf.d/cors.conf && nginx -g 'daemon off;'"
    restart: unless-stopped
```

Start:
```bash
docker-compose up -d tileserver
```

## Advanced Tips

### Download Multiple Areas

Create a batch script:
```powershell
# locations.ps1
$locations = @(
    @{lat=37.7749; lon=-122.4194; name="sf"},
    @{lat=40.7128; lon=-74.0060; name="nyc"},
    @{lat=34.0522; lon=-118.2437; name="la"}
)

foreach ($loc in $locations) {
    node scripts/tile-dl.js `
        --lat $loc.lat `
        --lon $loc.lon `
        --radius 10 `
        --zoom 12-16 `
        --output "./static/map/tiles/$($loc.name)"
}
```

### Compress Tiles

```powershell
# Create MBTiles archive (requires mbutil)
pip install mbutil
mb-util --image_format=png ./static/map/tiles/osm tiles.mbtiles
```

### Update Tiles

```powershell
# Download only missing tiles (script skips existing)
node scripts/tile-dl.js --lat LAT --lon LON --radius 10 --zoom 14-16
```

## Next Steps

- Read the [full offline maps guide](OFFLINE_MAPS_GUIDE.md)
- Optimize tile coverage for your missions
- Set up auto-start for tile server
- Create tile backups

## Support

**Common Issues:**
- Tiles not loading → Check tile server is running
- CORS errors → Add `--cors` flag to http-server
- Gray tiles → Download tiles for that zoom level
- Storage full → Reduce zoom range or coverage

**Get Help:**
- Check `OFFLINE_MAPS_GUIDE.md` for detailed info
- Review browser console for errors
- Test tile URLs directly in browser

---

**Quick Commands Reference:**

```powershell
# Download tiles
node scripts/tile-dl.js --lat 37.7 --lon -122.4 --radius 10 --zoom 12-16

# Start tile server
.\scripts\start-tile-server.ps1

# Start GCS in offline mode
$env:OFFLINE_TILES="true"; npm run dev

# Test tile server
Start-Process "http://localhost:8080/osm/10/163/395.png"
```
