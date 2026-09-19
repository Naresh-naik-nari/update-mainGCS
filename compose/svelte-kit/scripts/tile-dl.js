#!/usr/bin/env node

/**
 * Offline Map Tile Downloader for Sidak GCS
 * 
 * Downloads map tiles for offline use. Supports OpenStreetMap and other tile sources.
 * 
 * Usage:
 *   node tile-dl.js --lat 37.7749 --lon -122.4194 --radius 10 --zoom 10-16
 *   node tile-dl.js --bbox "37.7,-122.5,37.8,-122.3" --zoom 12-16
 * 
 * Options:
 *   --lat         Center latitude
 *   --lon         Center longitude
 *   --radius      Radius in kilometers
 *   --bbox        Bounding box "minLat,minLon,maxLat,maxLon"
 *   --zoom        Zoom levels "min-max" (e.g., "10-16")
 *   --source      Tile source (osm|esri|usgs) default: osm
 *   --output      Output directory (default: ./static/map/tiles)
 *   --delay       Delay between requests in ms (default: 100)
 *   --concurrency Number of concurrent downloads (default: 4)
 *   --format      Output format (png|jpg) default: png
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    lat: null,
    lon: null,
    radius: null,
    bbox: null,
    zoom: '10-16',
    source: 'osm',
    output: './static/map/tiles',
    delay: 100,
    concurrency: 4,
    format: 'png'
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    if (key in options) {
      options[key] = value;
    }
  }

  return options;
}

// Tile sources
const TILE_SOURCES = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    attribution: 'OpenStreetMap'
  },
  esri: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: [],
    maxZoom: 19,
    attribution: 'Esri'
  },
  usgs: {
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    subdomains: [],
    maxZoom: 16,
    attribution: 'USGS'
  },
  carto_light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 20,
    attribution: 'CARTO'
  },
  carto_dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 20,
    attribution: 'CARTO'
  }
};

// Convert lat/lon to tile coordinates
function latLonToTile(lat, lon, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, z: zoom };
}

// Calculate bounding box from center and radius
function getBoundingBox(lat, lon, radiusKm) {
  const R = 6371; // Earth radius in km
  const latDelta = (radiusKm / R) * (180 / Math.PI);
  const lonDelta = (radiusKm / R) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180);
  
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta
  };
}

// Get all tiles in a bounding box for a specific zoom level
function getTilesInBounds(bounds, zoom) {
  const topLeft = latLonToTile(bounds.maxLat, bounds.minLon, zoom);
  const bottomRight = latLonToTile(bounds.minLat, bounds.maxLon, zoom);
  
  const tiles = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  
  return tiles;
}

// Build tile URL
function getTileUrl(tile, source) {
  const config = TILE_SOURCES[source];
  let url = config.url;
  
  // Replace placeholders
  url = url.replace('{z}', tile.z);
  url = url.replace('{x}', tile.x);
  url = url.replace('{y}', tile.y);
  url = url.replace('{r}', ''); // Retina placeholder
  
  // Handle subdomains
  if (config.subdomains.length > 0) {
    const subdomain = config.subdomains[tile.x % config.subdomains.length];
    url = url.replace('{s}', subdomain);
  }
  
  return url;
}

// Download a single tile
function downloadTile(tile, url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        const file = fs.createWriteStream(outputPath);
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve({ tile, success: true });
        });
      } else if (response.statusCode === 404) {
        // Tile doesn't exist (beyond coverage)
        resolve({ tile, success: false, reason: '404' });
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Download tiles with concurrency control
async function downloadTiles(tiles, source, outputDir, options) {
  const total = tiles.length;
  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  
  console.log(`Downloading ${total} tiles from ${source}...`);
  console.log(`Output: ${outputDir}`);
  console.log(`Concurrency: ${options.concurrency}, Delay: ${options.delay}ms\n`);
  
  const queue = [...tiles];
  const workers = [];
  
  for (let i = 0; i < options.concurrency; i++) {
    workers.push(processQueue());
  }
  
  async function processQueue() {
    while (queue.length > 0) {
      const tile = queue.shift();
      if (!tile) break;
      
      const url = getTileUrl(tile, source);
      const outputPath = path.join(outputDir, source, `${tile.z}`, `${tile.x}`, `${tile.y}.${options.format}`);
      
      // Skip if already exists
      if (fs.existsSync(outputPath)) {
        skipped++;
        updateProgress();
        await sleep(options.delay);
        continue;
      }
      
      try {
        const result = await downloadTile(tile, url, outputPath);
        if (result.success) {
          downloaded++;
        } else {
          skipped++;
        }
        updateProgress();
      } catch (err) {
        errors++;
        console.error(`\nError downloading ${tile.z}/${tile.x}/${tile.y}: ${err.message}`);
        updateProgress();
      }
      
      await sleep(options.delay);
    }
  }
  
  function updateProgress() {
    const progress = ((downloaded + skipped + errors) / total * 100).toFixed(1);
    process.stdout.write(`\rProgress: ${progress}% | Downloaded: ${downloaded} | Skipped: ${skipped} | Errors: ${errors}`);
  }
  
  await Promise.all(workers);
  
  console.log(`\n\nComplete!`);
  console.log(`Downloaded: ${downloaded} tiles`);
  console.log(`Skipped: ${skipped} tiles (already exist or 404)`);
  console.log(`Errors: ${errors} tiles`);
  
  // Calculate storage size
  const sizeBytes = getDirectorySize(path.join(outputDir, source));
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
  console.log(`Storage used: ${sizeMB} MB`);
}

// Get directory size
function getDirectorySize(dirPath) {
  let size = 0;
  
  if (!fs.existsSync(dirPath)) return 0;
  
  const walk = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        walk(filePath);
      } else {
        size += stats.size;
      }
    }
  };
  
  walk(dirPath);
  return size;
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Estimate tile count and storage
function estimateTiles(bounds, zoomLevels) {
  let totalTiles = 0;
  const breakdown = [];
  
  for (const zoom of zoomLevels) {
    const tiles = getTilesInBounds(bounds, zoom);
    totalTiles += tiles.length;
    breakdown.push({ zoom, count: tiles.length });
  }
  
  // Rough estimate: 40KB per PNG tile average
  const estimatedMB = (totalTiles * 40 / 1024).toFixed(2);
  
  console.log('\nEstimated download:');
  breakdown.forEach(b => {
    console.log(`  Zoom ${b.zoom}: ${b.count} tiles`);
  });
  console.log(`\nTotal: ${totalTiles} tiles (~${estimatedMB} MB)`);
  console.log(`This is a rough estimate. Actual size will vary.\n`);
  
  return totalTiles;
}

// Main
async function main() {
  const options = parseArgs();
  
  // Validate
  if (!options.lat && !options.bbox) {
    console.error('Error: Must specify either --lat/--lon/--radius or --bbox');
    process.exit(1);
  }
  
  if (options.lat && (!options.lon || !options.radius)) {
    console.error('Error: When using --lat, must also specify --lon and --radius');
    process.exit(1);
  }
  
  if (!TILE_SOURCES[options.source]) {
    console.error(`Error: Unknown source '${options.source}'. Available: ${Object.keys(TILE_SOURCES).join(', ')}`);
    process.exit(1);
  }
  
  // Parse zoom levels
  const [minZoom, maxZoom] = options.zoom.split('-').map(Number);
  if (minZoom < 0 || maxZoom > 20 || minZoom > maxZoom) {
    console.error('Error: Invalid zoom range. Use format "10-16"');
    process.exit(1);
  }
  
  const zoomLevels = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    zoomLevels.push(z);
  }
  
  // Calculate bounds
  let bounds;
  if (options.bbox) {
    const [minLat, minLon, maxLat, maxLon] = options.bbox.split(',').map(Number);
    bounds = { minLat, maxLat, minLon, maxLon };
  } else {
    bounds = getBoundingBox(Number(options.lat), Number(options.lon), Number(options.radius));
  }
  
  console.log('Download Configuration:');
  console.log(`  Bounding box: ${bounds.minLat.toFixed(4)}, ${bounds.minLon.toFixed(4)} to ${bounds.maxLat.toFixed(4)}, ${bounds.maxLon.toFixed(4)}`);
  console.log(`  Zoom levels: ${minZoom}-${maxZoom}`);
  console.log(`  Source: ${options.source}`);
  console.log(`  Output: ${options.output}`);
  
  // Estimate
  const allTiles = [];
  for (const zoom of zoomLevels) {
    const tiles = getTilesInBounds(bounds, zoom);
    allTiles.push(...tiles);
  }
  
  estimateTiles(bounds, zoomLevels);
  
  // Confirm
  process.stdout.write('Continue? (y/n): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  
  await new Promise((resolve) => {
    process.stdin.on('data', (key) => {
      if (key === 'y' || key === 'Y') {
        console.log('Starting download...\n');
        resolve(true);
      } else {
        console.log('Cancelled.');
        process.exit(0);
      }
      process.stdin.setRawMode(false);
      process.stdin.pause();
    });
  });
  
  // Download
  await downloadTiles(allTiles, options.source, options.output, options);
  
  console.log('\nDone! Configure GCS to use offline tiles:');
  console.log(`  URL: http://localhost:8080/${options.source}/{z}/{x}/{y}.${options.format}`);
  console.log(`\nOr serve with: http-server ${path.join(options.output, options.source)} -p 8080 --cors`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
