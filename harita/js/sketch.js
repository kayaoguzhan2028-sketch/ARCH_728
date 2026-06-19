// sketch.js — Rough.js tabanlı GeoJSON canvas overlay

const SketchLayer = L.Layer.extend({

  initialize: function(geojsonData, options) {
    this._data   = geojsonData || { type: 'FeatureCollection', features: [] };
    this._opts   = Object.assign({
      color:       '#333333',
      fillColor:   'transparent',
      fillStyle:   'none',
      strokeWidth: 1.5,
      roughness:   2.0,
      bowing:      1.0,
      fill:        false,
    }, options);
  },

  onAdd: function(map) {
    this._map    = map;
    this._canvas = L.DomUtil.create('canvas', 'sketch-canvas');
    Object.assign(this._canvas.style, {
      position:       'absolute',
      top:            '0',
      left:           '0',
      pointerEvents:  'none',
      zIndex:         '400',
    });
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on('moveend zoomend resize viewreset', this._redraw, this);
    this._redraw();
    return this;
  },

  onRemove: function(map) {
    map.off('moveend zoomend resize viewreset', this._redraw, this);
    this._canvas.remove();
    return this;
  },

  setData: function(geojsonData) {
    this._data = geojsonData || { type: 'FeatureCollection', features: [] };
    if (this._map) this._redraw();
  },

  _redraw: function() {
    const size = this._map.getSize();
    this._canvas.width  = size.x;
    this._canvas.height = size.y;
    const rc = rough.canvas(this._canvas);
    const features = (this._data && this._data.features) || [];
    features.forEach(f => this._drawFeature(rc, f));
  },

  _project: function(coord) {
    const p = this._map.latLngToContainerPoint(L.latLng(coord[1], coord[0]));
    return [p.x, p.y];
  },

  _roughOpts: function() {
    return {
      stroke:      this._opts.color,
      strokeWidth: this._opts.strokeWidth,
      roughness:   this._opts.roughness,
      bowing:      this._opts.bowing,
      fill:        this._opts.fill ? this._opts.fillColor : undefined,
      fillStyle:   this._opts.fillStyle,
    };
  },

  _drawFeature: function(rc, feature) {
    if (!feature || !feature.geometry) return;
    const g = feature.geometry;
    const o = this._roughOpts();
    switch (g.type) {
      case 'LineString':      this._line(rc, g.coordinates, o);       break;
      case 'MultiLineString': g.coordinates.forEach(c => this._line(rc, c, o)); break;
      case 'Polygon':         this._polygon(rc, g.coordinates, o);    break;
      case 'MultiPolygon':    g.coordinates.forEach(r => this._polygon(rc, r, o)); break;
    }
  },

  _line: function(rc, coords, opts) {
    if (!coords || coords.length < 2) return;
    rc.linearPath(coords.map(c => this._project(c)), opts);
  },

  _polygon: function(rc, rings, opts) {
    if (!rings || !rings[0] || rings[0].length < 3) return;
    rc.polygon(rings[0].map(c => this._project(c)), opts);
  },

});

// Fabrika fonksiyonu
function sketchLayer(geojsonData, options) {
  return new SketchLayer(geojsonData, options);
}
