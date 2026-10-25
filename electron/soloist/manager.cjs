'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createSoloistCaptureBridge } = require('./capture.cjs');

// electron/soloist/manager.cjs
// Opt-in Windows companion manager for a PERSONAL Folia+Soloist build.
// Never includes Spotify binaries and never logs the personal Soloist API key.
// Stores a local key only with Electron safeStorage (Windows DPAPI backend).
const KEY_FILE = 'soloist-api-key.enc';
const IPC_SAVE = 'folia-soloist-private-save-key';
const HOST = '127.0.0.1';
const PORT = 9090;

function portInUse({ connect = net.createConnection, timeoutMs = 800 } = {}) {
  return new Promise(resolve => {
    let settled = false;
    let socket;
    const finish = used => {
      if (settled) return;
      settled = true;
      if (socket) socket.destroy();
      resolve(used);
    };
    try {
      socket = connect({ host: HOST, port: PORT });
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.setTimeout(timeoutMs, () => finish(false));
    } catch { finish(false); }
  });
}

function createSoloistManager({
  app, BrowserWindow, ipcMain, safeStorage,
  files = fs, processEnv = process.env, platform = process.platform,
  startProcess = spawn, isPortBusy = portInUse,
  logger = console,
}) {
  let child = null;
  let prompt = null;
  let stopped = false;
  let starting = null;
  let sessionKey = null;
  const captureBridge = createSoloistCaptureBridge({ app, BrowserWindow, processEnv, logger });
  const keyPath = () => path.join(app.getPath('userData'), KEY_FILE);

  const encryptionAvailable = () => safeStorage.isEncryptionAvailable();
  function rememberKey(key) {
    sessionKey = key;
    if (!encryptionAvailable()) {
      logger.warn('[Soloist] OS encryption unavailable; key remains memory-only for this run');
      return;
    }
    const encrypted = safeStorage.encryptString(key);
    files.mkdirSync(path.dirname(keyPath()), { recursive: true });
    files.writeFileSync(keyPath(), encrypted, { mode: 0o600 });
    logger.info('[Soloist] API key saved using operating-system encryption');
  }
  function readKey() {
    if (typeof processEnv.SOLOIST_API_KEY === 'string' && processEnv.SOLOIST_API_KEY.trim()) {
      const key = processEnv.SOLOIST_API_KEY.trim();
      // Import an environment variable supplied for first-run setup; never write plaintext.
      if (!sessionKey) rememberKey(key);
      return key;
    }
    if (sessionKey) return sessionKey;
    try {
      if (!encryptionAvailable() || !files.existsSync(keyPath())) return null;
      const key = safeStorage.decryptString(files.readFileSync(keyPath()));
      return key.trim() || null;
    } catch (error) {
      logger.warn('[Soloist] Could not unlock saved API key; new setup is required');
      return null;
    }
  }
  function executable() {
    const envPath = processEnv.FOLIA_SOLOIST_EXE;
    const candidates = [
      typeof envPath === 'string' && path.isAbsolute(envPath) ? envPath : null,
      app.isPackaged ? path.join(process.resourcesPath, 'soloist', 'soloist.exe') : null,
      path.join(app.getAppPath(), 'build', 'soloist-local', 'soloist.exe'),
    ];
    return candidates.find(candidate => candidate && files.existsSync(candidate)) || null;
  }

  function openKeyPrompt() {
    if (stopped || prompt?.isDestroyed?.()) return;
    if (prompt) { prompt.focus(); return; }
    prompt = new BrowserWindow({
      width: 465, height: 330, title: 'Connect Spotify Soloist',
      resizable: false, maximizable: false, minimizable: false,
      autoHideMenuBar: true, backgroundColor: '#16181c', show: false,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, sandbox: true,
        preload: path.join(__dirname, 'keyPromptPreload.cjs'),
      },
    });
    const current = prompt;
    const handler = async (event, candidate) => {
      // The onboarding window, and only it, may submit a key to the main process.
      if (event.sender !== current.webContents || stopped) return { ok: false };
      if (typeof candidate !== 'string' || candidate.length < 15 || candidate.length > 1024 || /[\r\n\0]/.test(candidate)) {
        return { ok: false, message: 'Enter your Spotify Soloist API key.' };
      }
      try {
        rememberKey(candidate.trim());
        if (!current.isDestroyed()) current.close();
        void start();
        return { ok: true };
      } catch {
        return { ok: false, message: 'Could not save the key. Try again.' };
      }
    };
    ipcMain.handle(IPC_SAVE, handler);
    current.on('closed', () => {
      if (prompt === current) prompt = null;
      ipcMain.removeHandler(IPC_SAVE);
    });
    current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    current.loadFile(path.join(__dirname, 'keyPrompt.html')).then(() => {
      if (!current.isDestroyed()) current.show();
    }).catch(() => { if (!current.isDestroyed()) current.close(); });
  }

  async function start() {
    if (starting) return starting;
    starting = (async () => {
      if (stopped || platform !== 'win32') return 'not-enabled';
      if (child?.exitCode === null && child?.pid) return 'already-started';
      const binary = executable();
      if (!binary) {
        logger.warn('[Soloist] Missing soloist.exe. Run the build setup script to copy your personal download.');
        return 'missing-executable';
      }
      // If a Soloist is already running, use it; never kill someone else's daemon.
      if (await isPortBusy()) {
        // Key can still be imported to encrypted storage for a future run.
        if (processEnv.SOLOIST_API_KEY) readKey();
        logger.info('[Soloist] Local port 9090 is already in use; assuming an external Soloist session');
        captureBridge.start(0);
        return 'external';
      }
      const key = readKey();
      if (!key) { openKeyPrompt(); return 'key-needed'; }
      try {
        const launched = startProcess(binary, [
          '--device-name', 'Folia Audio', '--api-key', key,
          '--ws', `${HOST}:${PORT}`,
        ], { windowsHide: true, stdio: 'ignore', detached: false });
        child = launched;
        launched.once('spawn', () => captureBridge.start(launched.pid));
        launched.once('error', error => logger.warn('[Soloist] Failed to start local executable:', error.code || error.name));
        launched.once('exit', (code, signal) => {
          if (child === launched) { child = null; captureBridge.stop(); }
          if (!stopped) logger.warn(`[Soloist] Process exited (code=${code}, signal=${signal || 'none'}). A newer Soloist build may be needed.`);
        });
        logger.info('[Soloist] Started personal Spotify Soloist process; connect via Spotify app if prompted');
        return 'started';
      } catch (error) {
        logger.warn('[Soloist] Launch failed:', error.code || error.name);
        return 'launch-failed';
      }
    })().finally(() => { starting = null; });
    return starting;
  }

  function stop() {
    stopped = true;
    captureBridge.stop();
    if (prompt && !prompt.isDestroyed()) prompt.close();
    if (child && child.exitCode === null && !child.killed) {
      child.kill();
      logger.info('[Soloist] Stopped companion process owned by Folia');
    }
  }
  return { start, stop, readKey, executable };
}

module.exports = { createSoloistManager, portInUse, KEY_FILE };
