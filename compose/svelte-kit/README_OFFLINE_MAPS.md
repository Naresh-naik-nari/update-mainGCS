# Offline Maps for Sidak GCS

Your GCS now supports **fully offline map operation**, essential for field missions without internet connectivity.

## 🚀 Quick Start (5 Minutes)

```powershell
# 1. Download tiles for your area (example: 5km radius, zoom 14-16)
npm run tiles:download -- --lat 37.7749 --lon -122.4194 --radius 5 --zoom 14-16

# 2. Start tile server (in separate terminal)
npm run tiles:serve

# 3. Configure GCS to use offline tiles:
#    - Start GCS: npm run dev
#    - Navigate to Integrations → Map Tiles
#    - Set Light URL: http://localhost:8080/osm/{z}/{x}/{y}.png
#    - Set Dark URL: http://localhost:8080/carto_dark/{z}/{x}/{y}.png
#    - Set Satellite URL: http://localhost:8080/satellite/{z}/{x}/{y}.png
#    - Click Save
```

Done! Your maps now work offline.

## 📚 Documentation

| Document | Purpose | Time to Read |
|----------|---------|--------------|
| [**Quick Start**](OFFLINE_MAPS_QUICKSTART.md) | Get started in 10 minutes | 5 min |
| [**Full Guide**](OFFLINE_MAPS_GUIDE.md) | Complete reference | 30 min |
| [**Summary**](OFFLINE_MAPS_SUMMARY.md) | Implementation details | 10 min |

## 📦 What You Get

### ✅ Features

- **Complete Offline Operation** - No internet needed in the field
- **Multiple Tile Sources** - OSM, Esri, USGS, CARTO
- **Easy Download** - Script downloads tiles for your area
- **Auto-configured** - Works out of the box
- **Production Ready** - Tested for embedded systems

### 📁 Files Added

```
scripts/
  ├── tile-dl.js                    # Download map tiles
  ├── start-tile-server.sh          # Start server (Linux/Mac)
  └── start-tile-server.ps1         # Start server (Windows)

docs/
  ├── OFFLINE_MAPS_GUIDE.md         # Complete guide
  ├── OFFLINE_MAPS_QUICKSTART.md    # Quick start
  ├── OFFLINE_MAPS_SUMMARY.md       # Implementation summary
  └── README_OFFLINE_MAPS.md        # This file

config/
  └── .env.offline.example          # Environment config example

src/lib/
  └── tiles.ts                      # Updated for offline support
```

## 🎯 Use Cases

### Field Operations
```powershell
# Download mission area before departure
npm run tiles:download -- --lat YOUR_LAT --lon YOUR_LON --radius 10 --zoom 12-16

# Deploy to field system → Maps work without internet
```

### Emergency Response
```powershell
# Pre-download disaster zones
npm run tiles:download -- --bbox "29.9,-90.2,30.1,-89.9" --zoom 12-17

# Quick deployment with offline maps ready
```

### Development/Testing
```powershell
# Local tiles load faster than online
npm run tiles:serve
npm run dev:offline
```

## ⚙️ Configuration

### Method 1: Integrations UI (Recommended)

1. Start GCS: `npm run dev`
2. Navigate to **Integrations** → **Map Tiles**
3. Set custom URLs:
   - Light: `http://localhost:8080/osm/{z}/{x}/{y}.png`
   - Dark: `http://localhost:8080/carto_dark/{z}/{x}/{y}.png`
   - Satellite: `http://localhost:8080/satellite/{z}/{x}/{y}.png`
4. Click **Save**

### Method 2: Static Files (No Server)

Serve tiles directly from GCS static directory:
```
static/map/tiles/{z}/{x}/{y}.png
```

Configure in Integrations:
- Light: `/map/tiles/osm/{z}/{x}/{y}.png`
- Satellite: `/map/tiles/satellite/{z}/{x}/{y}.png`

## 📊 Storage Guide

| Coverage | Zoom | Storage | Download Time |
|----------|------|---------|---------------|
| 2km radius | 14-16 | ~50 MB | 2 min |
| 5km radius | 12-16 | ~500 MB | 20 min |
| 10km radius | 12-16 | ~1.3 GB | 50 min |
| 25km radius | 10-15 | ~8 GB | 5 hours |

