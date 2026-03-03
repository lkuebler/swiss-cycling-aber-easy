/**
 * geocoding.js – Location search via geo.admin.ch SearchServer.
 * Falls back to Nominatim if the geo.admin server is unavailable.
 */
const Geocoding = {
  GEO_ADMIN_URL:         'https://api3.geo.admin.ch/rest/services/api/SearchServer',
  NOMINATIM_URL:         'https://nominatim.openstreetmap.org/search',
  NOMINATIM_REVERSE_URL: 'https://nominatim.openstreetmap.org/reverse',

  /**
   * Search for locations matching the given text.
   * Returns an array of normalised result objects: { lat, lng, label }
   * @param {string} text
   * @returns {Promise<Array<{lat: number, lng: number, label: string}>>}
   */
  async search(text) {
    if (!text || text.trim().length < 2) return [];
    const clean = text.trim();

    try {
      return await this._searchGeoAdmin(clean);
    } catch (_) {
      return this._searchNominatim(clean);
    }
  },

  async _searchGeoAdmin(text) {
    const url = `${this.GEO_ADMIN_URL}?type=locations&searchText=${encodeURIComponent(text)}&lang=en&limit=8`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('geo.admin error');
    const data = await res.json();
    const results = data.results || [];

    return results.map(r => {
      const a = r.attrs;
      return {
        lat:   a.lat,
        lng:   a.lon,
        label: this._stripHtml(a.label || a.detail || 'Unknown')
      };
    }).filter(r => r.lat && r.lng);
  },

  /** Safely strip HTML tags by parsing through a detached DOM element. */
  _stripHtml(html) {
    const el = document.createElement('div');
    el.textContent = '';
    // Use innerHTML only to extract text – no scripts will execute in a
    // detached element that is never appended to the document.
    el.innerHTML = String(html);
    return el.textContent || '';
  },

  async _searchNominatim(text) {
    const url = `${this.NOMINATIM_URL}?q=${encodeURIComponent(text)}&format=json&limit=8&countrycodes=ch&accept-language=en`;
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'SwissCyclingRoutePlanner/1.0 (https://github.com/lkuebler/swiss-cycling-aber-easy)' },
      signal:  AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error('Nominatim error');
    const data = await res.json();

    return data.map(r => ({
      lat:   parseFloat(r.lat),
      lng:   parseFloat(r.lon),
      label: r.display_name
    }));
  },

  /**
   * Reverse-geocode a lat/lng to a human-readable label.
   * Returns a string label, or null if unavailable.
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<string|null>}
   */
  async reverseGeocode(lat, lng) {
    const url = `${this.NOMINATIM_REVERSE_URL}?lat=${lat}&lon=${lng}&format=json&accept-language=en`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SwissCyclingRoutePlanner/1.0 (https://github.com/lkuebler/swiss-cycling-aber-easy)' },
        signal:  AbortSignal.timeout(5000)
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.display_name || null;
    } catch (_) {
      return null;
    }
  }
};
