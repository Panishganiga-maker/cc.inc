# CC.Inc — Crowd Flow Management Software
## Implementation Plan

A local-first, desktop-optimised admin web application for real-time crowd flow management at events. Built as a single HTML/CSS/JS application using **Electron** (for USB/serial hardware access and native desktop features) with vanilla JS, Chart.js for graphs, and a local SQLite database via `better-sqlite3` for persistence.

---

## Architecture Decision

> [!IMPORTANT]
> **Technology Stack: Electron + HTML/CSS/JS**
>
> The USB hardware requirement is the deciding factor. A pure browser app cannot access USB/serial ports without WebUSB (which has limited OS support). Electron gives us:
> - Native USB/serial port access via `serialport` npm package
> - Local SQLite database (no cloud dependency)
> - PDF export via `puppeteer` or `electron-to-pdf`
> - Full file-system access for data export/backup
> - Runs as a desktop application on Windows/Mac/Linux

**Alternative considered:** Pure browser app with WebUSB — rejected because it requires Chrome, has hardware detection limitations, and can't easily write local databases.

---

## Open Questions

> [!IMPORTANT]
> **Hardware Protocol**: What protocol does the cc.inc junction device use over USB? Options:
> - Serial/UART communication (most common for embedded devices)
> - HID (Human Interface Device)
> - Bulk USB transfer with custom protocol
>
> **Assumed for now**: The device sends JSON frames over a virtual COM/serial port. The software will read these frames and parse crowd count data per camera ID. This can be swapped out once the real protocol is known.

> [!NOTE]
> Since we cannot actually connect to real hardware during development, the live dashboard will include a **hardware simulation mode** that generates realistic crowd count data — making the full UI testable without physical hardware.

---

## Proposed Changes (File Structure)

```
d:\cc inc\
├── package.json
├── electron-main.js          ← Electron main process (USB, database, file I/O)
├── preload.js                ← IPC bridge between main and renderer
├── index.html                ← App shell
├── src/
│   ├── css/
│   │   └── styles.css        ← Full design system (dark mode, tokens, components)
│   ├── js/
│   │   ├── app.js            ← Router / view manager
│   │   ├── auth.js           ← Login / session management
│   │   ├── events.js         ← Event CRUD and state
│   │   ├── venue.js          ← Canvas drawing, zone management
│   │   ├── hardware.js       ← USB device pairing + simulation
│   │   ├── dashboard.js      ← Live dashboard, alerts, density graphs
│   │   ├── analytics.js      ← Post-event analytics + PDF/CSV export
│   │   ├── db.js             ← SQLite wrapper (via IPC)
│   │   └── utils.js          ← Shared utilities
│   └── assets/
│       └── logo.svg
├── data/                     ← Local SQLite DB lives here (auto-created)
└── exports/                  ← PDF/CSV exports written here
```

---

## Proposed Changes — Detailed

### 1. Project Bootstrap & Electron Shell

#### [NEW] `package.json`
- Electron ^28, better-sqlite3, serialport, chart.js, jspdf, papaparse
- Scripts: `start` (electron .), `build` (electron-builder)

#### [NEW] `electron-main.js`
- Creates BrowserWindow
- Handles IPC channels: `db:query`, `usb:scan`, `usb:read`, `export:pdf`, `export:csv`, `export:archive`
- Opens serial port, emits `hardware:data` events to renderer

#### [NEW] `preload.js`
- Exposes safe IPC API to renderer via `contextBridge`

---

### 2. Database Schema

#### Tables (created in `electron-main.js` on startup):
- `admins(id, username, password_hash, role)`
- `sessions(id, admin_id, created_at, expires_at)`
- `events(id, name, date, start_time, status, venue_width, venue_height, unit)`
- `zones(id, event_id, name, width, height, type, max_capacity, canvas_polygon)`
- `camera_assignments(id, event_id, zone_id, camera_id, camera_name)`
- `crowd_readings(id, event_id, zone_id, camera_id, count, timestamp)`
- `alerts(id, event_id, zone_id, message, sent_at, acknowledged_at, dismissed_at, status)`

---

### 3. Design System (`styles.css`)

