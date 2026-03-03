/**
 * map.js – Leaflet map initialisation with geo.admin WMTS layers.
 *
 * Base layers  : Swiss Map (colour / grey), Satellite, Topo 1:25 000
 * Overlay layers: National Cycling Routes, Mountain Bike Routes, Hiking
 *
 * All layers sourced from geo.admin.ch WMTS (EPSG:3857 / WebMercator).
 */
const MapManager = {
  map:              null,
  _baseLayers:      {},
  _overlayLayers:   {},
  _currentBase:     'color',
  _routeLayers:     [],
  _markerStart:     null,
  _markerEnd:       null,

  /* Route highlight colours (one per proposal) */
  ROUTE_COLORS: ['#e63946', '#3a86ff', '#2ec4b6', '#f4a261', '#8338ec'],

  /* ── Initialise ──────────────────────────────────── */

  init() {
    this.map = L.map('map', {
      center:      [46.8, 8.2],
      zoom:        9,
      zoomControl: true
    });

    this._defineLayers();
    this._baseLayers.color.addTo(this.map);
    this._overlayLayers.veloland.addTo(this.map);

    return this;
  },

  /* ── Layer definitions ───────────────────────────── */

  _wmts(layer, format) {
    return L.tileLayer(
      `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/{z}/{x}/{y}.${format}`,
      {
        attribution: '© <a href="https://www.swisstopo.admin.ch">swisstopo</a> / geo.admin.ch',
        maxZoom: 20,
        minZoom: 2
      }
    );
  },

  _defineLayers() {
    this._baseLayers = {
      color:   this._wmts('ch.swisstopo.pixelkarte-farbe',       'jpeg'),
      grey:    this._wmts('ch.swisstopo.pixelkarte-grau',        'jpeg'),
      aerial:  this._wmts('ch.swisstopo.swissimage',             'jpeg'),
      topo25k: this._wmts('ch.swisstopo.swisstlm3d-karte-farbe', 'png')
    };

    this._overlayLayers = {
      veloland:    this._wmts('ch.astra.veloland',         'png'),
      mountainbike:this._wmts('ch.astra.mountainbikelnd',  'png'),
      wanderland:  this._wmts('ch.astra.wanderland',       'png')
    };
  },

  /* ── Public controls ─────────────────────────────── */

  setBaseLayer(name) {
    if (this._baseLayers[this._currentBase]) {
      this.map.removeLayer(this._baseLayers[this._currentBase]);
    }
    if (this._baseLayers[name]) {
      this._baseLayers[name].addTo(this.map);
      this._currentBase = name;
    }
  },

  toggleOverlay(name, visible) {
    const layer = this._overlayLayers[name];
    if (!layer) return;
    visible ? layer.addTo(this.map) : this.map.removeLayer(layer);
  },

  /* ── Route display ───────────────────────────────── */

  /**
   * Draw an array of route objects on the map.
   * The first route is drawn with a solid line, alternatives with dashes.
   */
  displayRoutes(routes) {
    this.clearRoutes();

    routes.forEach((route, i) => {
      const color = this.ROUTE_COLORS[i % this.ROUTE_COLORS.length];
      const layer = L.geoJSON(route.geometry, {
        style: {
          color,
          weight:    i === 0 ? 5 : 4,
          opacity:   0.85,
          dashArray: i === 0 ? null : '10, 6'
        }
      }).addTo(this.map);

      this._routeLayers.push(layer);
    });

    if (this._routeLayers.length) {
      const group = L.featureGroup(this._routeLayers);
      this.map.fitBounds(group.getBounds().pad(0.08));
    }
  },

  /** Visually highlight one route and dim the others. */
  highlightRoute(index) {
    this._routeLayers.forEach((layer, i) => {
      layer.setStyle({
        opacity: i === index ? 1 : 0.25,
        weight:  i === index ? 7 : 3
      });
      if (i === index) layer.bringToFront();
    });
  },

  /** Restore all routes to default opacity. */
  resetHighlight() {
    this._routeLayers.forEach((layer, i) => {
      layer.setStyle({
        opacity: 0.85,
        weight:  i === 0 ? 5 : 4
      });
    });
  },

  clearRoutes() {
    this._routeLayers.forEach(l => this.map.removeLayer(l));
    this._routeLayers = [];
  },

  /* ── Markers ─────────────────────────────────────── */

  setStartMarker(latlng, label) {
    if (this._markerStart) this.map.removeLayer(this._markerStart);
    this._markerStart = L.marker(latlng, {
      title: label,
      icon:  this._icon('🟢')
    }).addTo(this.map);
  },

  setEndMarker(latlng, label) {
    if (this._markerEnd) this.map.removeLayer(this._markerEnd);
    this._markerEnd = L.marker(latlng, {
      title: label,
      icon:  this._icon('🔴')
    }).addTo(this.map);
  },

  clearMarkers() {
    if (this._markerStart) { this.map.removeLayer(this._markerStart); this._markerStart = null; }
    if (this._markerEnd)   { this.map.removeLayer(this._markerEnd);   this._markerEnd   = null; }
  },

  _icon(emoji) {
    return L.divIcon({
      html:      `<div style="font-size:22px;line-height:1">${emoji}</div>`,
      iconSize:  [28, 28],
      iconAnchor:[14, 14],
      className: ''
    });
  }
};
