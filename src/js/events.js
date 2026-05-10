/* ── CC.Inc Events Module ── */
const Events = {
  async getAll() {
    const res = await DB.all('SELECT * FROM events ORDER BY created_at DESC', []);
    return res.success ? res.result : [];
  },

  async getById(id) {
    const res = await DB.get('SELECT * FROM events WHERE id = ?', [id]);
    return res.success ? res.result : null;
  },

  async create(data) {
    const res = await DB.run(
      'INSERT INTO events (name, date, start_time, status, venue_width, venue_height, unit, venue_polygon, safety_standard, custom_density) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.name, data.date, data.start_time, 'active', data.venue_width || 0, data.venue_height || 0, data.unit || 'metres', data.venue_polygon || '', data.safety_standard || 'international', data.custom_density || null]
    );
    return res.success ? res.result.lastInsertRowid : null;
  },

  async endEvent(id) {
    await DB.run('UPDATE events SET status = ?, ended_at = ? WHERE id = ?', ['ended', Utils.now(), id]);
  },

  async getZones(eventId) {
    const res = await DB.all('SELECT * FROM zones WHERE event_id = ?', [eventId]);
    return res.success ? res.result : [];
  },

  async createZone(data) {
    const res = await DB.run(
      'INSERT INTO zones (event_id, name, width, height, type, auto_capacity, max_capacity, canvas_polygon, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.event_id, data.name, data.width, data.height, data.type, data.auto_capacity, data.max_capacity, data.canvas_polygon || '', data.color || '#00d4ff']
    );
    return res.success ? res.result.lastInsertRowid : null;
  },

  async updateZone(id, data) {
    await DB.run(
      'UPDATE zones SET name = ?, width = ?, height = ?, type = ?, auto_capacity = ?, max_capacity = ?, canvas_polygon = ?, color = ? WHERE id = ?',
      [data.name, data.width, data.height, data.type, data.auto_capacity, data.max_capacity, data.canvas_polygon || '', data.color || '#00d4ff', id]
    );
  },

  async deleteZone(id) {
    await DB.run('DELETE FROM zones WHERE id = ?', [id]);
  },

  async addReading(eventId, zoneId, count) {
    await DB.run('INSERT INTO crowd_readings (event_id, zone_id, count, timestamp) VALUES (?, ?, ?, ?)',
      [eventId, zoneId, count, Utils.now()]);
  },

  async getReadings(eventId, zoneId) {
    const sql = zoneId
      ? 'SELECT * FROM crowd_readings WHERE event_id = ? AND zone_id = ? ORDER BY timestamp ASC'
      : 'SELECT * FROM crowd_readings WHERE event_id = ? ORDER BY timestamp ASC';
    const params = zoneId ? [eventId, zoneId] : [eventId];
    const res = await DB.all(sql, params);
    return res.success ? res.result : [];
  },

  async addAlert(eventId, zoneId, message) {
    const res = await DB.run('INSERT INTO alerts (event_id, zone_id, message, sent_at, status) VALUES (?, ?, ?, ?, ?)',
      [eventId, zoneId, message, Utils.now(), 'pending']);
    return res.success ? res.result.lastInsertRowid : null;
  },

  async ackAlert(id) {
    await DB.run('UPDATE alerts SET status = ?, acknowledged_at = ? WHERE id = ?', ['acknowledged', Utils.now(), id]);
  },

  async missAlert(id) {
    await DB.run('UPDATE alerts SET status = ? WHERE id = ?', ['missed', id]);
  },

  async getAlerts(eventId) {
    const res = await DB.all('SELECT * FROM alerts WHERE event_id = ? ORDER BY sent_at DESC', [eventId]);
    return res.success ? res.result : [];
  },

  async getCameras(eventId) {
    const res = await DB.all('SELECT * FROM camera_assignments WHERE event_id = ?', [eventId]);
    return res.success ? res.result : [];
  },

  async assignCamera(eventId, zoneId, cameraId, cameraName) {
    await DB.run('INSERT INTO camera_assignments (event_id, zone_id, camera_id, camera_name) VALUES (?, ?, ?, ?)',
      [eventId, zoneId, cameraId, cameraName]);
  },

  /* Render event list view */
  renderList(events, onSelect) {
    if (!events.length) {
      return `<div class="empty-state"><div class="empty-state-icon">📋</div><p>No events yet. Create your first event!</p></div>`;
    }
    return events.map(ev => `
      <div class="event-item" data-event-id="${ev.id}">
        <div class="event-item-info">
          <h4>${Utils.esc(ev.name)}</h4>
          <div class="event-item-meta">${Utils.formatDate(ev.date)} · ${ev.start_time || ''}</div>
        </div>
        <span class="badge badge-dot ${ev.status === 'active' ? 'badge-active badge-pulse' : 'badge-ended'}">${ev.status === 'active' ? 'Active' : 'Ended'}</span>
      </div>
    `).join('');
  }
};
