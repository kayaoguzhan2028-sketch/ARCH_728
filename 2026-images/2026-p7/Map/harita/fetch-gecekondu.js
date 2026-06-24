const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CENTER_LAT = 39.8572724;
const CENTER_LON = 32.8407268;
const RADIUS_M   = 2000;
const LAT_MARGIN = RADIUS_M / 111320;
const LON_MARGIN = RADIUS_M / (111320 * Math.cos(CENTER_LAT * Math.PI / 180));
const BBOX = `${CENTER_LAT - LAT_MARGIN},${CENTER_LON - LON_MARGIN},${CENTER_LAT + LAT_MARGIN},${CENTER_LON + LON_MARGIN}`;
const OUTPUT_DIR = path.join(__dirname, 'data');
const ENDPOINT   = 'overpass-api.de';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchOverpass(query) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const req  = https.request({
      hostname: ENDPOINT,
      path:     '/api/interpreter',
      method:   'POST',
      timeout:  100000,
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'ARCH728-DataFetcher/1.0',
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch(e) { reject(new Error('Parse hatası: ' + raw.slice(0, 300))); return; }
        if (parsed.remark) { reject(new Error('Overpass remark: ' + parsed.remark)); return; }
        resolve(parsed);
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function round(n) { return Math.round(n * 1e5) / 1e5; }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function intersectsCircle(el) {
  const pts = el.type === 'node' ? [[el.lat, el.lon]] : (el.geometry || []).map(p => [p.lat, p.lon]);
  return pts.some(([lat, lon]) => haversine(lat, lon, CENTER_LAT, CENTER_LON) <= RADIUS_M);
}

function toGeoJSON(elements) {
  const features = [];
  elements.forEach(el => {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) return;
    const coords = el.geometry.map(n => [round(n.lon), round(n.lat)]);
    const closed = coords.length > 3
      && coords[0][0] === coords[coords.length-1][0]
      && coords[0][1] === coords[coords.length-1][1];
    const geometry = closed
      ? { type: 'Polygon', coordinates: [coords] }
      : { type: 'LineString', coordinates: coords };
    features.push({ type: 'Feature', properties: {}, geometry });
  });
  return { type: 'FeatureCollection', features };
}

async function fetchYear(year) {
  const outFile = path.join(OUTPUT_DIR, `gecekondu_${year}.geojson`);
  if (fs.existsSync(outFile)) {
    console.log(`[gecekondu_${year}] zaten tamam, atlanıyor.`);
    return;
  }

  const query = `[date:"${year}-01-01T00:00:00Z"][out:json][timeout:90];
way["landuse"="residential"](${BBOX});
out geom;`;

  process.stdout.write(`[gecekondu_${year}] çekiliyor... `);
  let data;
  try {
    data = await fetchOverpass(query);
  } catch(e) {
    console.log('HATA:', e.message);
    return;
  }

  const elements = (data.elements || []).filter(intersectsCircle);
  const geojson  = toGeoJSON(elements);
  fs.writeFileSync(outFile, JSON.stringify(geojson));
  console.log(`✓  ${geojson.features.length} alan`);
}

async function main() {
  const onlyYears = process.argv.slice(2).map(Number).filter(Boolean);
  const years = onlyYears.length ? onlyYears : Array.from({ length: 16 }, (_, i) => 2010 + i);

  for (let i = 0; i < years.length; i++) {
    await fetchYear(years[i]);
    if (i < years.length - 1) await sleep(4000);
  }
}

main().catch(console.error);