Full dark-mode design system:
- CSS custom properties (tokens): colours, spacing, typography, radius, shadow
- Color palette: `--bg-0` (#0a0c10) → `--bg-3` (#1e2230), accent `--cyan` (#00d4ff), `--amber` (#f59e0b), `--red` (#ef4444), `--green` (#22c55e)
- Typography: `Inter` from Google Fonts
- Component classes: `.btn`, `.card`, `.badge`, `.input`, `.table`, `.sidebar`, `.modal`
- Zone colour states: `.zone-green`, `.zone-amber`, `.zone-red`
- Canvas overlay styles
- Notification panel styles
- Chart container styles

---

### 4. View / Screen Breakdown

#### [A] Login Screen (`auth.js`)
- Username + password form
- SHA-256 password hashing (via Web Crypto API)
- Default admin seeded on first run: `admin / admin123` (prompted to change)
- Session token stored in `localStorage`, validated against DB on each view load

#### [B] Home Screen (`app.js`)
- "Start New Event" card → launches New Event Setup Flow
- "Continue Event" card → launches event list
- Event list: sorted by date DESC, status badge (Active = pulsing green, Ended = grey)
- Resume active → go to Live Dashboard
- Open ended → go to Post-Event Analytics

#### [C] New Event Setup — 4-Step Wizard (`venue.js`, `events.js`)

**Step 1 — Venue Canvas:**
- HTML5 `<canvas>` drawing tool
- Draw mode: freehand polygon for venue boundary
- Upload mode: drop a floor plan image as background, then trace boundary
- Unit toggle: metres ↔ feet (converts all values)
- Dimension inputs: length × width → auto-calculate area
- "Clear & Redraw" button

**Step 2 — Zone Creation:**
- On canvas: draw polygon zones over venue boundary
- Zone properties panel (right sidebar):
  - Zone name input
  - Dimensions (auto-derived from polygon OR manual input)
  - Zone type selector: Standing / Seated / Mixed
  - Auto-calculated max capacity (shown instantly)
  - Editable override field
- Delete zone button per zone
- "Add Zone" button

**Step 3 — Zone Capacity Panel:**
- Summary table: Zone | Dimensions | Type | Auto Capacity | Final Capacity
- Total venue capacity (sum)
- Collapsible safety standards reference
- Safety standard selector: International / UK Green Guide / Custom (m² per person input)
- Recalculate button (applies new standard to all zones)

**Step 4 — Event Parameters + Hardware Pairing:**
- Event name, date, start time inputs (locked after start)
- Hardware pairing wizard (inline or modal):
  1. "Connect junction device via USB" prompt with animation
  2. Auto-scan → show device name + serial number
  3. Camera mapping: thumbnails → drag onto zone slots
  4. Confirm pairing summary
- "Start Event" button → saves everything, opens Live Dashboard

#### [D] Live Dashboard (`dashboard.js`)

**Left Panel (40%) — Venue Map:**
- Canvas renders all zones with colour fill (green/amber/red)
- Each zone overlay: name, count/max, % fill bar
- Click zone → open zone detail sidebar
- Real-time updates every 1–5 seconds (configurable)

**Right Panel (60%) — Alerts + Graphs:**

*Notification System:*
- Pop-up alert cards (slide in from top-right)
- Auto-dismiss timer (configurable, default 30s)
- OK (green, acknowledged) / × (dismissed without action)
- Missed → notification log panel (red, timestamped)
- Acknowledged → notification log panel (green, timestamped)
- Log is permanent and scrollable; no deletions

*Density Graph (live):*
- Chart.js line chart — density % vs. time
- One coloured line per zone
- Auto-scrolls right as time progresses
- Hover tooltip: zone name, timestamp, count, %

*Event Data Table (live):*
- Zone | Current Count | Max Count | Density % | Time | Date
- Auto-sorts by density DESC
- Read-only

**Top Bar:**
- Event name, elapsed time, "End Event" button
- Hardware connection status indicator
- Disconnected: persistent red banner with reconnect button

#### [E] Post-Event Analytics (`analytics.js`)

All charts rendered with Chart.js, then captured for PDF:

1. Event summary card
2. Overall crowd timeline graph (start/end markers)
3. Highest/Lowest crowd zone cards
4. Per-zone breakdown table
5. Density % graph per zone
6. Raw count graph per zone
7. Notification/alert log table
8. Zone capacity reference table

**Export:**
- PDF: `jsPDF` + `html2canvas` — renders each section, compiles into PDF
- CSV: `papaparse` — one CSV per data table
- Archive: ZIP of all event data (JSON dump + CSVs + PDF)

---

## Phased Execution Plan

| Phase | What Gets Built | Est. Complexity |
|-------|----------------|-----------------|
| 1 | Project setup, Electron shell, DB schema, design system | Medium |
| 2 | Auth + Home screen + Event list | Low |
| 3 | New Event Setup wizard (Steps 1–4), venue canvas | High |
| 4 | Hardware wizard + simulation mode | Medium |
| 5 | Live Dashboard (map, alerts, graphs, table) | High |
| 6 | Post-event analytics + PDF/CSV export | High |
| 7 | Polish, responsive tweaks, data backup/archive | Low |

---

## Verification Plan

### Automated (Dev)
- Launch with `npm start` (Electron)
- Simulate hardware via built-in simulation mode (random walk crowd counts)
- Create a test event end-to-end: login → new event → zones → start → dashboard → end → analytics → export PDF

### Manual
- Verify canvas drawing on all steps
- Verify alert system timing and log persistence
- Verify PDF renders all sections correctly
- Verify SQLite data persists across app restarts
