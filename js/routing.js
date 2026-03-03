/**
 * routing.js – Route finding via Valhalla (valhalla1.openstreetmap.de).
 *
 * Uses the bicycle costing profile with use_roads: 0.2 so that the
 * router strongly prefers dedicated cycle ways and paths (~80% of the
 * route will follow cycling infrastructure rather than regular roads).
 *
 * A → B mode : requests up to 3 alternative routes (primary + 2 alternates).
 * Roundtrip  : generates 3–5 triangular loops in different compass
 *              directions and routes each one through Valhalla.
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
  VALHALLA: 'https://valhalla1.openstreetmap.de',

  /**
   * Bicycle costing options passed to every Valhalla request.
   * use_roads: 0–1 where 0 = strongly prefer dedicated cycle ways/paths.
   * Setting 0.2 keeps the router on cycle infrastructure ~80% of the time.
   */
  CYCLING_COSTING: {
    use_roads:    0.2,
    bicycle_type: 'hybrid',
    use_hills:    0.3
  },

  /**
   * Decode a Valhalla / Google encoded polyline (precision 6) into
   * a GeoJSON-style coordinate array [[lon, lat], …].
   */
  _decodePolyline6(encoded) {
    const coords = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      coords.push([lng / 1e6, lat / 1e6]);
    }
    return coords;
  },

  /** Merge all leg shapes of a Valhalla trip into a single GeoJSON LineString. */
  _tripToGeoJSON(trip) {
    const allCoords = [];
    for (const leg of trip.legs) {
      const coords = this._decodePolyline6(leg.shape);
      // Remove duplicate point at leg junction (Valhalla includes end of previous leg as start of next)
      if (allCoords.length > 0) coords.shift();
      allCoords.push(...coords);
    }
    return { type: 'LineString', coordinates: allCoords };
  },

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
    const body = {
      locations: [
        { lon: start.lng, lat: start.lat },
        { lon: end.lng,   lat: end.lat   }
      ],
      costing:         'bicycle',
      costing_options: { bicycle: this.CYCLING_COSTING },
      alternates:      2
    };

    const res  = await fetch(`${this.VALHALLA}/route`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(15000)
    });

    if (!res.ok) throw new Error('No routes found between these locations.');
    const data = await res.json();
    if (!data.trip) throw new Error('No routes found between these locations.');

    const alternateTrips = (data.alternates || []).map(a => a.trip);
    const trips = [data.trip, ...alternateTrips];

    return trips.map((trip, i) => ({
      id:       i + 1,
      name:     i === 0 ? 'Recommended Route' : `Alternative ${i}`,
      geometry: this._tripToGeoJSON(trip),
      distance: trip.summary.length,        // Valhalla returns km
      duration: trip.summary.time / 60      // Valhalla returns seconds
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

    const body = {
      locations: [start, wp1, wp2, start].map(p => ({ lon: p.lng, lat: p.lat })),
      costing:         'bicycle',
      costing_options: { bicycle: this.CYCLING_COSTING }
    };

    const res  = await fetch(`${this.VALHALLA}/route`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(15000)
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.trip) return null;

    return {
      geometry: this._tripToGeoJSON(data.trip),
      distance: data.trip.summary.length,
      duration: data.trip.summary.time / 60
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
