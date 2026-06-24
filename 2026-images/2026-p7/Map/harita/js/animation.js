// animation.js — hafriyat_guzergah üzerinde nokta akışı animasyonu

const HafriyatAnimation = (function() {

  let _map       = null;
  let _coords    = [];   // [lat, lng] dizisi — güzergah noktaları
  let _marker    = null;
  let _rafId     = null;
  let _progress  = 0;    // 0.0 – 1.0 arası
  let _speed     = 0.0003;
  let _running   = false;

  function _flattenCoords(geojson) {
    const pts = [];
    (geojson.features || []).forEach(f => {
      const g = f.geometry;
      if (!g) return;
      if (g.type === 'LineString') {
        g.coordinates.forEach(c => pts.push([c[1], c[0]]));
      } else if (g.type === 'MultiLineString') {
        g.coordinates.forEach(line => line.forEach(c => pts.push([c[1], c[0]])));
      }
    });
    return pts;
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

  function _step() {
    if (!_running || _coords.length === 0) return;
    _progress = (_progress + _speed) % 1.0;
    const pos = _interpolate(_coords, _progress);
    if (pos && _marker) _marker.setLatLng(pos);
    _rafId = requestAnimationFrame(_step);
  }

  function init(map) {
    _map = map;
    _marker = L.circleMarker([0, 0], {
      radius:      6,
      color:       '#e05c2a',
      fillColor:   '#e05c2a',
      fillOpacity: 0.9,
      weight:      0,
    }).addTo(map);
    _marker.setStyle({ opacity: 0, fillOpacity: 0 });
  }

  function load(geojson) {
    _coords = _flattenCoords(geojson);
    _progress = 0;
    if (_coords.length > 0) {
      _marker.setStyle({ opacity: 1, fillOpacity: 0.9 });
      start();
    } else {
      _marker.setStyle({ opacity: 0, fillOpacity: 0 });
      stop();
    }
  }

  function start() {
    if (_running) return;
    _running = true;
    _step();
  }

  function stop() {
    _running = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  }

  function setSpeed(s) { _speed = s; }

  return { init, load, start, stop, setSpeed };

})();
