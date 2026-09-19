#!/bin/bash

# Start Offline Tile Server for Sidak GCS
# This script starts a simple HTTP server to serve offline map tiles

# Configuration
TILE_DIR="${TILE_DIR:-./static/map/tiles}"
PORT="${PORT:-8080}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Offline Tile Server${NC}"
echo "=============================="
echo ""

# Check if tile directory exists
if [ ! -d "$TILE_DIR" ]; then
  echo -e "${YELLOW}Warning: Tile directory not found: $TILE_DIR${NC}"
  echo "Creating directory..."
  mkdir -p "$TILE_DIR"
  echo ""
  echo "Please download tiles using:"
  echo "  node scripts/tile-dl.js --lat YOUR_LAT --lon YOUR_LON --radius 10 --zoom 10-16"
  echo ""
fi

# Check if http-server is installed
if ! command -v http-server &> /dev/null; then
  echo -e "${RED}Error: http-server not found${NC}"
  echo ""
  echo "Install it with:"
  echo "  npm install -g http-server"
  echo ""
  echo "Or locally:"
  echo "  npm install --save-dev http-server"
  echo "  npx http-server $TILE_DIR -p $PORT --cors"
  echo ""
  exit 1
fi

# Count available tiles
TILE_COUNT=$(find "$TILE_DIR" -name "*.png" -o -name "*.jpg" | wc -l)

echo "Configuration:"
echo "  Tile directory: $TILE_DIR"
echo "  Port: $PORT"
echo "  Available tiles: $TILE_COUNT"
echo ""

if [ "$TILE_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}Warning: No tiles found!${NC}"
  echo ""
  echo "Download tiles first:"
  echo "  node scripts/tile-dl.js --lat 37.7749 --lon -122.4194 --radius 10 --zoom 10-16"
  echo ""
fi

echo "Starting server..."
echo ""
echo -e "${GREEN}Tile server URL: http://localhost:$PORT${NC}"
echo ""
echo "Configure GCS to use offline tiles:"
echo "  Light: http://localhost:$PORT/osm/{z}/{x}/{y}.png"
echo "  Dark: http://localhost:$PORT/carto_dark/{z}/{x}/{y}.png"
echo "  Satellite: http://localhost:$PORT/satellite/{z}/{x}/{y}.png"
echo ""
echo "Or set environment variable:"
echo "  OFFLINE_TILES=true npm run dev"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Start the server
http-server "$TILE_DIR" -p "$PORT" --cors
