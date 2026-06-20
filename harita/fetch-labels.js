const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CENTER_LAT = 39.8572724;
const CENTER_LON = 32.8407268;
const RADIUS_M   = 2000;
const AROUND     = `around:${RADIUS_M},${CENTER_LAT},${CENTER_LON}`;
const OUTPUT_DIR = path.join(__dirname, 'data');
const ENDPOINT   = 'overpass-api.de';

function fetchOverpass(query) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const req  = https.request({
      hostname: ENDPOINT,
      path:     '/api/interpreter',
      method:   'POST',
      timeout:  60000,
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'ARCH728-DataFetcher/1.0',
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Parse hatası: ' + raw.slice(0, 300))); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function round(n) { return Math.round(n * 1e5) / 1e5; }

function toGeoJSON(elements) {
  const features = [];
  elements.forEach(el => {
    let lon, lat;
    if (el.type === 'node') { lon = el.lon; lat = el.lat; }
    else if (el.center)     { lon = el.center.lon; lat = el.center.lat; }
    if (typeof lon !== 'number' || !el.tags || !el.tags.name) return;

    features.push({
      type: 'Feature',
      properties: { name: el.tags.name, place: el.tags.place || '' },
      geometry: { type: 'Point', coordinates: [round(lon), round(lat)] },
    });
  });
  return { type: 'FeatureCollection', features };
}

async function main() {
  const query = `[out:json][timeout:60];
nwr["place"~"^(neighbourhood|suburb|quarter|locality|village)$"](${AROUND});
out center;`;

  process.stdout.write('[labels] çekiliyor... ');
  let data;
  try {
    data = await fetchOverpass(query);
  } catch(e) {
    console.log('HATA:', e.message);
    return;
  }

  const geojson = toGeoJSON(data.elements || []);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'labels.geojson'), JSON.stringify(geojson));
  console.log(`✓  ${geojson.features.length} yer adı`);
}

main().catch(console.error);
