/* ── CC.Inc Venue & Zone Canvas ── */
const Venue = {
  canvas: null, ctx: null,
  zones: [],
  selectedZone: null,
  unit: 'metres',
  venueW: 100, venueH: 60,
  safetyStandard: 'international',
  customDensity: 0.65,
  _nextZoneIdx: 0,
  _eventData: {},

  /* ── Wizard Renderer ── */
  renderWizard(step = 1) {
    const steps = ['Venue Layout', 'Create Zones', 'Capacity Review', 'Event Details'];
    return `
    <div class="wizard-wrap fade-in">
      <div class="wizard-header">
        <div class="flex items-center gap-16">
          <div class="home-logo">cc<span>.inc</span></div>
          <span class="text-muted">New Event Setup</span>
        </div>
        <div class="wizard-steps">
          ${steps.map((s, i) => `<div class="wizard-step ${i + 1 === step ? 'active' : (i + 1 < step ? 'done' : '')}">${i + 1}. ${s}</div>`).join('')}
        </div>
      </div>
      <div class="wizard-body" id="wizard-body"></div>
      <div class="wizard-footer">
        <button class="btn btn-secondary" id="wiz-back" ${step === 1 ? 'disabled' : ''}>← Back</button>
        <button class="btn btn-primary" id="wiz-next">${step === 4 ? '🚀 Start Event' : 'Continue →'}</button>
      </div>
    </div>`;
  },

  renderStep1() {
    return `
    <div style="max-width:900px;margin:0 auto" class="fade-in">
      <h2 class="mb-8">Define Venue Layout</h2>
      <p class="text-muted mb-16">Set the dimensions of your venue. Zones will be created in the next step.</p>
      <div class="input-row mb-16">
        <div class="form-group">
          <label>Venue Width</label>
          <div class="flex gap-8 items-center">
            <input class="input" id="venue-w" type="number" min="1" value="${this.venueW}" step="0.1">
            <span class="text-muted text-sm" id="unit-label-w">${this.unit}</span>
          </div>
        </div>
        <div class="form-group">
          <label>Venue Height / Length</label>
          <div class="flex gap-8 items-center">
            <input class="input" id="venue-h" type="number" min="1" value="${this.venueH}" step="0.1">
            <span class="text-muted text-sm" id="unit-label-h">${this.unit}</span>
          </div>
        </div>
        <div class="form-group">
          <label>Units</label>
          <select class="select" id="venue-unit">
            <option value="metres" ${this.unit === 'metres' ? 'selected' : ''}>Metres</option>
            <option value="feet" ${this.unit === 'feet' ? 'selected' : ''}>Feet</option>
          </select>
        </div>
      </div>
      <div class="card mb-16" style="padding:16px">
        <div class="flex items-center justify-between">
          <span class="text-muted">Total Venue Area:</span>
          <span class="text-cyan" style="font-size:20px;font-weight:700" id="venue-area">${(this.venueW * this.venueH).toFixed(1)} ${this.unit === 'metres' ? 'm²' : 'ft²'}</span>
        </div>
      </div>
      <div class="canvas-container" style="height:400px">
        <canvas id="venue-canvas"></canvas>
      </div>
      <p class="text-muted text-sm mt-8">This preview shows the proportional shape of your venue.</p>
    </div>`;
  },

  renderStep2() {
    return `
    <div style="display:flex;gap:24px;height:100%" class="fade-in">
      <div style="flex:1;min-width:0">
        <h2 class="mb-8">Create Zones</h2>
        <p class="text-muted mb-16">Define zones within your venue. Click "Add Zone" to create a new zone.</p>
        <div class="canvas-container" style="height:420px;margin-bottom:16px">
          <canvas id="zone-canvas"></canvas>
        </div>
      </div>
      <div style="width:340px;flex-shrink:0">
        <div class="flex items-center justify-between mb-16">
          <h3>Zones</h3>
          <button class="btn btn-primary btn-sm" id="add-zone-btn">+ Add Zone</button>
        </div>
        <div id="zone-list" style="max-height:480px;overflow:auto"></div>
        <div id="zone-editor" class="hidden mt-16"></div>
      </div>
    </div>`;
  },

  renderStep3() {
    const zones = this.zones;
    const total = zones.reduce((s, z) => s + (z.max_capacity || 0), 0);
    const stdOptions = `
      <option value="international" ${this.safetyStandard === 'international' ? 'selected' : ''}>International Default</option>
      <option value="ukgreen" ${this.safetyStandard === 'ukgreen' ? 'selected' : ''}>UK Green Guide</option>
      <option value="custom" ${this.safetyStandard === 'custom' ? 'selected' : ''}>Custom</option>`;

    return `
    <div style="max-width:900px;margin:0 auto" class="fade-in">
      <h2 class="mb-8">Zone Capacity Review</h2>
      <p class="text-muted mb-16">Review and override capacities as needed.</p>

      <div class="flex gap-16 mb-16">
        <div class="form-group" style="width:200px">
          <label>Safety Standard</label>
          <select class="select" id="safety-std">${stdOptions}</select>
        </div>
        <div class="form-group ${this.safetyStandard === 'custom' ? '' : 'hidden'}" id="custom-density-group" style="width:200px">
          <label>m² per person</label>
          <input class="input" id="custom-density" type="number" step="0.01" min="0.1" value="${this.customDensity}">
        </div>
        <div style="flex:1"></div>
        <div class="capacity-summary" style="min-width:220px;text-align:center;padding:16px">
          <div class="text-muted text-sm">Total Venue Capacity</div>
          <div class="capacity-total" id="total-cap">${total}</div>
          <div class="text-muted text-xs">persons</div>
        </div>
      </div>

      <div class="table-wrap mb-16">
        <table>
          <thead><tr>
            <th>Zone</th><th>Dimensions</th><th>Type</th><th>Area</th><th>Auto Capacity</th><th>Final Capacity</th>
          </tr></thead>
          <tbody id="cap-table-body">
            ${zones.map(z => {
              const area = (z.width * z.height).toFixed(1);
              const unitLabel = this.unit === 'metres' ? 'm²' : 'ft²';
              return `<tr>
                <td><span class="zone-color-dot" style="background:${z.color}"></span> ${Utils.esc(z.name)}</td>
                <td>${z.width} × ${z.height} ${this.unit}</td>
                <td>${z.type}</td>
                <td>${area} ${unitLabel}</td>
                <td>${z.auto_capacity}</td>
                <td><input class="input" type="number" min="1" value="${z.max_capacity}" data-zone-id="${z._tempId}" style="width:100px"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <details class="safety-ref">
        <summary>📋 Safety Standard Reference</summary>
        <div class="ref-content">
          <p><strong>International Default:</strong> Standing = 1 person / 0.5 m² · Seated = 1 person / 0.8 m² · Mixed = 1 person / 0.65 m²</p>
          <p class="mt-8"><strong>UK Green Guide:</strong> Standing = 1 person / 0.5 m² · Seated = 1 person / 1.0 m² · Mixed = 1 person / 0.75 m²</p>
          <p class="mt-8 text-muted">These defaults are based on international crowd safety guidelines. Override values if your local fire or safety code requires different limits.</p>
        </div>
      </details>
    </div>`;
  },

  renderStep4() {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().slice(0, 5);
    return `
    <div style="max-width:600px;margin:0 auto" class="fade-in">
      <h2 class="mb-8">Event Details</h2>
      <p class="text-muted mb-24">Enter the event information. These fields cannot be changed once the event starts.</p>
      <div class="form-group">
        <label for="ev-name">Event Name</label>
        <input class="input" id="ev-name" type="text" placeholder="e.g. Summer Music Festival 2026" value="${this._eventData.name || ''}" required>
      </div>
      <div class="input-row">
        <div class="form-group">
          <label for="ev-date">Event Date</label>
          <input class="input" id="ev-date" type="date" value="${this._eventData.date || today}">
        </div>
        <div class="form-group">
          <label for="ev-time">Start Time</label>
          <input class="input" id="ev-time" type="time" value="${this._eventData.start_time || now}">
        </div>
      </div>
      <div class="divider"></div>
      <h3 class="mb-8">Hardware Connection</h3>
      <div id="hw-wizard-inline">
        ${Hardware.renderInline()}
      </div>
    </div>`;
  },

  /* ── Zone list rendering ── */
  renderZoneList() {
    const el = Utils.$('#zone-list');
    if (!el) return;
    if (!this.zones.length) {
      el.innerHTML = '<div class="empty-state" style="padding:24px"><p class="text-muted">No zones created yet</p></div>';
      return;
    }
    el.innerHTML = this.zones.map(z => `
      <div class="zone-item ${this.selectedZone === z._tempId ? 'selected' : ''}" data-zone-tid="${z._tempId}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-8">
            <span class="zone-color-dot" style="background:${z.color}"></span>
            <strong>${Utils.esc(z.name)}</strong>
          </div>
          <button class="btn btn-icon btn-sm text-red" data-del-zone="${z._tempId}" title="Delete zone">🗑</button>
        </div>
        <div class="text-sm text-muted mt-8">${z.width} × ${z.height} ${this.unit} · ${z.type} · Cap: ${z.max_capacity}</div>
      </div>
    `).join('');

    // Bind clicks
    el.querySelectorAll('.zone-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-del-zone]')) return;
        this.selectedZone = item.dataset.zoneTid;
        this.renderZoneList();
        this.showZoneEditor(this.selectedZone);
        this.drawZoneCanvas();
      });
    });
    el.querySelectorAll('[data-del-zone]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.zones = this.zones.filter(z => z._tempId !== btn.dataset.delZone);
        if (this.selectedZone === btn.dataset.delZone) this.selectedZone = null;
        Utils.$('#zone-editor').classList.add('hidden');
        this.renderZoneList();
        this.drawZoneCanvas();
      });
    });
  },

  showZoneEditor(tid) {
    const z = this.zones.find(zz => zz._tempId === tid);
    if (!z) return;
    const ed = Utils.$('#zone-editor');
    ed.classList.remove('hidden');
    ed.innerHTML = `
      <div class="zone-panel">
        <h4 class="mb-8">Edit Zone</h4>
        <div class="form-group"><label>Name</label><input class="input" id="ze-name" value="${Utils.esc(z.name)}"></div>
        <div class="input-row">
          <div class="form-group"><label>Width</label><input class="input" id="ze-w" type="number" value="${z.width}" step="0.1" min="0.1"></div>
          <div class="form-group"><label>Height</label><input class="input" id="ze-h" type="number" value="${z.height}" step="0.1" min="0.1"></div>
        </div>
        <div class="form-group">
          <label>Zone Type</label>
          <select class="select" id="ze-type">
            <option value="standing" ${z.type==='standing'?'selected':''}>Standing</option>
            <option value="seated" ${z.type==='seated'?'selected':''}>Seated</option>
            <option value="mixed" ${z.type==='mixed'?'selected':''}>Mixed</option>
          </select>
        </div>
        <div class="flex items-center justify-between mb-8">
          <span class="text-sm text-muted">Auto Capacity:</span>
          <span class="text-cyan font-bold" id="ze-auto-cap">${z.auto_capacity}</span>
        </div>
        <div class="form-group"><label>Final Capacity (override)</label><input class="input" id="ze-cap" type="number" min="1" value="${z.max_capacity}"></div>
        <button class="btn btn-primary btn-sm w-full" id="ze-save">Save Changes</button>
      </div>`;

    const recalc = () => {
      const w = parseFloat(Utils.$('#ze-w').value) || 1;
      const h = parseFloat(Utils.$('#ze-h').value) || 1;
      const type = Utils.$('#ze-type').value;
      let area = w * h;
      if (this.unit === 'feet') area = Utils.sqmToSqft(area) / 10.7639;
      const autoCap = Utils.calcCapacity(area, type, this.safetyStandard, this.customDensity);
      Utils.$('#ze-auto-cap').textContent = autoCap;
    };

    Utils.$('#ze-w').addEventListener('input', recalc);
    Utils.$('#ze-h').addEventListener('input', recalc);
    Utils.$('#ze-type').addEventListener('change', recalc);

    Utils.$('#ze-save').addEventListener('click', () => {
      z.name = Utils.$('#ze-name').value || z.name;
      z.width = parseFloat(Utils.$('#ze-w').value) || z.width;
      z.height = parseFloat(Utils.$('#ze-h').value) || z.height;
      z.type = Utils.$('#ze-type').value;
      let area = z.width * z.height;
      if (this.unit === 'feet') area = area / 10.7639;
      z.auto_capacity = Utils.calcCapacity(area, z.type, this.safetyStandard, this.customDensity);
      z.max_capacity = parseInt(Utils.$('#ze-cap').value) || z.auto_capacity;
      this.renderZoneList();
      this.drawZoneCanvas();
    });
  },

  /* ── Canvas drawing ── */
  initVenueCanvas() {
    const c = Utils.$('#venue-canvas');
    if (!c) return;
    const container = c.parentElement;
    c.width = container.clientWidth;
    c.height = container.clientHeight;
    this.drawVenuePreview(c);

    Utils.$('#venue-w').addEventListener('input', () => { this.venueW = parseFloat(Utils.$('#venue-w').value) || 1; this.updateArea(); this.drawVenuePreview(c); });
    Utils.$('#venue-h').addEventListener('input', () => { this.venueH = parseFloat(Utils.$('#venue-h').value) || 1; this.updateArea(); this.drawVenuePreview(c); });
    Utils.$('#venue-unit').addEventListener('change', (e) => { this.unit = e.target.value; this.updateArea(); this.drawVenuePreview(c); });
  },

  updateArea() {
    const area = (this.venueW * this.venueH).toFixed(1);
    const u = this.unit === 'metres' ? 'm²' : 'ft²';
    Utils.$('#venue-area').textContent = `${area} ${u}`;
    const labels = Utils.$$('#unit-label-w, #unit-label-h');
    labels.forEach(l => l.textContent = this.unit);
  },

  drawVenuePreview(c) {
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#1e2230';
    ctx.lineWidth = 1;
    const gridSize = 30;
    for (let x = 0; x < W; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Venue rect
    const padding = 40;
    const ratio = this.venueW / this.venueH;
    let rw, rh;
    if (ratio > (W - 2 * padding) / (H - 2 * padding)) {
      rw = W - 2 * padding; rh = rw / ratio;
    } else {
      rh = H - 2 * padding; rw = rh * ratio;
    }
    const rx = (W - rw) / 2, ry = (H - rh) / 2;

    ctx.fillStyle = 'rgba(0,212,255,.05)';
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, 4);
    ctx.fill();
    ctx.stroke();

    // Dimensions
    ctx.fillStyle = '#c0c4cc';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.venueW} ${this.unit}`, rx + rw / 2, ry - 10);
    ctx.save();
    ctx.translate(rx - 14, ry + rh / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${this.venueH} ${this.unit}`, 0, 0);
    ctx.restore();
  },

  initZoneCanvas() {
    const c = Utils.$('#zone-canvas');
    if (!c) return;
    const container = c.parentElement;
    c.width = container.clientWidth;
    c.height = container.clientHeight;
    this.drawZoneCanvas();

    Utils.$('#add-zone-btn').addEventListener('click', () => this.addZone());
    this.renderZoneList();
  },

  addZone() {
    const idx = this._nextZoneIdx++;
    const cols = this.zones.length;
    const gridCols = Math.ceil(Math.sqrt(this.zones.length + 1));
    const zw = Math.round(this.venueW / gridCols * 10) / 10;
    const zh = Math.round(this.venueH / gridCols * 10) / 10;
    let area = zw * zh;
    if (this.unit === 'feet') area = area / 10.7639;
    const autoCap = Utils.calcCapacity(area, 'standing', this.safetyStandard, this.customDensity);

    const zone = {
      _tempId: Utils.uid(),
      name: `Zone ${String.fromCharCode(65 + this.zones.length)}`,
      width: zw, height: zh,
      type: 'standing',
      auto_capacity: autoCap,
      max_capacity: autoCap,
      color: Utils.getZoneColor(this.zones.length),
      _canvasPos: null
    };
    this.zones.push(zone);
    this.selectedZone = zone._tempId;
    this.renderZoneList();
    this.showZoneEditor(zone._tempId);
    this.drawZoneCanvas();
  },

  drawZoneCanvas() {
    const c = Utils.$('#zone-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#1e2230'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Venue outline
    const pad = 30;
    const ratio = this.venueW / this.venueH;
    let vw, vh;
    if (ratio > (W - 2*pad)/(H - 2*pad)) { vw = W - 2*pad; vh = vw/ratio; } else { vh = H - 2*pad; vw = vh*ratio; }
    const vx = (W-vw)/2, vy = (H-vh)/2;

    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.setLineDash([8,4]);
    ctx.strokeRect(vx, vy, vw, vh);
    ctx.setLineDash([]);

    // Draw zones in grid layout
    if (!this.zones.length) return;
    const count = this.zones.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const gap = 6;
    const cellW = (vw - gap * (cols + 1)) / cols;
    const cellH = (vh - gap * (rows + 1)) / rows;

    this.zones.forEach((z, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const zx = vx + gap + col * (cellW + gap);
      const zy = vy + gap + row * (cellH + gap);

      const isSelected = z._tempId === this.selectedZone;
      ctx.fillStyle = isSelected ? z.color + '30' : z.color + '18';
      ctx.strokeStyle = z.color;
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.beginPath(); ctx.roundRect(zx, zy, cellW, cellH, 6); ctx.fill(); ctx.stroke();

      // Label
      ctx.fillStyle = '#f0f2f5';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(z.name, zx + cellW/2, zy + cellH/2 - 6);
      ctx.font = '11px Inter, sans-serif';
      ctx.fillStyle = '#7a8194';
      ctx.fillText(`${z.width}×${z.height} · Cap: ${z.max_capacity}`, zx + cellW/2, zy + cellH/2 + 12);

      z._canvasPos = { x: zx, y: zy, w: cellW, h: cellH };
    });
  },

  /* ── Wizard binding ── */
  bindWizard(step) {
    if (step === 1) this.initVenueCanvas();
    if (step === 2) this.initZoneCanvas();
    if (step === 3) this.bindStep3();
    if (step === 4) this.bindStep4();
  },

  bindStep3() {
    const stdSel = Utils.$('#safety-std');
    const cdg = Utils.$('#custom-density-group');
    if (stdSel) {
      stdSel.addEventListener('change', () => {
        this.safetyStandard = stdSel.value;
        cdg.classList.toggle('hidden', this.safetyStandard !== 'custom');
        this.recalcAllCapacities();
      });
    }
    const cdInput = Utils.$('#custom-density');
    if (cdInput) {
      cdInput.addEventListener('input', () => {
        this.customDensity = parseFloat(cdInput.value) || 0.65;
        this.recalcAllCapacities();
      });
    }
    // Bind override inputs
    Utils.$$('#cap-table-body input').forEach(inp => {
      inp.addEventListener('change', () => {
        const tid = inp.dataset.zoneId;
        const z = this.zones.find(zz => zz._tempId === tid);
        if (z) z.max_capacity = parseInt(inp.value) || z.auto_capacity;
        this.updateTotalCap();
      });
    });
  },

  recalcAllCapacities() {
    this.zones.forEach(z => {
      let area = z.width * z.height;
      if (this.unit === 'feet') area = area / 10.7639;
      z.auto_capacity = Utils.calcCapacity(area, z.type, this.safetyStandard, this.customDensity);
      z.max_capacity = z.auto_capacity;
    });
    // Re-render step 3
    Utils.$('#wizard-body').innerHTML = this.renderStep3();
    this.bindStep3();
  },

  updateTotalCap() {
    const total = this.zones.reduce((s, z) => s + (z.max_capacity || 0), 0);
    const el = Utils.$('#total-cap');
    if (el) el.textContent = total;
  },

  bindStep4() {
    // Hardware wizard binding
    Hardware.bindInline();
  },

  /* ── Save & start event ── */
  async startEvent() {
    const name = Utils.$('#ev-name')?.value?.trim();
    const date = Utils.$('#ev-date')?.value;
    const time = Utils.$('#ev-time')?.value;
    if (!name) { alert('Please enter an event name'); return null; }
    if (!this.zones.length) { alert('Please create at least one zone'); return null; }

    const eventId = await Events.create({
      name, date, start_time: time,
      venue_width: this.venueW, venue_height: this.venueH,
      unit: this.unit, venue_polygon: '',
      safety_standard: this.safetyStandard, custom_density: this.customDensity
    });

    if (!eventId) { alert('Failed to create event'); return null; }

    // Save zones
    for (const z of this.zones) {
      await Events.createZone({
        event_id: eventId, name: z.name,
        width: z.width, height: z.height, type: z.type,
        auto_capacity: z.auto_capacity, max_capacity: z.max_capacity,
        canvas_polygon: JSON.stringify(z._canvasPos || {}), color: z.color
      });
    }

    // Save camera assignments
    if (Hardware.assignments) {
      for (const [camId, zoneIdx] of Object.entries(Hardware.assignments)) {
        const zone = this.zones[zoneIdx];
        if (zone) {
          const savedZones = await Events.getZones(eventId);
          const sz = savedZones[zoneIdx];
          if (sz) await Events.assignCamera(eventId, sz.id, camId, `Camera ${camId}`);
        }
      }
    }

    // Reset
    this.zones = [];
    this._nextZoneIdx = 0;
    this._eventData = {};
    this.selectedZone = null;

    return eventId;
  }
};
