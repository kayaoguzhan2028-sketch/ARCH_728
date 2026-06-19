// layers.js — katman yönetimi

const LayerManager = (function() {

  let _map = null;

  // Katman konfigürasyonları
  const CONFIGS = {
    buildings: {
      label:       'Binalar',
      color:       '#8b6f47',
      fillColor:   '#c4a882',
      fill:        true,
      fillStyle:   'hachure',
      strokeWidth: 1.2,
      roughness:   2.5,
      bowing:      0.8,
    },
    roads: {
      label:       'Yollar',
      color:       '#4a4a4a',
      fill:        false,
      strokeWidth: 1.8,
      roughness:   1.5,
      bowing:      1.2,
    },
    greenspace: {
      label:       'Yeşil Alan',
      color:       '#4a7c59',
      fillColor:   '#7db88a',
      fill:        true,
      fillStyle:   'cross-hatch',
      strokeWidth: 1.0,
      roughness:   3.0,
      bowing:      0.5,
    },
    demolition_zones: {
      label:       'Yıkım Alanları',
      color:       '#c0392b',
      fillColor:   '#e74c3c',
      fill:        true,
      fillStyle:   'zigzag',
      strokeWidth: 1.5,
      roughness:   3.5,
      bowing:      2.0,
    },
    hafriyat_guzergah: {
      label:       'Hafriyat Güzergahı',
      color:       '#e05c2a',
      fill:        false,
      strokeWidth: 2.0,
      roughness:   1.8,
      bowing:      1.5,
    },
  };

  // Aktif sketch layer nesneleri
  const _layers  = {};
  // Yıl bazlı geçici katmanlar
  const _yearLayers = { buildings: null, roads: null };
  // Görünürlük durumu
  const _visible = {
    buildings:         true,
    roads:             true,
    greenspace:        true,
    demolition_zones:  true,
    hafriyat_guzergah: true,
  };

  let _dataPath = file => `data/${file}`;

  async function _fetchGeoJSON(path) {
    try {
      const r = await fetch(path);
      if (!r.ok) return { type: 'FeatureCollection', features: [] };
      return await r.json();
    } catch (e) {
      return { type: 'FeatureCollection', features: [] };
    }
  }

  function init(map) {
    _map = map;
  }

  // Statik katmanları yükle (greenspace, demolition, hafriyat)
  async function loadStaticLayers(dataPathFn) {
    if (dataPathFn) _dataPath = dataPathFn;
    const staticKeys = ['greenspace', 'demolition_zones', 'hafriyat_guzergah'];
    for (const key of staticKeys) {
      const geojson = await _fetchGeoJSON(_dataPath(`${key}.geojson`));
      const layer   = sketchLayer(geojson, CONFIGS[key]);
      if (_visible[key]) layer.addTo(_map);
      _layers[key] = layer;
    }

    // Hafriyat animasyonu başlat
    const hData = await _fetchGeoJSON(_dataPath('hafriyat_guzergah.geojson'));
    HafriyatAnimation.load(hData);
  }

  // Yıla göre bina ve yol katmanlarını yükle
  async function loadYear(year, dataPathFn) {
    if (dataPathFn) _dataPath = dataPathFn;
    // Önceki yıl katmanlarını kaldır
    ['buildings', 'roads'].forEach(key => {
      if (_yearLayers[key]) {
        _map.removeLayer(_yearLayers[key]);
        _yearLayers[key] = null;
      }
    });

    const [bData, rData] = await Promise.all([
      _fetchGeoJSON(_dataPath(`buildings_${year}.geojson`)),
      _fetchGeoJSON(_dataPath(`roads_${year}.geojson`)),
    ]);

    _yearLayers.buildings = sketchLayer(bData, CONFIGS.buildings);
    _yearLayers.roads     = sketchLayer(rData, CONFIGS.roads);

    if (_visible.buildings) _yearLayers.buildings.addTo(_map);
    if (_visible.roads)     _yearLayers.roads.addTo(_map);
  }

  // Katman görünürlüğünü toggle et
  function toggle(key) {
    _visible[key] = !_visible[key];

    // Yıl bazlı katmanlar
    if (key === 'buildings' || key === 'roads') {
      const l = _yearLayers[key];
      if (l) {
        _visible[key] ? l.addTo(_map) : _map.removeLayer(l);
      }
      return _visible[key];
    }

    // Statik katmanlar
    const l = _layers[key];
    if (l) {
      _visible[key] ? l.addTo(_map) : _map.removeLayer(l);
    }

    // Hafriyat animasyonu
    if (key === 'hafriyat_guzergah') {
      _visible[key] ? HafriyatAnimation.start() : HafriyatAnimation.stop();
    }

    return _visible[key];
  }

  function getConfig(key) { return CONFIGS[key]; }
  function isVisible(key) { return _visible[key]; }

  return { init, loadStaticLayers, loadYear, toggle, getConfig, isVisible, CONFIGS };

})();
