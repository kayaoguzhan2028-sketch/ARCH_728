const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BBOX       = '39.82883308517775,32.80202479436177,39.88858349516757,32.88841427628221'; // south,west,north,east
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
      timeout:  25000,
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
        catch(e) { reject(new Error('Parse hatası: ' + raw.slice(0, 200))); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// way (kapalı halka -> Polygon, açık -> LineString) ve node (-> Point) destekler
function toGeoJSON(elements) {
  const features = [];
  elements.forEach(el => {
    let geometry = null;

    if (el.type === 'node' && typeof el.lat === 'number') {
      geometry = { type: 'Point', coordinates: [el.lon, el.lat] };
    } else if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
      const coords = el.geometry.map(n => [n.lon, n.lat]);
      const closed = coords.length > 3
        && coords[0][0] === coords[coords.length-1][0]
        && coords[0][1] === coords[coords.length-1][1];
      geometry = closed
        ? { type: 'Polygon', coordinates: [coords] }
        : { type: 'LineString', coordinates: coords };
    }

    if (!geometry) return;
    features.push({
      type: 'Feature',
      properties: { ...(el.tags || {}), osm_id: el.id },
      geometry,
    });
  });
  return { type: 'FeatureCollection', features };
}

async function fetchLayer(name, overpassClauses) {
  const query = `[out:json];
(
  ${overpassClauses.map(c => c + `(${BBOX});`).join('\n  ')}
);
out geom;`;

  process.stdout.write(`[${name}] çekiliyor... `);
  let data;
  try {
    data = await fetchOverpass(query);
  } catch(e) {
    console.log('HATA:', e.message);
    return;
  }

  const geojson = toGeoJSON(data.elements || []);
  fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.geojson`), JSON.stringify(geojson));
  console.log(`✓  ${geojson.features.length} eleman`);
}

const LAYERS = {
  greenspace: [
    'nwr["leisure"="park"]',
    'nwr["landuse"~"^(forest|grass|meadow|recreation_ground)$"]',
    'nwr["natural"="wood"]',
  ],
  water: [
    'nwr["natural"="water"]',
    'nwr["waterway"~"^(river|stream|canal)$"]',
  ],
  demolition_zones: [
    'nwr["landuse"~"^(construction|brownfield)$"]',
  ],
};

async function main() {
  const only = process.argv.slice(2);
  const names = only.length ? only : Object.keys(LAYERS);
  console.log('Statik referans katmanları çekiliyor:', names.join(', '), '\n');
  for (let i = 0; i < names.length; i++) {
    await fetchLayer(names[i], LAYERS[names[i]]);
    if (i < names.length - 1) await sleep(4000);
  }
  console.log('\nTamamlandı.');
}

main().catch(console.error);
