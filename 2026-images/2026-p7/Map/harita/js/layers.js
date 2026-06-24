// layers.js — katman yönetimi

const LayerManager = (function() {

  let _map = null;

  // Katman konfigürasyonları
  const CONFIGS = {
    buildings: {
      label:       'Buildings',
      color:       '#f5f2eb',
      fillColor:   '#d4cebc',
      fill:        true,
      fillStyle:   'hachure',
      strokeWidth: 1.2,
      roughness:   0.3,
      bowing:      0,
      extraClass:  'buildings-canvas',
    },
    roads: {
      label:       'Roads',
      color:       '#f5f2eb',
      fill:        false,
      strokeWidth: 1.6,
      roughness:   0.3,
      bowing:      0,
      extraClass:  'roads-canvas',
    },
    greenspace: {
      label:       'Green',
      color:       '#8fd9a8',
      fillColor:   '#5fae80',
      fill:        true,
      fillStyle:   'cross-hatch',
      strokeWidth: 1.0,
      roughness:   0.3,
      bowing:      0,
    },
    water: {
      label:       'Water',
      color:       '#6ec8e0',
      fillColor:   '#3f8fab',
      fill:        true,
      fillStyle:   'cross-hatch',
      strokeWidth: 1.2,
      roughness:   0.3,
      bowing:      0,
    },
    demolition_zones: {
      label:       'Demolishments',
      color:       '#ff6b5b',
      fillColor:   '#c0392b',
      fill:        true,
      fillStyle:   'zigzag',
      strokeWidth: 1.5,
      roughness:   0.3,
      bowing:      0,
    },
    gecekondu: {
      label:       'Squatter Houses',
      color:       '#d98e4a',
      fillColor:   '#a85c2e',
      fill:        true,
      fillStyle:   'hachure',
      strokeWidth: 1.2,
      roughness:   0.3,
      bowing:      0,
    },
    hafriyat_guzergah: {
      label:       'Barbarian',
      color:       '#ffb347',
      fill:        false,
      strokeWidth: 2.0,
      roughness:   0.3,
      bowing:      0,
    },
    nomadic: {
      label:       'Nomadic',
      color:       '#c9a876',
      fillColor:   '#8a6d3f',
      fill:        true,
      fillStyle:   'hachure',
      strokeWidth: 1.0,
      roughness:   0.3,
      bowing:      0,
    },
    vagabond: {
      label:       'Vagabond',
      color:       '#b894d6',
      fillColor:   '#6b4a8a',
      fill:        true,
      fillStyle:   'cross-hatch',
      strokeWidth: 1.0,
      roughness:   0.3,
      bowing:      0,
      extraClass:  'vagabond-canvas',
    },
    proletariat: {
      label: 'Proletariat',
      color: '#d4a843',
    },
    civilized: {
      label:       'Civilized',
      color:       '#ff1a1a',
      fillColor:   '#ff1a1a',
      fill:        true,
      fillStyle:   'solid',
      strokeWidth: 0.5,
      roughness:   0.3,
      bowing:      0,
      extraClass:  'civilized-canvas',
    },
  };

  // Aktif sketch layer nesneleri (sadece hafriyat_guzergah statik kalıyor)
  const _layers  = {};
  // Yıl bazlı geçici katmanlar
  const YEAR_KEYS = ['buildings', 'roads', 'greenspace', 'water', 'demolition_zones', 'gecekondu'];
  const _yearLayers = {};
  YEAR_KEYS.forEach(k => _yearLayers[k] = null);
  // Görünürlük durumu
  const _visible = {
    buildings:         true,
    roads:             true,
    greenspace:        true,
    water:             true,
    demolition_zones:  false,
    gecekondu:         true,
    hafriyat_guzergah: false,
    vagabond:          false,
    proletariat:       false,
    civilized:         false,
    nomadic:           false,
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
    // hafriyat_guzergah: çizgi kendisi gösterilmiyor, yalnızca üzerindeki kareler (HafriyatAnimation) görünür
    const geojson = await _fetchGeoJSON(_dataPath('hafriyat_guzergah.geojson'));
    HafriyatAnimation.load(geojson);

    // vagabond verisi data-mine/ klasöründe duruyor (üretilmiş abstraction verisi, data/ ile aynı yıl mantığına girmiyor)
    const vagabondPath = file => _dataPath(file).replace('/data/', '/data-mine/');
    const vagabondGeojson = await _fetchGeoJSON(vagabondPath('vadi-vagabond.geojson'));
    const vagabondLayer   = sketchLayer(vagabondGeojson, CONFIGS.vagabond);
    if (_visible.vagabond) vagabondLayer.addTo(_map);
    _layers.vagabond = vagabondLayer;

    // proletariat: hafriyat güzergahının tersine, missing-buildings ızgarasına dönen akış
    const proletariatGrids = await _fetchGeoJSON(vagabondPath('proletariat-grids.geojson'));
    ProletariatAnimation.load(geojson, proletariatGrids);

    // civilized: buildings_2025 + roads_2025'in kapladığı her hücre kırmızı, vadi otomatik boş kalıyor
    const civilizedGeojson = await _fetchGeoJSON(vagabondPath('civilized-grid.geojson'));
    const civilizedLayer   = sketchLayer(civilizedGeojson, CONFIGS.civilized);
    if (_visible.civilized) civilizedLayer.addTo(_map);
    _layers.civilized = civilizedLayer;

    // nomadic: vadi'nin sabit base ızgarası + üzerinde 10 frame'in 1.2s/0.2s crossfade döngüsü
    const nomadicBase = await _fetchGeoJSON(vagabondPath('vadi-abstraction-base.geojson'));
    const nomadicFrames = await Promise.all(
      Array.from({ length: 10 }, (_, i) => _fetchGeoJSON(vagabondPath(`vadi-abstraction-frame-${i}.geojson`)))
    );
    NomadicAnimation.load(nomadicBase, nomadicFrames, CONFIGS.nomadic, CONFIGS.nomadic);
    if (_visible.nomadic) NomadicAnimation.show();
  }

  // Slider hızlı kaydırılınca aynı anda birden çok loadYear() çağrısı havada kalabilir;
  // sadece en son başlatılan çağrının sonucu haritaya uygulanır, eskileri sessizce iptal edilir.
  let _loadToken = 0;

  // Yıla göre tüm katmanları yükle (bina, yol, yeşil alan, su, inşaat/yıkım)
  async function loadYear(year, dataPathFn) {
    if (dataPathFn) _dataPath = dataPathFn;
    const token = ++_loadToken;

    // greenspace verisi sadece 2015, su verisi sadece 2022 için mevcut; diğer tüm yıllarda referans olarak bunlar kullanılıyor
    const REFERENCE_YEAR = { greenspace: 2015, water: 2022 };
    const datas = await Promise.all(
      YEAR_KEYS.map(key => _fetchGeoJSON(_dataPath(`${key}_${REFERENCE_YEAR[key] || year}.geojson`)))
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

    return {
      demolition: datas[YEAR_KEYS.indexOf('demolition_zones')],
      roads:      datas[YEAR_KEYS.indexOf('roads')],
      buildings:  datas[YEAR_KEYS.indexOf('buildings')],
    };
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

  // Animation grubu (soil taxonomy) — sadece "Abstraction of 2026"da çalışır
  const ANIMATION_KEYS = ['nomadic', 'hafriyat_guzergah', 'vagabond', 'proletariat', 'civilized'];
  let _animationsEnabled = false;

  function _showAnimationLayer(key) {
    if (key === 'proletariat') { ProletariatAnimation.show(); return; }
    if (key === 'hafriyat_guzergah') { HafriyatAnimation.show(); return; }
    if (key === 'nomadic') { NomadicAnimation.show(); return; }
    const l = _layers[key];
    if (l) l.addTo(_map);
  }

  function _hideAnimationLayer(key) {
    if (key === 'proletariat') { ProletariatAnimation.hide(); return; }
    if (key === 'hafriyat_guzergah') { HafriyatAnimation.hide(); return; }
    if (key === 'nomadic') { NomadicAnimation.hide(); return; }
    const l = _layers[key];
    if (l) _map.removeLayer(l);
  }

  // Slider "Abstraction of 2026"a gelince true, diğer her yılda false olarak çağrılır.
  // Kullanıcının açtığı/kapattığı animation katmanlarının niyetini (_visible) bozmadan,
  // sadece 2026 dışında hepsini görünmez yapar; 2026'ya dönünce eski hallerine döner.
  function setAnimationsEnabled(enabled) {
    if (_animationsEnabled === enabled) return;
    _animationsEnabled = enabled;
    ANIMATION_KEYS.forEach(key => {
      if (enabled) {
        if (_visible[key]) _showAnimationLayer(key);
      } else {
        _hideAnimationLayer(key);
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

    // Animation grubu: sadece 2026 modundayken gerçek show/hide tetiklenir;
    // değilse niyet kaydedilir, 2026'ya geçince setAnimationsEnabled bunu uygular.
    if (ANIMATION_KEYS.includes(key)) {
      if (_animationsEnabled) {
        _visible[key] ? _showAnimationLayer(key) : _hideAnimationLayer(key);
      }
      return _visible[key];
    }

    return _visible[key];
  }

  function getConfig(key) { return CONFIGS[key]; }
  function isVisible(key) { return _visible[key]; }

  return { init, loadStaticLayers, loadYear, clearYearLayers, toggle, getConfig, isVisible, setAnimationsEnabled, ANIMATION_KEYS, CONFIGS };

})();
