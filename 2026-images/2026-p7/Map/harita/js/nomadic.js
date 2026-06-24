// nomadic.js — vadi-abstraction-base (sabit, hiç durmayan taban ızgara) + 10 frame'in
// 1.2s durup 0.2s çakışarak (crossfade) sonsuz döngüde geçişi.

const NomadicAnimation = (function() {

  let _map     = null;
  let _base    = null;          // her zaman görünür, hiç değişmeyen taban katman
  let _layers  = [null, null];  // 2 katman, crossfade için alternatif olarak kullanılır
  let _frames  = [];
  let _idx     = 0;
  let _active  = 0;
  let _timer   = null;
  let _visible = false;

  const HOLD_MS = 1200, FADE_MS = 200;

  function init(map) {
    _map = map;
  }

  function load(baseGeojson, frameGeojsons, baseConfig, frameConfig) {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    if (_base) { _map.removeLayer(_base); _base = null; }
    _layers.forEach(l => { if (l) _map.removeLayer(l); });

    _frames = frameGeojsons;
    _idx    = 0;
    _active = 0;

    _base = sketchLayer(baseGeojson, baseConfig);

    const cfg0 = Object.assign({}, frameConfig, { extraClass: 'nomadic-frame nomadic-frame-0' });
    const cfg1 = Object.assign({}, frameConfig, { extraClass: 'nomadic-frame nomadic-frame-1' });
    _layers = [
      sketchLayer(_frames[0] || { type: 'FeatureCollection', features: [] }, cfg0),
      sketchLayer(_frames[1 % _frames.length] || { type: 'FeatureCollection', features: [] }, cfg1),
    ];

    if (_visible) show();
  }

  function _tick() {
    const nextIdx  = (_idx + 1) % _frames.length;
    const incoming = 1 - _active;

    _layers[incoming].setData(_frames[nextIdx]);
    if (_layers[incoming]._canvas) _layers[incoming]._canvas.classList.add('visible');
    if (_layers[_active]._canvas)  _layers[_active]._canvas.classList.remove('visible');

    _active = incoming;
    _idx    = nextIdx;
    _timer  = setTimeout(_tick, HOLD_MS + FADE_MS);
  }

  function show() {
    _visible = true;
    if (!_base) return;
    _base.addTo(_map);
    _layers.forEach(l => l.addTo(_map));
    requestAnimationFrame(() => {
      if (_layers[_active]._canvas) _layers[_active]._canvas.classList.add('visible');
    });
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(_tick, HOLD_MS + FADE_MS);
  }

  function hide() {
    _visible = false;
    if (_timer) { clearTimeout(_timer); _timer = null; }
    if (_base) _map.removeLayer(_base);
    _layers.forEach(l => { if (l) _map.removeLayer(l); });
  }

  return { init, load, show, hide };

})();
