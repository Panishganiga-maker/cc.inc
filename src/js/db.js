/* ── CC.Inc Database Layer ── */
const DB = {
  async run(sql, params = []) {
    if (window.api) return await window.api.dbRun(sql, params);
    return this._fallback('run', sql, params);
  },
  async get(sql, params = []) {
    if (window.api) return await window.api.dbGet(sql, params);
    return this._fallback('get', sql, params);
  },
  async all(sql, params = []) {
    if (window.api) return await window.api.dbAll(sql, params);
    return this._fallback('all', sql, params);
  },

  /* localStorage fallback for browser-only dev/testing */
  _store: null,
  _initStore() {
    if (this._store) return;
    const raw = localStorage.getItem('ccinc_db');
    this._store = raw ? JSON.parse(raw) : { admins: [], events: [], zones: [], camera_assignments: [], crowd_readings: [], alerts: [], _seq: { admins:0, events:0, zones:0, camera_assignments:0, crowd_readings:0, alerts:0 } };
    // Seed default admin
    if (this._store.admins.length === 0) {
      this._store._seq.admins++;
      this._store.admins.push({ id: 1, username: 'admin', password_hash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', role: 'superadmin' });
      this._save();
    }
  },
  _save() { localStorage.setItem('ccinc_db', JSON.stringify(this._store)); },

  _fallback(type, sql, params) {
    this._initStore();
    const s = this._store;
    const lower = sql.trim().toLowerCase();

    // ── INSERT ──
    if (lower.startsWith('insert into')) {
      const m = sql.match(/insert into (\w+)\s*\(([^)]+)\)/i);
      if (!m) return { success: false, error: 'Parse error' };
      const table = m[1], cols = m[2].split(',').map(c => c.trim());
      if (!s[table]) { s[table] = []; s._seq[table] = 0; }
      s._seq[table]++;
      const row = { id: s._seq[table] };
      cols.forEach((c, i) => { row[c] = params[i] !== undefined ? params[i] : null; });
      s[table].push(row);
      this._save();
      return { success: true, result: { lastInsertRowid: row.id, changes: 1 } };
    }

    // ── SELECT ──
    if (lower.startsWith('select')) {
      const fromM = sql.match(/from\s+(\w+)/i);
      if (!fromM) return { success: true, result: type === 'all' ? [] : null };
      const table = fromM[1];
      if (!s[table]) return { success: true, result: type === 'all' ? [] : null };
      let rows = [...s[table]];

      // WHERE
      const whereM = sql.match(/where\s+(.+?)(?:\s+order|\s+limit|\s*$)/i);
      if (whereM) {
        const conds = whereM[1].split(/\s+and\s+/i);
        let pi = 0;
        conds.forEach(cond => {
          const cm = cond.trim().match(/(\w+)\s*=\s*\?/);
          if (cm) {
            const col = cm[1], val = params[pi++];
            rows = rows.filter(r => String(r[col]) === String(val));
          }
        });
      }

      // ORDER BY
      const orderM = sql.match(/order\s+by\s+(\w+)\s*(asc|desc)?/i);
      if (orderM) {
        const col = orderM[1], dir = (orderM[2] || 'asc').toLowerCase();
        rows.sort((a, b) => dir === 'desc' ? (b[col] > a[col] ? 1 : -1) : (a[col] > b[col] ? 1 : -1));
      }

      // COUNT
      if (lower.includes('count(*)')) {
        const r = { c: rows.length };
        return { success: true, result: type === 'all' ? [r] : r };
      }

      if (type === 'get') return { success: true, result: rows[0] || null };
      return { success: true, result: rows };
    }

    // ── UPDATE ──
    if (lower.startsWith('update')) {
      const m = sql.match(/update\s+(\w+)\s+set\s+(.+?)\s+where\s+(.+)/i);
      if (!m) return { success: false, error: 'Parse error' };
      const table = m[1];
      const setClauses = m[2].split(',').map(c => c.trim());
      const wherePart = m[3].trim();
      if (!s[table]) return { success: true, result: { changes: 0 } };

      let pi = 0;
      const updates = {};
      setClauses.forEach(cl => {
        const cm = cl.match(/(\w+)\s*=\s*\?/);
        if (cm) updates[cm[1]] = params[pi++];
      });

      const wm = wherePart.match(/(\w+)\s*=\s*\?/);
      const wCol = wm ? wm[1] : 'id';
      const wVal = params[pi];
      let changes = 0;
      s[table].forEach(r => {
        if (String(r[wCol]) === String(wVal)) {
          Object.assign(r, updates);
          changes++;
        }
      });
      this._save();
      return { success: true, result: { changes } };
    }

    // ── DELETE ──
    if (lower.startsWith('delete')) {
      const m = sql.match(/delete\s+from\s+(\w+)\s+where\s+(\w+)\s*=\s*\?/i);
      if (!m) return { success: false, error: 'Parse error' };
      const table = m[1], col = m[2], val = params[0];
      if (!s[table]) return { success: true, result: { changes: 0 } };
      const before = s[table].length;
      s[table] = s[table].filter(r => String(r[col]) !== String(val));
      this._save();
      return { success: true, result: { changes: before - s[table].length } };
    }

    return { success: false, error: 'Unsupported SQL in fallback mode' };
  }
};
