/* ── CC.Inc Hardware Module ── */
const Hardware = {
  connected: false,
  simMode: true,
  deviceName: 'CC.Inc Junction Hub',
  deviceSerial: 'CCINC-2026-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
  cameras: [],
  assignments: {},
  _simInterval: null,
  _listeners: [],

  init() {
    // Generate simulated cameras
    this.cameras = [];
    for (let i = 1; i <= 6; i++) {
      this.cameras.push({ id: 'CAM-' + String(i).padStart(2, '0'), name: `Camera ${i}`, thumbnail: null });
    }
  },

  renderInline() {
    return `
      <div class="hw-wizard">
        <div id="hw-step-content">
          ${this.connected ? this._renderConnected() : this._renderConnect()}
        </div>
      </div>`;
  },

  _renderConnect() {
    return `
      <div class="card text-center" style="padding:32px">
        <div style="font-size:48px;margin-bottom:16px">🔌</div>
        <h3 class="mb-8">Connect Junction Device</h3>
        <p class="text-muted mb-16">Connect your cc.inc junction device via USB, or use simulation mode for testing.</p>
        <div class="flex gap-12 justify-center">
          <button class="btn btn-primary" id="hw-scan-btn">Scan for Device</button>
          <button class="btn btn-secondary" id="hw-sim-btn">Use Simulation Mode</button>
        </div>
        <div id="hw-scan-result" class="mt-16"></div>
      </div>`;
  },

  _renderConnected() {
    return `
      <div class="hw-device mb-16">
        <div class="hw-device-icon">📡</div>
        <div style="flex:1">
          <div style="font-weight:600">${Utils.esc(this.deviceName)}</div>
          <div class="text-sm text-muted">S/N: ${this.deviceSerial}</div>
        </div>
        <span class="badge badge-active badge-dot">${this.simMode ? 'Simulation' : 'Connected'}</span>
      </div>
      <h4 class="mb-8">Camera → Zone Mapping</h4>
      <p class="text-muted text-sm mb-16">Assign each camera to a zone. ${Venue.zones.length === 0 ? '<span class="text-amber">Create zones in previous steps first.</span>' : ''}</p>
      <div id="hw-camera-map">
        ${this.cameras.map(cam => {
          const assignedIdx = this.assignments[cam.id];
          const assignedZone = assignedIdx !== undefined ? Venue.zones[assignedIdx] : null;
          return `
          <div class="hw-device mb-8" style="padding:12px">
            <div style="font-size:20px">📷</div>
            <div style="flex:1">
              <div style="font-weight:500">${cam.name}</div>
              <div class="text-xs text-muted">${cam.id}</div>
            </div>
            <select class="select" style="width:160px" data-cam-id="${cam.id}">
              <option value="">— Unassigned —</option>
              ${Venue.zones.map((z, i) => `<option value="${i}" ${assignedIdx === i ? 'selected' : ''}>${Utils.esc(z.name)}</option>`).join('')}
            </select>
          </div>`;
        }).join('')}
      </div>`;
  },

  bindInline() {
    const scanBtn = Utils.$('#hw-scan-btn');
    const simBtn = Utils.$('#hw-sim-btn');

    if (scanBtn) {
      scanBtn.addEventListener('click', async () => {
        const resultEl = Utils.$('#hw-scan-result');
        resultEl.innerHTML = '<div class="spinner"></div><p class="text-muted text-sm mt-8">Scanning USB ports...</p>';
        
        // Try real scan if in Electron
        if (window.api) {
          const res = await window.api.scanUSB();
          if (res.success && res.ports.length > 0) {
            this.connected = true;
            this.simMode = false;
            this.deviceName = res.ports[0].manufacturer || 'CC.Inc Junction Hub';
            this.deviceSerial = res.ports[0].serialNumber || this.deviceSerial;
            Utils.$('#hw-step-content').innerHTML = this._renderConnected();
            this._bindCameraSelects();
            return;
          }
        }
        
        setTimeout(() => {
          resultEl.innerHTML = `
            <div class="card" style="padding:16px;border-color:var(--amber)">
              <p class="text-amber text-sm">No junction device detected. Connect via USB or use simulation mode.</p>
            </div>`;
        }, 1500);
      });
    }

    if (simBtn) {
      simBtn.addEventListener('click', () => {
        this.connected = true;
        this.simMode = true;
        this.init();
        Utils.$('#hw-step-content').innerHTML = this._renderConnected();
        this._bindCameraSelects();
      });
    }

    this._bindCameraSelects();
  },

  _bindCameraSelects() {
    Utils.$$('[data-cam-id]').forEach(sel => {
      sel.addEventListener('change', () => {
        const camId = sel.dataset.camId;
        const val = sel.value;
        if (val === '') { delete this.assignments[camId]; }
        else { this.assignments[camId] = parseInt(val); }
      });
    });
  },

  /* ── Simulation Engine ── */
  startSimulation(eventId, zones, onData) {
    this.stopSimulation();
    const state = {};
    zones.forEach(z => {
      state[z.id] = Math.floor(z.max_capacity * (0.1 + Math.random() * 0.3));
    });

    this._simInterval = setInterval(() => {
      zones.forEach(z => {
        // Random walk with drift toward 50-70% capacity
        const target = z.max_capacity * (0.4 + Math.random() * 0.3);
        const drift = (target - state[z.id]) * 0.05;
        const noise = (Math.random() - 0.5) * z.max_capacity * 0.08;
        state[z.id] = Math.max(0, Math.min(z.max_capacity * 1.15, Math.round(state[z.id] + drift + noise)));
        onData(z.id, state[z.id]);
      });
    }, 3000);
  },

  stopSimulation() {
    if (this._simInterval) { clearInterval(this._simInterval); this._simInterval = null; }
  },

  onData(callback) {
    this._listeners.push(callback);
  },

  setDisconnected() {
    this.connected = false;
    const banner = Utils.$('#hw-banner');
    if (banner) banner.classList.remove('hidden');
  },

  setConnected() {
    this.connected = true;
    const banner = Utils.$('#hw-banner');
    if (banner) banner.classList.add('hidden');
  }
};

Hardware.init();
