/* ── CC.Inc Utilities ── */
const Utils = {
  /* Format date string */
  formatDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  formatTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  },
  formatDateTime(d) {
    return this.formatDate(d) + ' ' + this.formatTime(d);
  },
  now() { return new Date().toISOString(); },

  /* Elapsed timer */
  elapsed(startISO) {
    const s = Math.floor((Date.now() - new Date(startISO).getTime()) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  },

  /* SHA-256 hash */
  async sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /* Area & capacity calculations */
  calcArea(w, h) { return w * h; },

  densityStandards: {
    international: { standing: 0.5, seated: 0.8, mixed: 0.65 },
    ukgreen: { standing: 0.5, seated: 1.0, mixed: 0.75 },
  },

  calcCapacity(area, zoneType, standard = 'international', customDensity = null) {
    let density;
    if (standard === 'custom' && customDensity) {
      density = customDensity;
    } else {
      const std = this.densityStandards[standard] || this.densityStandards.international;
      density = std[zoneType] || std.standing;
    }
    return Math.floor(area / density);
  },

  /* Convert between m and ft */
  mToFt(m) { return m * 3.28084; },
  ftToM(ft) { return ft / 3.28084; },
  sqmToSqft(sqm) { return sqm * 10.7639; },

  /* Density % */
  densityPct(count, max) { return max > 0 ? Math.round((count / max) * 100) : 0; },

  /* Zone color by density */
  zoneColor(pct) {
    if (pct >= 90) return 'red';
    if (pct >= 70) return 'amber';
    return 'green';
  },

  /* Unique ID */
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },

  /* Zone palette */
  zoneColors: ['#00d4ff','#a855f7','#f59e0b','#22c55e','#ef4444','#ec4899','#6366f1','#14b8a6','#f97316','#84cc16'],
  getZoneColor(i) { return this.zoneColors[i % this.zoneColors.length]; },

  /* Escape HTML */
  esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; },

  /* Simple template */
  $(sel) { return document.querySelector(sel); },
  $$(sel) { return document.querySelectorAll(sel); },

  /* Inject HTML */
  render(container, html) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (el) el.innerHTML = html;
  }
};