**Recommendation for most missions:** 10km radius, zoom 12-16 (~1.3 GB)

## 🛠️ NPM Scripts

```powershell
# Development
npm run dev                # Start GCS (configure tiles via Integrations UI)

# Tile Management
npm run tiles:download     # Download tiles (interactive)
npm run tiles:serve        # Start tile server

# Examples
npm run tiles:download -- --lat 37.7 --lon -122.4 --radius 10 --zoom 12-16
npm run tiles:download -- --bbox "37.7,-122.5,37.8,-122.3" --zoom 14-16
```

## 🔧 Command Reference

### Download Tiles

**By Center + Radius:**
```powershell
npm run tiles:download -- --lat LAT --lon LON --radius KM --zoom MIN-MAX
```

**By Bounding Box:**
```powershell
npm run tiles:download -- --bbox "minLat,minLon,maxLat,maxLon" --zoom MIN-MAX
```

**Options:**
- `--source` - Tile source (osm, esri, usgs, carto_light, carto_dark)
- `--format` - Output format (png, jpg)
- `--delay` - Delay between requests (default: 100ms)
- `--concurrency` - Concurrent downloads (default: 4)
- `--output` - Output directory (default: ./static/map/tiles)

### Tile Sources

- **osm** - OpenStreetMap (street maps)
- **esri** - Esri World Imagery (satellite)
- **usgs** - USGS Imagery (US satellite, public domain)
- **carto_light** - CARTO Light (clean street map)
- **carto_dark** - CARTO Dark (dark mode)

## 🎬 Complete Example

```powershell
# 1. Download OpenStreetMap tiles
npm run tiles:download -- \
  --lat 37.7749 \
  --lon -122.4194 \
  --radius 10 \
  --zoom 12-16 \
  --source osm

# 2. Download satellite imagery (optional)
npm run tiles:download -- \
  --lat 37.7749 \
  --lon -122.4194 \
  --radius 10 \
  --zoom 14-17 \
  --source esri \
  --format jpg

# 3. Start tile server (separate terminal)
npm run tiles:serve

# 4. Start GCS
npm run dev

# 5. Configure offline tiles (in GCS):
#    Integrations → Map Tiles
#    Light: http://localhost:8080/osm/{z}/{x}/{y}.png
#    Save

# 6. Verify in browser: http://localhost:5173
# Check Network tab → tiles load from localhost:8080 ✓
```

## 🚢 Production Deployment

### Raspberry Pi (Systemd)

```bash
# Install dependencies
sudo npm install -g http-server

# Create service file
sudo nano /etc/systemd/system/tileserver.service
```

Add:
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

Enable:
```bash
sudo systemctl enable tileserver
sudo systemctl start tileserver
```

### Docker

Add to `docker-compose.yml`:

```yaml
services:
  tileserver:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./static/map/tiles:/usr/share/nginx/html:ro
    command: >
      sh -c "echo 'add_header Access-Control-Allow-Origin *;' > /etc/nginx/conf.d/cors.conf &&
             nginx -g 'daemon off;'"
    restart: unless-stopped
```

Start:
```bash
docker-compose up -d tileserver
```

## 🐛 Troubleshooting

### Tiles Not Loading

**Symptom:** Gray squares on map

**Check:**
1. Is tile server running? `http://localhost:8080`
2. Are tiles downloaded? Check `static/map/tiles/`
3. Is CORS enabled? Add `--cors` flag

**Solution:**
```powershell
# Restart tile server with CORS
npm run tiles:serve
```

### CORS Errors

**Symptom:** Console shows CORS policy errors

**Solution:**
```powershell
# Ensure --cors flag is present
http-server ./static/map/tiles -p 8080 --cors
```

### Out of Storage

**Symptom:** Download fails or disk full

**Solutions:**
- Reduce zoom range: `--zoom 12-15` instead of `10-18`
- Smaller area: `--radius 5` instead of `25`
- Use JPEG: `--format jpg` for satellite imagery
- External storage: Download to USB drive

