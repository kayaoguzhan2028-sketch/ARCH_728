const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CENTER_LAT  = 39.8572724;
const CENTER_LON  = 32.8407268;
const RADIUS_M    = 2000; // metre

// NOT: Overpass'ta "around" (daire) filtresi + tarihli ([date:]) sorgu birleşimi
// sürekli "out of memory" hatası veriyor (geçmiş veri için mesafe hesabı çok pahalı).
// Bu yüzden sorguyu ucuz bir bbox ile atıp, sonucu yerelde daireye göre filtreliyoruz.
const LAT_MARGIN = RADIUS_M / 111320;
const LON_MARGIN = RADIUS_M / (111320 * Math.cos(CENTER_LAT * Math.PI / 180));
const BBOX = `${CENTER_LAT - LAT_MARGIN},${CENTER_LON - LON_MARGIN},${CENTER_LAT + LAT_MARGIN},${CENTER_LON + LON_MARGIN}`;

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
        // Overpass bazen HTTP 200 + geçerli ama boş JSON döner, gerçek hatayı "remark" alanına yazar
        // (örn. "Query run out of memory"). Bunu sessizce 0 sonuç sanıp dosyayı boşaltmamak için kontrol ediyoruz.
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

function round(n) { return Math.round(n * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS; }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Elemanın en az bir noktası daire içinde mi? (bbox sonucunu daireye kırpmak için)
function intersectsCircle(el) {
  const pts = el.type === 'node' ? [[el.lat, el.lon]] : (el.geometry || []).map(p => [p.lat, p.lon]);
  return pts.some(([lat, lon]) => haversine(lat, lon, CENTER_LAT, CENTER_LON) <= RADIUS_M);
}

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

// "nwr" + regex ile çok-etiketli sorgular geçmiş veride (attic) çok pahalı ve OOM'a yol açıyor.
// Bu yüzden her kategori kendi tek-etiketli, küçük sorgusuyla ayrı ayrı çekilip aynı dosyada birleştiriliyor.
const CATEGORY_CLAUSES = {
  buildings:        ['way["building"]'],
  roads:            ['way["highway"]'],
  greenspace:       [
    'way["leisure"="park"]',
    'way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery)$"]',
    'way["natural"="wood"]',
  ],
  water:            [
    'way["natural"="water"]',
    'way["waterway"~"^(river|stream|canal)$"]',
  ],
  demolition_zones: ['way["landuse"~"^(construction|brownfield)$"]'],
};

async function fetchClause(year, clause) {
  const query = `[date:"${year}-01-01T00:00:00Z"][out:json][timeout:45];
${clause}(${BBOX});
out geom;`;
  const data = await fetchOverpass(query);
  return (data.elements || []).filter(intersectsCircle);
}

async function fetchCategory(year, category) {
  const clauses = CATEGORY_CLAUSES[category];
  process.stdout.write(`[${year}/${category}] çekiliyor... `);

  let elements = [];
  for (const clause of clauses) {
    try {
      elements = elements.concat(await fetchClause(year, clause));
    } catch(e) {
      console.log(`HATA (${clause}): ${e.message}`);
      return false;
    }
    if (clauses.length > 1) await sleep(4000);
  }

  const geojson = toGeoJSON(elements);
  fs.writeFileSync(path.join(OUTPUT_DIR, `${category}_${year}.geojson`), JSON.stringify(geojson));
  console.log(`✓  ${geojson.features.length}`);
  return true;
}

function categoryDone(year, category) {
  return fs.existsSync(path.join(OUTPUT_DIR, `${category}_${year}.geojson`));
}

async function main() {
  const onlyYears = process.argv.slice(2).map(Number).filter(Boolean);
  const years = onlyYears.length ? onlyYears : Array.from({ length: 16 }, (_, i) => 2010 + i);
  const categories = Object.keys(CATEGORY_CLAUSES);
  const delayMs = 5000;

  console.log(`İlker Mahallesi verisi çekiliyor (${years.join(', ')})...\n`);
  for (const year of years) {
    for (const category of categories) {
      if (categoryDone(year, category)) {
        console.log(`[${year}/${category}] zaten tamam, atlanıyor.`);
      } else {
        await fetchCategory(year, category);
        await sleep(delayMs);
      }
    }
  }
  console.log('\nTamamlandı.');
}

main().catch(console.error);
