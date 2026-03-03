/**
 * routing.js – Route finding via OSRM public bicycle API.
 *
 * A → B mode : requests up to 3 alternative routes from OSRM.
 * Roundtrip  : generates 3–5 triangular loops in different compass
 *              directions and routes each one through OSRM.
 *
 * All returned route objects share the same schema:
 * {
 *   id       : number,
 *   name     : string,
 *   geometry : GeoJSON LineString { type, coordinates },
 *   distance : number,   // km
 *   duration : number    // minutes
 * }
 */
const Routing = {
  OSRM: 'https://router.project-osrm.org',

  /**
   * Main entry point.
   * @param {'a-to-b'|'roundtrip'} mode
   * @param {{lat:number,lng:number}} start
   * @param {{lat:number,lng:number}|null} end
   * @param {number} [targetDistanceKm] – used for roundtrip
   */
  async findRoutes(mode, start, end, targetDistanceKm = 50) {
    if (mode === 'a-to-b') {
      return this._aToBRoutes(start, end);
    }
    return this._roundtripRoutes(start, targetDistanceKm);
  },

  /* ── A → B ───────────────────────────────────────── */

  async _aToBRoutes(start, end) {
    const coord = `${start.lng},${start.lat};${end.lng},${end.lat}`;
    const url   = `${this.OSRM}/route/v1/bicycle/${coord}`
                + `?alternatives=3&geometries=geojson&overview=full`;

    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes.length) {
      throw new Error('No routes found between these locations.');
    }

    return data.routes.map((r, i) => ({
      id:       i + 1,
      name:     i === 0 ? 'Recommended Route' : `Alternative ${i}`,
      geometry: r.geometry,
      distance: r.distance / 1000,
      duration: r.duration / 60
    }));
  },

  /* ── Roundtrip ───────────────────────────────────── */

  async _roundtripRoutes(start, targetDistanceKm) {
    // Radius for a circle with circumference ≈ targetDistance.
    // Roads wind more than straight-line distance; a factor of 1.3
    // empirically keeps the actual road distance close to the target.
    const ROAD_WINDING_FACTOR = 1.3;
    const R = (targetDistanceKm * 1000) / (2 * Math.PI * ROAD_WINDING_FACTOR); // metres

    // 5 triangle variants at 36° intervals spread evenly around the compass
    // (5 routes × 36° = 180° coverage, giving good directional variety)
    const bearingOffsets = [0, 36, 72, 108, 144];
    const routes = [];

    for (let i = 0; i < bearingOffsets.length; i++) {
      try {
        const route = await this._singleRoundtrip(start, R, bearingOffsets[i]);
        if (route) {
          routes.push({ id: i + 1, name: `Route ${i + 1}`, ...route });
        }
      } catch (_) {
        // If a waypoint lands in a lake or outside the road network, skip it
      }
    }

    if (!routes.length) {
      throw new Error('Could not generate any roundtrip routes from this location.');
    }
    return routes;
  },

  async _singleRoundtrip(start, radiusMetres, bearingOffset) {
    // Two intermediate waypoints form an equilateral-triangle loop
    const wp1 = this._offset(start, radiusMetres, bearingOffset);
    const wp2 = this._offset(start, radiusMetres, bearingOffset + 120);

    const points = [start, wp1, wp2, start]
      .map(p => `${p.lng},${p.lat}`)
      .join(';');

    const url  = `${this.OSRM}/route/v1/bicycle/${points}`
               + `?geometries=geojson&overview=full`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes.length) return null;

    const r = data.routes[0];
    return {
      geometry: r.geometry,
      distance: r.distance / 1000,
      duration: r.duration / 60
    };
  },

  /**
   * Offset a lat/lng point by a given distance in metres along a compass bearing.
   * Uses the equirectangular approximation (accurate enough for ≤50 km offsets).
   */
  _offset(point, metres, bearingDeg) {
    const R_earth = 6371000; // Earth's radius in metres
    const bearing = (bearingDeg % 360) * Math.PI / 180;
    const lat1    = point.lat * Math.PI / 180;

    const dlat = metres / R_earth;
    const dlon = metres / (R_earth * Math.cos(lat1));

    return {
      lat: point.lat + (dlat * Math.cos(bearing)) * (180 / Math.PI),
      lng: point.lng + (dlon * Math.sin(bearing)) * (180 / Math.PI)
    };
  },

  /* ── Formatting helpers ──────────────────────────── */

  formatDistance(km) {
    return km < 1
      ? `${Math.round(km * 1000)} m`
      : `${km.toFixed(1)} km`;
  },

  formatDuration(minutes) {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }
};
