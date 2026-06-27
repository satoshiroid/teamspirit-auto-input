const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const automation = require('../automation');
const ocrNode = require('../ocr-node');

const USER_DATA = () => app.getPath('userData');
const CONFIG_PATH = () => path.join(USER_DATA(), 'config.json');
const PROFILE_DIR = () => path.join(USER_DATA(), 'chrome-profile');
const DEFAULT_CONFIG = path.join(__dirname, '..', 'default-config.json');

let win = null;
let browserCtx = null;
let browserPage = null;
let browserName = null;

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8')); }
  catch (e) { return JSON.parse(fs.readFileSync(DEFAULT_CONFIG, 'utf8')); }
}
function saveConfig(cfg) { fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2)); }

function createWindow() {
  win = new BrowserWindow({
    width: 980, height: 720,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('render-process-gone', (e, d) => crashLog('render-process-gone', JSON.stringify(d)));
  win.webContents.on('unresponsive', () => crashLog('unresponsive', 'window unresponsive'));
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    if (level >= 2) { try { fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), `[${new Date().toISOString()}] renderer-console: ${message} (${sourceId}:${line})\n`); } catch (_) {} }
  });
}
app.on('child-process-gone', (e, d) => crashLog('child-process-gone', JSON.stringify(d)));

const send = (ch, data) => {
  try {
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(ch, data);
    }
  } catch (e) {}
};

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', async () => { try { if (browserCtx) await browserCtx.close(); } catch (e) {} app.quit(); });

ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:save', (e, cfg) => { saveConfig(cfg); return true; });
ipcMain.handle('config:default', () => JSON.parse(fs.readFileSync(DEFAULT_CONFIG, 'utf8')));

ipcMain.handle('browser:launch', async () => {
  if (!browserCtx) {
    const cfg = loadConfig();
    const channels = cfg.browserChannel ? [cfg.browserChannel] : undefined; // 既定はEdge優先→Chrome
    const r = await automation.launchBrowser(USER_DATA(), { channels });
    browserCtx = r.context; browserPage = r.page; browserName = r.browserName;
  }
  return { loggedIn: await automation.isLoggedIn(browserPage), browserName };
});
ipcMain.handle('browser:status', async () => {
  if (!browserPage) return { launched: false, loggedIn: false, browserName: null };
  return { launched: true, loggedIn: await automation.isLoggedIn(browserPage), browserName };
});

ipcMain.handle('settings:fetch', async () => {
  if (!browserPage) throw new Error('先にツールを起動してください');
  if (!(await automation.isLoggedIn(browserPage))) throw new Error('TeamSpiritにログインしてから取得してください');
  const cfg = loadConfig();
  return await automation.readCurrentSettings(browserPage, cfg);
});

ipcMain.handle('ocr:pick-image', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('ocr:run', async (e, imagePath) => {
  try {
    const tessdata = app.isPackaged
      ? path.join(process.resourcesPath, 'ocr', 'tessdata')
      : path.join(__dirname, '..', 'ocr', 'tessdata');
    const opts = {
      onProgress: m => send('ocr:progress', m),
      cachePath: app.getPath('userData'),
    };
    if (fs.existsSync(tessdata)) { opts.langPath = tessdata; opts.gzip = false; }
    return await ocrNode.ocrImage(imagePath, opts);
  } catch (err) {
    crashLog('ocr:run', err && err.stack ? err.stack : err);
    return { days: [], engine: 'tesseract.js', error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('run:start', async (e, days) => {
  if (!browserPage) throw new Error('先にツールを起動してください');
  if (!(await automation.isLoggedIn(browserPage))) throw new Error('TeamSpiritにログインしてから実行してください');
  if (!Array.isArray(days) || days.length === 0) throw new Error('入力対象の日がありません');
  const cfg = loadConfig();
  const log = msg => send('run:log', msg);
  try {
    return await automation.processDays(browserPage, days, cfg, log);
  } catch (err) {
    crashLog('run:start', err && err.stack ? err.stack : err);
    log('致命的エラー: ' + (err && err.message ? err.message : err));
    throw err;
  }
});
