// proletariat.js — hafriyat güzergahlarının tersine, "missing-buildings" ızgarasına dönen
// malzeme akışı animasyonu. Her tur tamamlandığında (kare binaya vardığında) o binanın
// ızgarasının opacity'si kademeli artar (0.5 -> 0.9 tavan).

const ProletariatAnimation = (function() {

  let _map     = null;
  let _routes  = [];   // [{coords, marker, routeIndex, progress, speed}]
  let _grids   = {};   // routeIndex -> {polygons:[L.polygon], opacity:number}
  let _rafId   = null;
  let _running = false;
  let _visible = false;

  const SIZES_PX = [4, 5, 6];
  const COLOR = '#d4a843';
  const SQUARES_PER_ROUTE = 4;

  function _flattenLine(geometry) {
    if (!geometry || geometry.type !== 'LineString') return [];
    return geometry.coordinates.map(c => [c[1], c[0]]);
  }

  function _interpolate(coords, t) {
    if (coords.length === 0) return null;
    if (coords.length === 1) return coords[0];
    const total  = coords.length - 1;
    const scaled = t * total;
    const i      = Math.min(Math.floor(scaled), total - 1);
    const frac   = scaled - i;
    const a = coords[i], b = coords[i + 1];
    return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
  }

  function init(map) {
    _map = map;
  }

  function load(routeGeojson, gridGeojson) {
    _routes.forEach(r => { if (r.marker) _map.removeLayer(r.marker); });
    Object.values(_grids).forEach(g => g.polygons.forEach(p => _map.removeLayer(p)));
    _routes = [];
    _grids  = {};

    (gridGeojson.features || []).forEach(f => {
      const ri = f.properties.route_index;
      if (!_grids[ri]) _grids[ri] = { polygons: [], opacity: 0.5 };
      const ring = f.geometry.coordinates[0].map(c => [c[1], c[0]]);
      const poly = L.polygon(ring, {
        color: COLOR, weight: 0.5, opacity: 0.6,
        fillColor: COLOR, fillOpacity: _grids[ri].opacity,
        interactive: false,
      });
      if (_visible) poly.addTo(_map);
      _grids[ri].polygons.push(poly);
    });

    (routeGeojson.features || []).forEach((f, ri) => {
      const coords = _flattenLine(f.geometry).slice().reverse(); // hafriyatın tersi yöne
      if (coords.length < 2) return;

      for (let n = 0; n < SQUARES_PER_ROUTE; n++) {
        const px = SIZES_PX[Math.floor(Math.random() * SIZES_PX.length)];
        const marker = L.marker(coords[0], {
          icon: L.divIcon({
            className: 'proletariat-square',
            html: `<div style="width:${px}px;height:${px}px;"></div>`,
            iconSize: [px, px],
          }),
          interactive: false,
        });
        if (_visible) marker.addTo(_map);

        _routes.push({
          coords, marker, routeIndex: ri,
          progress: Math.random(),
          speed:    0.00035 + Math.random() * 0.0004,
        });
      }
    });

    if (_routes.length > 0 && _visible) start(); else stop();
  }

  function _onArrive(routeIndex) {
    const g = _grids[routeIndex];
    if (!g) return;
    g.opacity = Math.min(0.9, g.opacity + 0.1);
    g.polygons.forEach(p => p.setStyle({ fillOpacity: g.opacity }));
  }

  function _step() {
    if (!_running) return;
    _routes.forEach(r => {
      const next = r.progress + r.speed;
      if (next >= 1) _onArrive(r.routeIndex);
      r.progress = next % 1.0;
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
    Object.values(_grids).forEach(g => g.polygons.forEach(p => p.addTo(_map)));
    start();
  }

  function hide() {
    _visible = false;
    _routes.forEach(r => _map.removeLayer(r.marker));
    Object.values(_grids).forEach(g => g.polygons.forEach(p => _map.removeLayer(p)));
    stop();
  }

  return { init, load, start, stop, show, hide };

})();
