const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BBOX        = '39.82883308517775,32.80202479436177,39.88858349516757,32.88841427628221'; // south,west,north,east
const OUTPUT_DIR  = path.join(__dirname, 'data');
const ENDPOINT    = 'overpass-api.de';
const COORD_DECIMALS = 5; // ~1m hassasiyet, dosya boyutunu küçültmek için OSM'in 7 ondalığından düşürülmüş

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchOverpass(query) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const req  = https.request({
      hostname: ENDPOINT,
      path:     '/api/interpreter',
      method:   'POST',
      timeout:  75000,
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

function round(n) { return Math.round(n * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS; }

// Verilen way/node elemanlarını GeoJSON'a çevirir; gereksiz property'leri atar, koordinatları yuvarlar
function toGeoJSON(elements) {
  const features = [];
  elements.forEach(el => {
    let geometry = null;

    if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
      const coords = el.geometry.map(n => [round(n.lon), round(n.lat)]);
      const closed = coords.length > 3
        && coords[0][0] === coords[coords.length-1][0]
        && coords[0][1] === coords[coords.length-1][1];
      geometry = closed
        ? { type: 'Polygon', coordinates: [coords] }
        : { type: 'LineString', coordinates: coords };
    } else if (el.type === 'node' && typeof el.lat === 'number') {
      geometry = { type: 'Point', coordinates: [round(el.lon), round(el.lat)] };
    }

    if (!geometry) return;
    features.push({ type: 'Feature', properties: {}, geometry });
  });
  return { type: 'FeatureCollection', features };
}

// Hangi kategori(ler)e ait olduğunu etiketlerden anla
function categorize(tags) {
  if (!tags) return null;
  if (tags.building) return 'buildings';
  if (tags.highway) return 'roads';
  if (
    tags.leisure === 'park' ||
    ['forest', 'grass', 'meadow', 'recreation_ground', 'cemetery'].includes(tags.landuse) ||
    tags.natural === 'wood'
  ) return 'greenspace';
  if (tags.natural === 'water' || ['river', 'stream', 'canal'].includes(tags.waterway)) return 'water';
  if (['construction', 'brownfield'].includes(tags.landuse)) return 'demolition_zones';
  return null;
}

async function fetchYear(year) {
  const query = `[date:"${year}-01-01T00:00:00Z"][out:json][timeout:60];
(
  way["building"](${BBOX});
  way["highway"](${BBOX});
  nwr["leisure"="park"](${BBOX});
  nwr["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery)$"](${BBOX});
  nwr["natural"="wood"](${BBOX});
  nwr["natural"="water"](${BBOX});
  nwr["waterway"~"^(river|stream|canal)$"](${BBOX});
  nwr["landuse"~"^(construction|brownfield)$"](${BBOX});
);
out geom;`;

  process.stdout.write(`[${year}] çekiliyor... `);
  let data;
  try {
    data = await fetchOverpass(query);
  } catch(e) {
    console.log('HATA:', e.message);
    return false;
  }

  const elements = data.elements || [];
  const buckets  = { buildings: [], roads: [], greenspace: [], water: [], demolition_zones: [] };
  elements.forEach(el => {
    const cat = categorize(el.tags);
    if (cat) buckets[cat].push(el);
  });

  const counts = {};
  Object.entries(buckets).forEach(([name, els]) => {
    const geojson = toGeoJSON(els);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}_${year}.geojson`), JSON.stringify(geojson));
    counts[name] = geojson.features.length;
  });

  console.log(`✓  bina:${counts.buildings} yol:${counts.roads} yeşil:${counts.greenspace} su:${counts.water} inşaat:${counts.demolition_zones}`);
  return true;
}

async function main() {
  const onlyYears = process.argv.slice(2).map(Number).filter(Boolean);
  const years = onlyYears.length ? onlyYears : Array.from({ length: 16 }, (_, i) => 2010 + i);
  const delayMs = onlyYears.length ? 6000 : 3000;

  console.log(`İlker Mahallesi verisi çekiliyor (${years.join(', ')})...\n`);
  for (let i = 0; i < years.length; i++) {
    await fetchYear(years[i]);
    if (i < years.length - 1) await sleep(delayMs);
  }
  console.log('\nTamamlandı.');
}

main().catch(console.error);