### Missing Tiles

**Symptom:** Some areas show gray tiles

**Cause:** Tiles not downloaded for that zoom level

**Solution:**
```powershell
# Download missing zoom levels
npm run tiles:download -- --lat LAT --lon LON --radius 10 --zoom 16-18
```

## 📖 Detailed Documentation

### For Users
- **[Quick Start](OFFLINE_MAPS_QUICKSTART.md)** - Get running in 10 minutes
- **[Full Guide](OFFLINE_MAPS_GUIDE.md)** - Complete reference with all options

### For Developers
- **[Implementation Summary](OFFLINE_MAPS_SUMMARY.md)** - Technical details
- **[Connection Modal Integration](CONNECTION_MODAL_INTEGRATION.md)** - Recent updates

## 💡 Tips & Best Practices

1. **Plan Your Coverage**
   - Map operational area before downloading
   - Choose appropriate zoom levels
   - Estimate storage needs

2. **Test Offline Mode**
   - Download tiles
   - Disable network
   - Verify map loads

3. **Backup Your Tiles**
   ```powershell
   Compress-Archive -Path ./static/map/tiles -DestinationPath tiles-backup.zip
   ```

4. **Rate Limiting**
   - Don't overwhelm tile servers
   - Use default delay (100ms)
   - Download during off-peak hours

5. **Legal Compliance**
   - Provide attribution
   - Respect terms of service
   - Don't redistribute without permission

## 🎓 Example Missions

### Urban Survey (Detailed)
```powershell
npm run tiles:download -- --lat 40.7128 --lon -74.0060 --radius 5 --zoom 14-18 --source osm
# ~800MB, high detail for urban inspection
```

### Rural Agriculture (Wide Area)
```powershell
npm run tiles:download -- --lat 44.9778 --lon -93.2650 --radius 25 --zoom 10-15 --source esri
# ~2GB satellite imagery for large farms
```

### Emergency Response (Balanced)
```powershell
npm run tiles:download -- --bbox "29.9,-90.2,30.1,-89.9" --zoom 12-17 --source osm
# ~1.5GB for city-scale emergency ops
```

## 🔗 Resources

- [OpenStreetMap Tile Policy](https://operations.osmfoundation.org/policies/tiles/)
- [MBTiles Specification](https://github.com/mapbox/mbtiles-spec)
- [Leaflet Documentation](https://leafletjs.com/)
- [TileServer GL](https://tileserver.readthedocs.io/)

## ❓ FAQ

**Q: Do I need internet to download tiles?**  
A: Yes, but only once. After downloading, everything works offline.

**Q: How much storage do I need?**  
A: For typical missions (10km radius, zoom 12-16): ~1-2GB

**Q: Can I use multiple tile sources?**  
A: Yes! Download different sources to separate folders.

**Q: Does this work on mobile?**  
A: Yes, if you run the tile server on the same network.

**Q: Can I update tiles later?**  
A: Yes, re-run the download command. It skips existing tiles.

**Q: Is this legal?**  
A: Yes, but respect tile source terms. Provide attribution.

## 🆘 Support

1. Check [Troubleshooting](#troubleshooting) section
2. Read [Full Guide](OFFLINE_MAPS_GUIDE.md)
3. Test tile server: `http://localhost:8080`
4. Check browser console for errors
5. Verify tiles exist in `static/map/tiles/`

## ✅ Quick Test

```powershell
# 1. Download small test area (2 minutes, ~50MB)
npm run tiles:download -- --lat 37.7749 --lon -122.4194 --radius 2 --zoom 14-15

# 2. Start tile server
npm run tiles:serve

# 3. Start GCS (new terminal)
npm run dev:offline

# 4. Open http://localhost:5173
# 5. Pan to San Francisco
# 6. Verify tiles load from localhost:8080 in Network tab ✅
```

---

**Need help?** Read the [Quick Start Guide](OFFLINE_MAPS_QUICKSTART.md) or [Full Documentation](OFFLINE_MAPS_GUIDE.md).
