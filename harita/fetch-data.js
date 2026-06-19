const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BBOX       = '39.8437706876752,32.82362216984188,39.87364589267011,32.8668169108021'; // south,west,north,east
const OUTPUT_DIR = path.join(__dirname, 'data');
// overpass-turbo.eu/api/interpreter yerine resmi endpoint kullanıyoruz (daha stabil)
const ENDPOINT   = 'overpass-api.de';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchOverpass(query) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const req  = https.request({
      hostname: ENDPOINT,
      path:     '/api/interpreter',
      method:   'POST',
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
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function toGeoJSON(elements, tag) {
  const features = [];
  elements.forEach(el => {
    if (el.type !== 'way' || !el.tags || !el.tags[tag]) return;
    if (!el.geometry || el.geometry.length < 2) return;
    const coords = el.geometry.map(n => [n.lon, n.lat]);
    const closed = tag === 'building'
      && coords.length > 3
      && coords[0][0] === coords[coords.length-1][0]
      && coords[0][1] === coords[coords.length-1][1];
    features.push({
      type: 'Feature',
      properties: { ...el.tags, osm_id: el.id },
      geometry: {
        type:        closed ? 'Polygon' : 'LineString',
        coordinates: closed ? [coords] : coords,
      },
    });
  });
  return { type: 'FeatureCollection', features };
}

async function fetchYear(year) {
  const query = `[date:"${year}-01-01T00:00:00Z"][out:json];
(
  way["building"](${BBOX});
  way["highway"](${BBOX});
);
out geom;`;

  process.stdout.write(`[${year}] çekiliyor... `);
  let data;
  try {
    data = await fetchOverpass(query);
  } catch(e) {
    console.log('HATA:', e.message);
    return;
  }

  const elements  = data.elements || [];
  const buildings = toGeoJSON(elements, 'building');
  const roads     = toGeoJSON(elements, 'highway');

  fs.writeFileSync(path.join(OUTPUT_DIR, `buildings_${year}.geojson`), JSON.stringify(buildings));
  fs.writeFileSync(path.join(OUTPUT_DIR, `roads_${year}.geojson`),     JSON.stringify(roads));

  console.log(`✓  ${buildings.features.length} bina, ${roads.features.length} yol`);
}

async function main() {
  const onlyYears = process.argv.slice(2).map(Number).filter(Boolean);
  const years = onlyYears.length ? onlyYears : Array.from({ length: 15 }, (_, i) => 2010 + i);
  const delayMs = onlyYears.length ? 6000 : 2000;

  console.log(`İlker Mahallesi verisi çekiliyor (${years.join(', ')})...\n`);
  for (let i = 0; i < years.length; i++) {
    await fetchYear(years[i]);
    if (i < years.length - 1) await sleep(delayMs);
  }
  console.log('\nTamamlandı.');
}

main().catch(console.error);
