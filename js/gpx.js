/**
 * gpx.js – Export a route as a .gpx file for download.
 */
const GPX = {
  /**
   * @param {object} route – route object with geometry (GeoJSON LineString) and name
   */
  export(route) {
    const name = route.name || 'Swiss Cycling Route';
    const coords = route.geometry.coordinates; // [[lng, lat], …]

    const trkpts = coords
      .map(([lng, lat]) => `      <trkpt lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}"></trkpt>`)
      .join('\n');

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Swiss Cycling Route Planner"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1
       http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${this._escapeXml(name)}</name>
    <desc>Exported from Swiss Cycling Route Planner</desc>
  </metadata>
  <trk>
    <name>${this._escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${name.replace(/\s+/g, '_')}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  _escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
};
