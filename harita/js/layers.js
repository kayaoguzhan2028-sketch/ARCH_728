// layers.js — katman yönetimi

const LayerManager = (function() {

  let _map = null;

  // Katman konfigürasyonları
  const CONFIGS = {
    buildings: {
      label:       'Binalar',
      color:       '#f5f2eb',
      fillColor:   '#d4cebc',
      fill:        true,
      fillStyle:   'hachure',
      strokeWidth: 1.2,
      roughness:   0.3,
      bowing:      0,
    },
    roads: {
      label:       'Yollar',
      color:       '#f5f2eb',
      fill:        false,
      strokeWidth: 1.6,
      roughness:   0.3,
      bowing:      0,
    },
    greenspace: {
      label:       'Yeşil Alan',
      color:       '#8fd9a8',
      fillColor:   '#5fae80',
      fill:        true,
      fillStyle:   'cross-hatch',
      strokeWidth: 1.0,
      roughness:   0.3,
      bowing:      0,
    },
    water: {
      label:       'Su',
      color:       '#6ec8e0',
      fillColor:   '#3f8fab',
      fill:        true,
      fillStyle:   'cross-hatch',
      strokeWidth: 1.2,
      roughness:   0.3,
      bowing:      0,
    },
    demolition_zones: {
      label:       'Yıkım Alanları',
      color:       '#ff6b5b',
      fillColor:   '#c0392b',
      fill:        true,
      fillStyle:   'zigzag',
      strokeWidth: 1.5,
      roughness:   0.3,
      bowing:      0,
    },
    hafriyat_guzergah: {
      label:       'Hafriyat Güzergahı',
      color:       '#ffb347',
      fill:        false,
      strokeWidth: 2.0,
      roughness:   0.3,
      bowing:      0,
    },
  };

  // Aktif sketch layer nesneleri (sadece hafriyat_guzergah statik kalıyor)
  const _layers  = {};
  // Yıl bazlı geçici katmanlar
  const YEAR_KEYS = ['buildings', 'roads', 'greenspace', 'water', 'demolition_zones'];
  const _yearLayers = {};
  YEAR_KEYS.forEach(k => _yearLayers[k] = null);
  // Görünürlük durumu
  const _visible = {
    buildings:         true,
    roads:             true,
    greenspace:        true,
    water:             true,
    demolition_zones:  true,
    hafriyat_guzergah: true,
  };

  let _dataPath = file => `data/${file}`;

  async function _fetchGeoJSON(path) {
    try {
      const r = await fetch(path, { cache: 'no-store' });
      if (!r.ok) return { type: 'FeatureCollection', features: [] };
      return await r.json();
    } catch (e) {
      return { type: 'FeatureCollection', features: [] };
    }
  }

  function init(map) {
    _map = map;
  }

  // Statik katmanları yükle (sadece hafriyat_guzergah — yıl bazlı OSM verisi yok)
  async function loadStaticLayers(dataPathFn) {
    if (dataPathFn) _dataPath = dataPathFn;
    const geojson = await _fetchGeoJSON(_dataPath('hafriyat_guzergah.geojson'));
    const layer   = sketchLayer(geojson, CONFIGS.hafriyat_guzergah);
    if (_visible.hafriyat_guzergah) layer.addTo(_map);
    _layers.hafriyat_guzergah = layer;

    HafriyatAnimation.load(geojson);
  }

  // Slider hızlı kaydırılınca aynı anda birden çok loadYear() çağrısı havada kalabilir;
  // sadece en son başlatılan çağrının sonucu haritaya uygulanır, eskileri sessizce iptal edilir.
  let _loadToken = 0;

  // Yıla göre tüm katmanları yükle (bina, yol, yeşil alan, su, inşaat/yıkım)
  async function loadYear(year, dataPathFn) {
    if (dataPathFn) _dataPath = dataPathFn;
    const token = ++_loadToken;

    const datas = await Promise.all(
      YEAR_KEYS.map(key => _fetchGeoJSON(_dataPath(`${key}_${year}.geojson`)))
    );

    if (token !== _loadToken) return; // bu sırada daha yeni bir çağrı başlamış, sonucu yoksay

    YEAR_KEYS.forEach(key => {
      if (_yearLayers[key]) {
        _map.removeLayer(_yearLayers[key]);
        _yearLayers[key] = null;
      }
    });

    YEAR_KEYS.forEach((key, i) => {
      _yearLayers[key] = sketchLayer(datas[i], CONFIGS[key]);
      if (_visible[key]) _yearLayers[key].addTo(_map);
    });
  }

  // Canlı OSM görünümüne dön: sketch katmanlarını kaldır, sadece taban harita kalsın
  function clearYearLayers() {
    _loadToken++; // bekleyen loadYear çağrılarını geçersiz kıl
    YEAR_KEYS.forEach(key => {
      if (_yearLayers[key]) {
        _map.removeLayer(_yearLayers[key]);
        _yearLayers[key] = null;
      }
    });
  }

  // Katman görünürlüğünü toggle et
  function toggle(key) {
    _visible[key] = !_visible[key];

    // Yıl bazlı katmanlar
    if (YEAR_KEYS.includes(key)) {
      const l = _yearLayers[key];
      if (l) {
        _visible[key] ? l.addTo(_map) : _map.removeLayer(l);
      }
      return _visible[key];
    }

    // Statik katmanlar (hafriyat_guzergah)
    const l = _layers[key];
    if (l) {
      _visible[key] ? l.addTo(_map) : _map.removeLayer(l);
    }
    if (key === 'hafriyat_guzergah') {
      _visible[key] ? HafriyatAnimation.start() : HafriyatAnimation.stop();
    }

    return _visible[key];
  }

  function getConfig(key) { return CONFIGS[key]; }
  function isVisible(key) { return _visible[key]; }

  return { init, loadStaticLayers, loadYear, clearYearLayers, toggle, getConfig, isVisible, CONFIGS };

})();
