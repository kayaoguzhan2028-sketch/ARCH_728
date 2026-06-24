// animation.js — hafriyat güzergahları üzerinde kamyon (kare) akışı animasyonu
// Her LineString feature kendi başına bağımsız bir güzergah; her biri üzerinde
// rastgele boy/hız ile sürekli döngü halinde, birden çok kare ilerler.

const HafriyatAnimation = (function() {

  let _map     = null;
  let _routes  = [];   // [{coords:[[lat,lng],...], marker, progress, speed}]
  let _rafId   = null;
  let _running = false;
  let _visible = false;

  const SIZES_PX = [4, 5, 6]; // 6/8/10m'lik görsel çeşitlilik (sketch ölçeğinde temsili px, küçültülmüş)
  const SQUARES_PER_ROUTE = 4;

  function _flattenLine(geometry) {
    if (!geometry) return [];
    if (geometry.type === 'LineString') {
      return geometry.coordinates.map(c => [c[1], c[0]]);
    }
    if (geometry.type === 'MultiLineString') {
      const pts = [];
      geometry.coordinates.forEach(line => line.forEach(c => pts.push([c[1], c[0]])));
      return pts;
    }
    return [];
  }

  function _interpolate(coords, t) {
    if (coords.length === 0) return null;
    if (coords.length === 1) return coords[0];
    const total  = coords.length - 1;
    const scaled = t * total;
    const i      = Math.min(Math.floor(scaled), total - 1);
    const frac   = scaled - i;
    const a      = coords[i];
    const b      = coords[i + 1];
    return [
      a[0] + (b[0] - a[0]) * frac,
      a[1] + (b[1] - a[1]) * frac,
    ];
  }

  function init(map) {
    _map = map;
  }

  function load(geojson) {
    _routes.forEach(r => { if (r.marker) _map.removeLayer(r.marker); });
    _routes = [];

    (geojson.features || []).forEach(f => {
      const coords = _flattenLine(f.geometry);
      if (coords.length < 2) return;

      for (let n = 0; n < SQUARES_PER_ROUTE; n++) {
        const px = SIZES_PX[Math.floor(Math.random() * SIZES_PX.length)];
        const marker = L.marker(coords[0], {
          icon: L.divIcon({
            className: 'hafriyat-square',
            html: `<div style="width:${px}px;height:${px}px;"></div>`,
            iconSize: [px, px],
          }),
          interactive: false,
        });

        _routes.push({
          coords,
          marker,
          progress: Math.random(),                   // rastgele faz: hepsi aynı anda hareket etmesin
          speed:    0.00035 + Math.random() * 0.0004, // hafif hız çeşitliliği
        });
      }
    });

    if (_visible) {
      _routes.forEach(r => r.marker.addTo(_map));
      start();
    } else {
      stop();
    }
  }

  function _step() {
    if (!_running) return;
    _routes.forEach(r => {
      r.progress = (r.progress + r.speed) % 1.0;
      const pos = _interpolate(r.coords, r.progress);
      if (pos) r.marker.setLatLng(pos);
    });
    _rafId = requestAnimationFrame(_step);
  }

  function start() {
    if (_running || _routes.length === 0) return;
    _running = true;
    _step();
  }

  function stop() {
    _running = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  }

  function show() {
    _visible = true;
    _routes.forEach(r => r.marker.addTo(_map));
    start();
  }

  function hide() {
    _visible = false;
    _routes.forEach(r => _map.removeLayer(r.marker));
    stop();
  }

  return { init, load, start, stop, show, hide };

})();
