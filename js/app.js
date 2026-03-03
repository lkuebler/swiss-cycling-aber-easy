/**
 * app.js – Main application controller.
 *
 * Coordinates the map, geocoding, routing, GPX export and localStorage.
 */

const AUTOCOMPLETE_DEBOUNCE_MS  = 280;  // delay before firing the location search
const SAVE_FEEDBACK_DURATION_MS = 2000; // how long "✅ Saved!" is shown

const App = {
  _mode:         'a-to-b',   // 'a-to-b' | 'roundtrip'
  _start:        null,       // { lat, lng, label }
  _end:          null,       // { lat, lng, label }
  _currentRoutes:[],
  _savedRoutes:  [],

  /* ── Bootstrap ───────────────────────────────────── */

  init() {
    MapManager.init();
    this._loadSaved();
    this._bindUI();
  },

  /* ── UI event bindings ───────────────────────────── */

  _bindUI() {
    /* Sidebar toggle */
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('collapsed');
      document.getElementById('sidebar-open').style.display = 'block';
    });
    document.getElementById('sidebar-open').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('collapsed');
      document.getElementById('sidebar-open').style.display = 'none';
    });

    /* Base map cards */
    document.querySelectorAll('.map-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.map-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        MapManager.setBaseLayer(card.dataset.layer);
      });
    });

    /* Cycling overlays */
    document.getElementById('overlay-veloland').addEventListener('change', e =>
      MapManager.toggleOverlay('veloland', e.target.checked));
    document.getElementById('overlay-mountainbike').addEventListener('change', e =>
      MapManager.toggleOverlay('mountainbike', e.target.checked));
    document.getElementById('overlay-wanderland').addEventListener('change', e =>
      MapManager.toggleOverlay('wanderland', e.target.checked));

    /* Mode tabs */
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._mode = tab.dataset.mode;
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('a-to-b-inputs').classList.toggle('active',    this._mode === 'a-to-b');
        document.getElementById('roundtrip-inputs').classList.toggle('active', this._mode === 'roundtrip');
        // Reset locations so the correct input drives the marker
        this._start = null;
        this._end   = null;
        MapManager.clearMarkers();
      });
    });

    /* Distance slider */
    document.getElementById('distance-slider').addEventListener('input', e => {
      document.getElementById('distance-value').textContent = e.target.value;
    });

    /* Autocomplete inputs */
    this._setupAutocomplete('start-input',          'start-suggestions',          loc => {
      this._start = loc;
      MapManager.setStartMarker([loc.lat, loc.lng], 'Start: ' + loc.label);
    });
    this._setupAutocomplete('end-input',            'end-suggestions',            loc => {
      this._end = loc;
      MapManager.setEndMarker([loc.lat, loc.lng], 'End: ' + loc.label);
    });
    this._setupAutocomplete('roundtrip-start-input','roundtrip-start-suggestions',loc => {
      this._start = loc;
      MapManager.setStartMarker([loc.lat, loc.lng], 'Start: ' + loc.label);
    });

    /* Find routes */
    document.getElementById('find-routes-btn').addEventListener('click', () => this._findRoutes());

    /* Results panel close */
    document.getElementById('results-close').addEventListener('click', () => {
      document.getElementById('results-panel').hidden = true;
      MapManager.clearRoutes();
    });
  },

  /* ── Autocomplete helper ─────────────────────────── */

  _setupAutocomplete(inputId, suggestionsId, onSelect) {
    const input = document.getElementById(inputId);
    const list  = document.getElementById(suggestionsId);
    let timer;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const results = await Geocoding.search(input.value);
        this._renderSuggestions(list, results, result => {
          input.value = result.label;
          list.classList.remove('open');
          onSelect(result);
        });
      }, AUTOCOMPLETE_DEBOUNCE_MS);
    });

    /* Close suggestions when clicking elsewhere */
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !list.contains(e.target)) {
        list.classList.remove('open');
      }
    });
  },

  _renderSuggestions(list, results, onSelect) {
    list.innerHTML = '';
    if (!results.length) { list.classList.remove('open'); return; }

    results.slice(0, 6).forEach(r => {
      const li = document.createElement('li');
      li.className = 'suggestion-item';
      li.textContent = r.label;
      li.addEventListener('click', () => onSelect(r));
      list.appendChild(li);
    });
    list.classList.add('open');
  },

  /* ── Route finding ───────────────────────────────── */

  async _findRoutes() {
    if (!this._start) {
      alert('Please select a start location.');
      return;
    }
    if (this._mode === 'a-to-b' && !this._end) {
      alert('Please select an end location.');
      return;
    }

    document.getElementById('loading').hidden = false;
    document.getElementById('find-routes-btn').disabled = true;

    try {
      const distance = parseInt(document.getElementById('distance-slider').value, 10);
      const routes = await Routing.findRoutes(this._mode, this._start, this._end, distance);
      this._currentRoutes = routes;
      MapManager.displayRoutes(routes);
      this._renderResults(routes);
    } catch (err) {
      alert('Could not find routes: ' + err.message);
    } finally {
      document.getElementById('loading').hidden = true;
      document.getElementById('find-routes-btn').disabled = false;
    }
  },

  /* ── Results rendering ───────────────────────────── */

  _renderResults(routes) {
    const list = document.getElementById('results-list');
    list.innerHTML = '';

    routes.forEach((route, idx) => {
      const color = MapManager.ROUTE_COLORS[idx % MapManager.ROUTE_COLORS.length];
      const card  = document.createElement('div');
      card.className = 'route-card';
      card.innerHTML = `
        <div class="route-card-header">
          <span class="route-color-dot" style="background:${color}"></span>
          <h3>${route.name}</h3>
        </div>
        <div class="route-stats">
          <span>📏 ${Routing.formatDistance(route.distance)}</span>
          <span>⏱ ${Routing.formatDuration(route.duration)}</span>
        </div>
        <div class="route-actions">
          <button class="btn-sm" data-action="gpx"  data-idx="${idx}">📥 Export GPX</button>
          <button class="btn-sm" data-action="save" data-idx="${idx}">💾 Save</button>
        </div>`;

      card.addEventListener('mouseenter', () => MapManager.highlightRoute(idx));
      card.addEventListener('mouseleave', () => MapManager.resetHighlight());

      card.querySelector('[data-action="gpx"]').addEventListener('click', e => {
        e.stopPropagation();
        GPX.export(this._currentRoutes[idx]);
      });
      card.querySelector('[data-action="save"]').addEventListener('click', e => {
        e.stopPropagation();
        this._saveRoute(idx, e.currentTarget);
      });

      list.appendChild(card);
    });

    document.getElementById('results-panel').hidden = false;
  },

  /* ── Save / load routes (localStorage) ──────────── */

  _saveRoute(idx, btn) {
    const route = { ...this._currentRoutes[idx], savedAt: new Date().toISOString() };
    this._savedRoutes.push(route);
    localStorage.setItem('swiss-cycling-routes', JSON.stringify(this._savedRoutes));
    this._renderSaved();

    const orig = btn.textContent;
    btn.textContent = '✅ Saved!';
    setTimeout(() => { btn.textContent = orig; }, SAVE_FEEDBACK_DURATION_MS);
  },

  _loadSaved() {
    try {
      const raw = localStorage.getItem('swiss-cycling-routes');
      this._savedRoutes = raw ? JSON.parse(raw) : [];
    } catch (_) {
      this._savedRoutes = [];
    }
    this._renderSaved();
  },

  _renderSaved() {
    const container = document.getElementById('saved-routes-list');
    container.innerHTML = '';

    if (!this._savedRoutes.length) {
      container.innerHTML = '<p class="empty-hint">No saved routes yet.</p>';
      return;
    }

    this._savedRoutes.forEach((route, idx) => {
      const div = document.createElement('div');
      div.className = 'saved-item';
      div.innerHTML = `
        <span class="saved-name">${route.name}</span>
        <span class="saved-dist">${Routing.formatDistance(route.distance)}</span>
        <button class="icon-btn" title="Show on map"    data-action="show"   data-idx="${idx}">🗺️</button>
        <button class="icon-btn" title="Export GPX"     data-action="gpx"    data-idx="${idx}">📥</button>
        <button class="icon-btn" title="Delete"         data-action="delete" data-idx="${idx}">🗑️</button>`;

      div.querySelector('[data-action="show"]').addEventListener('click', () => {
        this._currentRoutes = [this._savedRoutes[idx]];
        MapManager.displayRoutes(this._currentRoutes);
        this._renderResults(this._currentRoutes);
      });
      div.querySelector('[data-action="gpx"]').addEventListener('click', () =>
        GPX.export(this._savedRoutes[idx]));
      div.querySelector('[data-action="delete"]').addEventListener('click', () => {
        this._savedRoutes.splice(idx, 1);
        localStorage.setItem('swiss-cycling-routes', JSON.stringify(this._savedRoutes));
        this._renderSaved();
      });

      container.appendChild(div);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
