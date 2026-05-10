/* ── CC.Inc Live Dashboard ── */
const Dashboard = {
  eventId: null,
  event: null,
  zones: [],
  crowdState: {},
  alerts: [],
  densityChart: null,
  _elapsed: null,
  _alertDuration: 30,
  _activePopups: {},
  _detailZoneId: null,
  _detailChart: null,
  _readings: {},

  async load(eventId) {
    this.eventId = eventId;
    this.event = await Events.getById(eventId);
    this.zones = await Events.getZones(eventId);
    this.alerts = await Events.getAlerts(eventId);
    this.zones.forEach(z => { this.crowdState[z.id] = 0; this._readings[z.id] = []; });
  },

  render() {
    const ev = this.event;
    return `
    <div class="dash-wrap">
      <div class="dash-topbar">
        <div class="dash-topbar-left">
          <div class="home-logo">cc<span>.inc</span></div>
          <div class="dash-event-name">${Utils.esc(ev.name)}</div>
          <div class="dash-elapsed" id="dash-elapsed">00:00:00</div>
        </div>
        <div class="flex items-center gap-16">
          <div class="hw-status">
            <span class="hw-dot ${Hardware.connected ? 'connected' : 'disconnected'}"></span>
            <span>${Hardware.simMode ? 'Simulation' : (Hardware.connected ? 'Connected' : 'Disconnected')}</span>
          </div>
          <button class="btn btn-danger btn-sm" id="end-event-btn">End Event</button>
        </div>
      </div>
      <div class="dash-body">
        <div class="dash-left">
          <h4 class="mb-16">Venue Map</h4>
          <div class="venue-map-container" id="venue-map" style="min-height:300px;position:relative"></div>
        </div>
        <div class="dash-right">
          <div class="chart-card">
            <h4>Live Density — All Zones</h4>
            <div class="chart-wrap"><canvas id="density-chart"></canvas></div>
          </div>
          <div class="flex gap-16" style="flex:1;min-height:0">
            <div style="flex:1;min-width:0">
              <h4 class="mb-8">Event Data</h4>
              <div class="table-wrap" style="max-height:260px;overflow:auto">
                <table><thead><tr><th>Zone</th><th>Count</th><th>Max</th><th>Density</th><th>Status</th></tr></thead>
                <tbody id="dash-table"></tbody></table>
              </div>
            </div>
            <div style="width:280px;flex-shrink:0">
              <h4 class="mb-8">Notifications <span class="badge badge-ended" id="notif-count">${this.alerts.length}</span></h4>
              <div class="notif-section" id="notif-panel"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="zone-detail" id="zone-detail"></div>`;
  },

  bind() {
    this.renderMap();
    this.initDensityChart();
    this.updateTable();
    this.renderNotifications();
    this.startTimer();
    this.startDataFeed();

    Utils.$('#end-event-btn').addEventListener('click', async () => {
      if (!confirm('End this event? This cannot be undone.')) return;
      Hardware.stopSimulation();
      this.stopTimer();
      await Events.endEvent(this.eventId);
      App.navigate('analytics', { eventId: this.eventId });
    });
  },

  /* ── Venue map ── */
  renderMap() {
    const container = Utils.$('#venue-map');
    if (!container) return;
    const zones = this.zones;
    if (!zones.length) { container.innerHTML = '<p class="text-muted p-24">No zones</p>'; return; }

    const cols = Math.ceil(Math.sqrt(zones.length));
    const rows = Math.ceil(zones.length / cols);
    const gapPct = 2;
    const cellW = (100 - gapPct * (cols + 1)) / cols;
    const cellH = (100 - gapPct * (rows + 1)) / rows;
    container.style.paddingBottom = `${rows * 80 + 40}px`;

    container.innerHTML = zones.map((z, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const left = gapPct + col * (cellW + gapPct);
      const top = gapPct + row * (cellH + gapPct);
      const count = this.crowdState[z.id] || 0;
      const pct = Utils.densityPct(count, z.max_capacity);
      const color = Utils.zoneColor(pct);

      return `
      <div class="map-zone ${color}" id="map-zone-${z.id}" data-zone-id="${z.id}"
           style="left:${left}%;top:${top}%;width:${cellW}%;height:${cellH}%;min-height:80px">
        <div class="zone-label">${Utils.esc(z.name)}</div>
        <div class="zone-count" id="zc-${z.id}">${count}</div>
        <div class="zone-max">/ ${z.max_capacity}</div>
        <div class="zone-fill-bar"><div id="zfill-${z.id}" style="width:${pct}%;background:var(--${color})"></div></div>
      </div>`;
    }).join('');

    container.querySelectorAll('.map-zone').forEach(el => {
      el.addEventListener('click', () => this.openZoneDetail(parseInt(el.dataset.zoneId)));
    });
  },

  updateMap() {
    this.zones.forEach(z => {
      const count = this.crowdState[z.id] || 0;
      const pct = Utils.densityPct(count, z.max_capacity);
      const color = Utils.zoneColor(pct);
      const el = Utils.$(`#map-zone-${z.id}`);
      if (!el) return;
      el.className = `map-zone ${color}`;
      const countEl = Utils.$(`#zc-${z.id}`);
      if (countEl) countEl.textContent = count;
      const fillEl = Utils.$(`#zfill-${z.id}`);
      if (fillEl) { fillEl.style.width = pct + '%'; fillEl.style.background = `var(--${color})`; }
    });
  },

  /* ── Zone detail sidebar ── */
  openZoneDetail(zoneId) {
    this._detailZoneId = zoneId;
    const z = this.zones.find(zz => zz.id === zoneId);
    if (!z) return;
    const count = this.crowdState[z.id] || 0;
    const pct = Utils.densityPct(count, z.max_capacity);
    const panel = Utils.$('#zone-detail');
    panel.innerHTML = `
      <div class="zone-detail-header">
        <h3>${Utils.esc(z.name)}</h3>
        <button class="btn btn-icon btn-sm btn-secondary" id="close-zone-detail">✕</button>
      </div>
      <div class="flex gap-12 mb-16">
        <div class="card" style="flex:1;padding:12px;text-align:center">
          <div class="text-muted text-xs">Current</div>
          <div style="font-size:24px;font-weight:700" id="zd-count">${count}</div>
        </div>
        <div class="card" style="flex:1;padding:12px;text-align:center">
          <div class="text-muted text-xs">Capacity</div>
          <div style="font-size:24px;font-weight:700">${z.max_capacity}</div>
        </div>
        <div class="card" style="flex:1;padding:12px;text-align:center">
          <div class="text-muted text-xs">Density</div>
          <div style="font-size:24px;font-weight:700" id="zd-pct">${pct}%</div>
        </div>
      </div>
      <div class="text-sm text-muted mb-8">Type: ${z.type} · ${z.width}×${z.height}</div>
      <div class="chart-card"><h4>Density Over Time</h4><div class="chart-wrap" style="height:180px"><canvas id="zd-chart"></canvas></div></div>`;
    panel.classList.add('open');

    Utils.$('#close-zone-detail').addEventListener('click', () => {
      panel.classList.remove('open');
      this._detailZoneId = null;
      if (this._detailChart) { this._detailChart.destroy(); this._detailChart = null; }
    });

    this.initDetailChart(zoneId);
  },

  initDetailChart(zoneId) {
    if (this._detailChart) this._detailChart.destroy();
    const ctx = Utils.$('#zd-chart');
    if (!ctx) return;
    const z = this.zones.find(zz => zz.id === zoneId);
    const readings = this._readings[zoneId] || [];

    this._detailChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: readings.map(r => r.time),
        datasets: [{ label: 'Density %', data: readings.map(r => r.pct), borderColor: z?.color || '#00d4ff', backgroundColor: (z?.color || '#00d4ff') + '20', fill: true, tension: .3, pointRadius: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: true, grid: { color: '#1e2230' }, ticks: { color: '#7a8194', maxTicksLimit: 6 } }, y: { min: 0, max: 120, grid: { color: '#1e2230' }, ticks: { color: '#7a8194', callback: v => v + '%' } } }, plugins: { legend: { display: false } } }
    });
  },

  /* ── Density chart ── */
  initDensityChart() {
    const ctx = Utils.$('#density-chart');
    if (!ctx) return;
    const datasets = this.zones.map(z => ({
      label: z.name, data: [], borderColor: z.color || '#00d4ff', backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 2
    }));
    this.densityChart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        scales: { x: { grid: { color: '#1e2230' }, ticks: { color: '#7a8194', maxTicksLimit: 10 } }, y: { min: 0, max: 120, grid: { color: '#1e2230' }, ticks: { color: '#7a8194', callback: v => v + '%' } } },
        plugins: { legend: { labels: { color: '#c0c4cc', usePointStyle: true, pointStyle: 'circle' } }, tooltip: { callbacks: { label: ctx => { const z = this.zones[ctx.datasetIndex]; return `${z?.name}: ${ctx.parsed.y}% (${this.crowdState[z?.id] || 0}/${z?.max_capacity})`; } } } }
      }
    });
  },

  pushChartData(timeLabel) {
    if (!this.densityChart) return;
    this.densityChart.data.labels.push(timeLabel);
    if (this.densityChart.data.labels.length > 60) { this.densityChart.data.labels.shift(); this.densityChart.data.datasets.forEach(ds => ds.data.shift()); }
    this.zones.forEach((z, i) => {
      const pct = Utils.densityPct(this.crowdState[z.id] || 0, z.max_capacity);
      this.densityChart.data.datasets[i].data.push(pct);
    });
    this.densityChart.update('none');
  },

  /* ── Table ── */
  updateTable() {
    const tbody = Utils.$('#dash-table');
    if (!tbody) return;
    tbody.innerHTML = this.zones.map(z => {
      const count = this.crowdState[z.id] || 0;
      const pct = Utils.densityPct(count, z.max_capacity);
      const color = Utils.zoneColor(pct);
      return `<tr>
        <td><span class="zone-color-dot" style="background:${z.color}"></span> ${Utils.esc(z.name)}</td>
        <td>${count}</td><td>${z.max_capacity}</td>
        <td><span class="badge badge-${color}">${pct}%</span></td>
        <td><span class="badge badge-${color} badge-dot">${color === 'red' ? 'Overcrowded' : color === 'amber' ? 'Warning' : 'Normal'}</span></td>
      </tr>`;
    }).join('');
  },

  /* ── Notifications ── */
  renderNotifications() {
    const panel = Utils.$('#notif-panel');
    if (!panel) return;
    const countEl = Utils.$('#notif-count');
    if (countEl) countEl.textContent = this.alerts.length;

    if (!this.alerts.length) { panel.innerHTML = '<p class="text-muted text-sm p-16">No notifications yet</p>'; return; }
    panel.innerHTML = this.alerts.map(a => {
      const cls = a.status === 'acknowledged' ? 'acked' : a.status === 'missed' ? 'missed' : 'pending';
      return `<div class="notif-item ${cls}">
        <div style="flex:1"><div>${Utils.esc(a.message)}</div><div class="notif-time">${Utils.formatDateTime(a.sent_at)} · ${a.status}</div></div>
      </div>`;
    }).join('');
  },

  async triggerAlert(zone) {
    const msg = `${zone.name} has become overcrowded`;
    const alertId = await Events.addAlert(this.eventId, zone.id, msg);
    this.alerts.unshift({ id: alertId, event_id: this.eventId, zone_id: zone.id, message: msg, sent_at: Utils.now(), status: 'pending' });
    this.renderNotifications();
    this.showAlertPopup(alertId, msg);
  },

  showAlertPopup(alertId, message) {
    if (this._activePopups[alertId]) return;
    const container = Utils.$('#alert-popup-container');
    const popup = document.createElement('div');
    popup.className = 'alert-popup';
    popup.id = `popup-${alertId}`;
    popup.innerHTML = `
      <div class="alert-popup-header">
        <span class="text-red" style="font-weight:700">⚠ Overcrowding Alert</span>
      </div>
      <div class="alert-popup-msg">${Utils.esc(message)}</div>
      <div class="alert-timer"><div id="timer-bar-${alertId}" style="width:100%"></div></div>
      <div class="alert-popup-actions">
        <button class="btn btn-success btn-sm" data-ack="${alertId}">OK</button>
        <button class="btn btn-secondary btn-sm" data-dismiss="${alertId}">✕</button>
      </div>`;
    container.appendChild(popup);

    this._activePopups[alertId] = true;
    let remaining = this._alertDuration;
    const timer = setInterval(() => {
      remaining--;
      const bar = Utils.$(`#timer-bar-${alertId}`);
      if (bar) bar.style.width = (remaining / this._alertDuration * 100) + '%';
      if (remaining <= 0) {
        clearInterval(timer);
        this.handleAlertMiss(alertId, popup);
      }
    }, 1000);

    popup.querySelector(`[data-ack="${alertId}"]`).addEventListener('click', async () => {
      clearInterval(timer);
      await Events.ackAlert(alertId);
      const a = this.alerts.find(x => x.id === alertId);
      if (a) { a.status = 'acknowledged'; a.acknowledged_at = Utils.now(); }
      popup.remove();
      delete this._activePopups[alertId];
      this.renderNotifications();
    });

    popup.querySelector(`[data-dismiss="${alertId}"]`).addEventListener('click', () => {
      clearInterval(timer);
      popup.remove();
      delete this._activePopups[alertId];
    });
  },

  async handleAlertMiss(alertId, popup) {
    await Events.missAlert(alertId);
    const a = this.alerts.find(x => x.id === alertId);
    if (a) a.status = 'missed';
    if (popup) popup.remove();
    delete this._activePopups[alertId];
    this.renderNotifications();
  },

  /* ── Data feed ── */
  startDataFeed() {
    const _lastAlertTime = {};
    Hardware.startSimulation(this.eventId, this.zones, async (zoneId, count) => {
      this.crowdState[zoneId] = count;
      const z = this.zones.find(zz => zz.id === zoneId);
      if (!z) return;

      const pct = Utils.densityPct(count, z.max_capacity);
      const timeLabel = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      if (!this._readings[zoneId]) this._readings[zoneId] = [];
      this._readings[zoneId].push({ time: timeLabel, count, pct });
      if (this._readings[zoneId].length > 200) this._readings[zoneId].shift();

      await Events.addReading(this.eventId, zoneId, count);

      // Overcrowding alert (max 1 per zone per 60s)
      if (pct >= 90) {
        const now = Date.now();
        if (!_lastAlertTime[zoneId] || now - _lastAlertTime[zoneId] > 60000) {
          _lastAlertTime[zoneId] = now;
          this.triggerAlert(z);
        }
      }

      this.updateMap();
      this.updateTable();
      this.pushChartData(timeLabel);

      // Update detail sidebar
      if (this._detailZoneId === zoneId) {
        const ce = Utils.$('#zd-count');
        if (ce) ce.textContent = count;
        const pe = Utils.$('#zd-pct');
        if (pe) pe.textContent = pct + '%';
        if (this._detailChart) {
          this._detailChart.data.labels.push(timeLabel);
          this._detailChart.data.datasets[0].data.push(pct);
          if (this._detailChart.data.labels.length > 60) { this._detailChart.data.labels.shift(); this._detailChart.data.datasets[0].data.shift(); }
          this._detailChart.update('none');
        }
      }
    });
  },

  /* ── Elapsed timer ── */
  startTimer() {
    const startTime = this.event.created_at || this.event.date + 'T' + this.event.start_time;
    this._elapsed = setInterval(() => {
      const el = Utils.$('#dash-elapsed');
      if (el) el.textContent = Utils.elapsed(startTime);
    }, 1000);
  },

  stopTimer() {
    if (this._elapsed) { clearInterval(this._elapsed); this._elapsed = null; }
  },

  cleanup() {
    this.stopTimer();
    Hardware.stopSimulation();
    if (this.densityChart) { this.densityChart.destroy(); this.densityChart = null; }
    if (this._detailChart) { this._detailChart.destroy(); this._detailChart = null; }
    this._activePopups = {};
    Utils.$('#alert-popup-container').innerHTML = '';
  }
};
