# Start Offline Tile Server for Sidak GCS (PowerShell version)
# This script starts a simple HTTP server to serve offline map tiles

param(
    [string]$TileDir = "./static/map/tiles",
    [int]$Port = 8080
)

Write-Host "Starting Offline Tile Server" -ForegroundColor Green
Write-Host "=============================="
Write-Host ""

# Check if tile directory exists
if (-not (Test-Path $TileDir)) {
    Write-Host "Warning: Tile directory not found: $TileDir" -ForegroundColor Yellow
    Write-Host "Creating directory..."
    New-Item -ItemType Directory -Path $TileDir -Force | Out-Null
    Write-Host ""
    Write-Host "Please download tiles using:"
    Write-Host "  node scripts/tile-dl.js --lat YOUR_LAT --lon YOUR_LON --radius 10 --zoom 10-16"
    Write-Host ""
}

# Check if http-server is installed
try {
    $null = Get-Command http-server -ErrorAction Stop
} catch {
    Write-Host "Error: http-server not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install it with:"
    Write-Host "  npm install -g http-server"
    Write-Host ""
    Write-Host "Or locally:"
    Write-Host "  npm install --save-dev http-server"
    Write-Host "  npx http-server $TileDir -p $Port --cors"
    Write-Host ""
    exit 1
}

# Count available tiles
$TileCount = (Get-ChildItem -Path $TileDir -Recurse -Include *.png,*.jpg -File -ErrorAction SilentlyContinue | Measure-Object).Count

Write-Host "Configuration:"
Write-Host "  Tile directory: $TileDir"
Write-Host "  Port: $Port"
Write-Host "  Available tiles: $TileCount"
Write-Host ""

if ($TileCount -eq 0) {
    Write-Host "Warning: No tiles found!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Download tiles first:"
    Write-Host "  node scripts/tile-dl.js --lat 37.7749 --lon -122.4194 --radius 10 --zoom 10-16"
    Write-Host ""
}

Write-Host "Starting server..."
Write-Host ""
Write-Host "Tile server URL: http://localhost:$Port" -ForegroundColor Green
Write-Host ""
Write-Host "Configure GCS to use offline tiles:"
Write-Host "  Light: http://localhost:$Port/osm/{z}/{x}/{y}.png"
Write-Host "  Dark: http://localhost:$Port/carto_dark/{z}/{x}/{y}.png"
Write-Host "  Satellite: http://localhost:$Port/satellite/{z}/{x}/{y}.png"
Write-Host ""
Write-Host "Or set environment variable:"
Write-Host '  $env:OFFLINE_TILES="true"; npm run dev'
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start the server
http-server $TileDir -p $Port --cors
