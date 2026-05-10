const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let db;

// ── Database Setup ──────────────────────────────────────────────────────────
function initDatabase() {
  const Database = require('better-sqlite3');
  const dataDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  
  db = new Database(path.join(dataDir, 'ccinc.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      venue_width REAL,
      venue_height REAL,
      unit TEXT DEFAULT 'metres',
      venue_polygon TEXT,
      venue_image TEXT,
      safety_standard TEXT DEFAULT 'international',
      custom_density REAL,
      created_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      width REAL,
      height REAL,
      type TEXT DEFAULT 'standing',
      auto_capacity INTEGER,
      max_capacity INTEGER,
      canvas_polygon TEXT,
      color TEXT DEFAULT '#00d4ff',
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS camera_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      zone_id INTEGER NOT NULL,
      camera_id TEXT NOT NULL,
      camera_name TEXT,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crowd_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      zone_id INTEGER NOT NULL,
      count INTEGER NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      zone_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      acknowledged_at TEXT,
      dismissed_at TEXT,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
    );
  `);

  // Seed default admin if none exists
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get();
  if (adminCount.c === 0) {
    // Default password: admin123 (SHA-256 hash)
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update('admin123').digest('hex');
    db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'superadmin');
  }
}

// ── IPC Handlers ────────────────────────────────────────────────────────────
function setupIPC() {
  // Database query
  ipcMain.handle('db:run', (_, sql, params) => {
    try {
      const stmt = db.prepare(sql);
      return { success: true, result: stmt.run(...(params || [])) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:get', (_, sql, params) => {
    try {
      const stmt = db.prepare(sql);
      return { success: true, result: stmt.get(...(params || [])) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:all', (_, sql, params) => {
    try {
      const stmt = db.prepare(sql);
      return { success: true, result: stmt.all(...(params || [])) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // File dialog
  ipcMain.handle('dialog:openFile', async (_, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    return { path: filePath, data: data.toString('base64'), name: path.basename(filePath) };
  });

  // Export handlers
  ipcMain.handle('export:savePDF', async (_, buffer, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'report.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });
    if (!result.canceled) {
      fs.writeFileSync(result.filePath, Buffer.from(buffer));
      return result.filePath;
    }
    return null;
  });

  ipcMain.handle('export:saveCSV', async (_, content, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'data.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });
    if (!result.canceled) {
      fs.writeFileSync(result.filePath, content);
      return result.filePath;
    }
    return null;
  });

  ipcMain.handle('export:archive', async (_, eventId) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `ccinc_event_${eventId}_backup.zip`,
      filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
    });
    if (result.canceled) return null;

    const archiver = require('archiver');
    const output = fs.createWriteStream(result.filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);

    // Get all event data
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    const zones = db.prepare('SELECT * FROM zones WHERE event_id = ?').all(eventId);
    const readings = db.prepare('SELECT * FROM crowd_readings WHERE event_id = ?').all(eventId);
    const alertsData = db.prepare('SELECT * FROM alerts WHERE event_id = ?').all(eventId);
    const cameras = db.prepare('SELECT * FROM camera_assignments WHERE event_id = ?').all(eventId);

    archive.append(JSON.stringify({ event, zones, readings, alerts: alertsData, cameras }, null, 2), { name: 'event_data.json' });
    
    await archive.finalize();
    return result.filePath;
  });

  // USB / Serial port scanning (with fallback to simulation)
  ipcMain.handle('usb:scan', async () => {
    try {
      const { SerialPort } = require('serialport');
      const ports = await SerialPort.list();
      return { success: true, ports };
    } catch (e) {
      return { success: false, error: e.message, ports: [] };
    }
  });

  // App path
  ipcMain.handle('app:getPath', (_, name) => {
    return app.getPath(name);
  });
}

// ── Window Creation ─────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'CC.Inc — Crowd Flow Management',
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    backgroundColor: '#0a0c10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  initDatabase();
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
