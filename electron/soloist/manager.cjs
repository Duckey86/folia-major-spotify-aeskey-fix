'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createSoloistCaptureBridge } = require('./capture.cjs');
const { createSoloistConnection } = require('./connection.cjs');
const { registerSoloistSetupIpc } = require('../spotify/soloistSetupIpc.cjs');

// electron/soloist/manager.cjs
// Opt-in Windows companion manager for a PERSONAL Folia+Soloist build.
// Never includes Spotify binaries and never logs the personal Soloist API key.
// Stores a local key only with Electron safeStorage (Windows DPAPI backend).
const KEY_FILE = 'soloist-api-key.enc';
const CONFIG_FILE = 'soloist-config.json';
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
    app, BrowserWindow, safeStorage,
    files = fs, processEnv = process.env, platform = process.platform,
    startProcess = spawn, isPortBusy = portInUse,
    logger = console, connectionFactory = createSoloistConnection, captureFactory = createSoloistCaptureBridge,
}) {
    let child = null;
    let stopped = false;
    let starting = null;
    let sessionKey = null;
    let state = 'not-configured';
    let failure = null;
    let external = false;
    let selectedExecutable = null;
    let persistentKey = false;
    const captureBridge = captureFactory({ app, BrowserWindow, processEnv, logger });
    const update = (next, error) => { state = next; failure = error; };
    const connection = connectionFactory({ update });
    const configPath = () => path.join(app.getPath('userData'), CONFIG_FILE);
    const keyPath = () => path.join(app.getPath('userData'), KEY_FILE);

    const encryptionAvailable = () => safeStorage.isEncryptionAvailable()
        && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
    function rememberKey(key) {
        if (!encryptionAvailable()) {
            // Do not restore an older key after a memory-only replacement.
            if (files.existsSync(keyPath())) files.unlinkSync(keyPath());
            sessionKey = key;
            persistentKey = false;
            logger.warn('[Soloist] OS encryption unavailable; key remains memory-only for this run');
            return;
        }
        const encrypted = safeStorage.encryptString(key);
        files.mkdirSync(path.dirname(keyPath()), { recursive: true });
        files.writeFileSync(keyPath(), encrypted, { mode: 0o600 });
        sessionKey = key;
        persistentKey = true;
        logger.info('[Soloist] API key saved using operating-system encryption');
    }
    function readKey() {
        if (sessionKey) return sessionKey;
        try {
            if (encryptionAvailable() && files.existsSync(keyPath())) {
                const key = safeStorage.decryptString(files.readFileSync(keyPath()));
                persistentKey = Boolean(key.trim());
                sessionKey = key.trim() || null;
                if (sessionKey) return sessionKey;
            }
        } catch (error) {
            logger.warn('[Soloist] Could not unlock saved API key; new setup is required');
        }
        if (typeof processEnv.SOLOIST_API_KEY === 'string' && processEnv.SOLOIST_API_KEY.trim()) {
            const key = processEnv.SOLOIST_API_KEY.trim();
            // Import an environment variable supplied for first-run setup; never write plaintext.
            // A key changed in the UI takes precedence over that first-run variable on later launches.
            rememberKey(key);
            return key;
        }
        return null;
    }
    function executable() {
        const envPath = processEnv.FOLIA_SOLOIST_EXE;
        let savedPath = null;
        try { savedPath = JSON.parse(files.readFileSync(configPath(), 'utf8')).executable; } catch {}
        const candidates = [
            selectedExecutable,
            typeof savedPath === 'string' && path.isAbsolute(savedPath) ? savedPath : null,
            typeof envPath === 'string' && path.isAbsolute(envPath) ? envPath : null,
            app.isPackaged ? path.join(process.resourcesPath, 'soloist', 'soloist.exe') : null,
            path.join(app.getAppPath(), 'build', 'soloist-local', 'soloist.exe'),
            ...String(processEnv.PATH || processEnv.Path || '').split(path.delimiter)
                .filter(directory => path.isAbsolute(directory)).map(directory => path.join(directory, 'soloist.exe')),
        ];
        return candidates.find(candidate => {
            try { return candidate && files.statSync(candidate).isFile(); } catch { return false; }
        }) || null;
    }

    // The onboarding window, and only it, may submit a key to the main process.
    // This is now the trusted app's existing login window, guarded by soloistSetupIpc.cjs.
    function status() {
        const hasKey = Boolean(readKey());
        return { enabled: platform === 'win32', state, error: failure, hasKey,
            executable: executable(), persistentKey, external };
    }

    function selectExecutable(candidate) {
        if (typeof candidate !== 'string' || !path.isAbsolute(candidate)
            || path.basename(candidate).toLowerCase() !== 'soloist.exe'
            || !files.existsSync(candidate) || !files.statSync(candidate).isFile()) return false;
        selectedExecutable = candidate;
        return true;
    }

    async function save(candidate) {
        const key = typeof candidate === 'string' ? candidate.trim() : null;
        if (key !== null && (key.length < 15 || key.length > 1024 || /\s|\0/.test(key))) {
            return { ...status(), state: 'error', error: 'invalid-key' };
        }
        try {
            if (key !== null) rememberKey(key);
            if (selectedExecutable) {
                files.mkdirSync(path.dirname(configPath()), { recursive: true });
                files.writeFileSync(configPath(), JSON.stringify({ executable: selectedExecutable }), { mode: 0o600 });
            }
        } catch {
            return { ...status(), state: 'error', error: 'save-failed' };
        }
        return reconnect();
    }

    async function releaseChild() {
        const owned = child;
        if (!owned || owned.exitCode !== null) return true;
        // Wait for our daemon to release its port; never restart over a still-running process.
        return new Promise(resolve => {
            const timer = setTimeout(() => { owned.removeListener('exit', exited); resolve(false); }, 4000);
            const exited = () => { clearTimeout(timer); resolve(true); };
            owned.once('exit', exited);
            try { if (!owned.killed) owned.kill(); } catch { clearTimeout(timer); owned.removeListener('exit', exited); resolve(false); }
        });
    }

    async function reconnect() {
        if (starting) await starting;
        connection.stop();
        captureBridge.stop();
        if (!await releaseChild()) {
            update('error', 'startup-failed');
            return status();
        }
        await start();
        return status();
    }

    async function start() {
        if (starting) return starting;
        starting = (async () => {
            if (stopped || platform !== 'win32') return 'not-enabled';
            if (child?.exitCode === null && child?.pid) return 'already-started';
            // If a Soloist is already running, use it; never kill someone else's daemon.
            const busy = await isPortBusy();
            if (stopped) return 'not-enabled';
            if (busy) {
                // Key can still be imported to encrypted storage for a future run.
                if (processEnv.SOLOIST_API_KEY) readKey();
                logger.info('[Soloist] Local port 9090 is already in use; assuming an external Soloist session');
                external = true;
                connection.start();
                captureBridge.start(0);
                return 'external';
            }
            external = false;
            const binary = executable();
            if (!binary) { update('not-configured', 'missing-executable'); return 'missing-executable'; }
            const key = readKey();
            if (!key) { update('not-configured', null); return 'key-needed'; }
            try {
                const launched = startProcess(binary, [
                    '--device-name', 'Folia Audio', '--api-key', key,
                    '--ws', `${HOST}:${PORT}`,
                ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], detached: false });
                child = launched;
                connection.start();
                launched.once('spawn', () => captureBridge.start(launched.pid));
                let diagnosticTail = '';
                let invalidKey = false;
                // Inspect bounded stderr in memory for a known failure; never log or return daemon text.
                launched.stderr?.on('data', bytes => {
                    diagnosticTail = (diagnosticTail + String(bytes)).slice(-2048);
                    invalidKey ||= /(?:invalid|revoked|unauthorized|rejected)[^\r\n]{0,60}(?:api.?key)|api.?key[^\r\n]{0,60}(?:invalid|revoked|unauthorized|rejected)/i.test(diagnosticTail);
                    if (invalidKey) { connection.stop(); update('error', 'invalid-key'); }
                });
                launched.once('error', error => {
                    connection.stop();
                    update('error', error.code === 'ENOENT' ? 'missing-executable' : 'startup-failed');
            // Spawn errors may contain the API key in their arguments; log only their safe classification.
                    logger.warn('[Soloist] Failed to start local executable:', error.code || error.name);
                });
                launched.once('exit', (code, signal) => {
                    if (child === launched) {
                        child = null;
                        captureBridge.stop();
                        connection.stop();
                        if (!stopped) update('error', code === 10 ? 'build-expired' : invalidKey ? 'invalid-key' : 'startup-failed');
                    }
                    if (!stopped) logger.warn(`[Soloist] Process exited (code=${code}, signal=${signal || 'none'}). A newer Soloist build may be needed.`);
                });
                logger.info('[Soloist] Started personal Spotify Soloist process; connect via Spotify app if prompted');
                return 'started';
            } catch (error) {
                update('error', 'startup-failed');
                logger.warn('[Soloist] Launch failed:', error.code || error.name);
                return 'launch-failed';
            }
        })().finally(() => { starting = null; });
        return starting;
    }

    function stop() {
        stopped = true;
        captureBridge.stop();
        connection.stop();
        if (child && child.exitCode === null && !child.killed) {
            child.kill();
            logger.info('[Soloist] Stopped companion process owned by Folia');
        }
    }
    const manager = { start, stop, readKey, executable, status, selectExecutable, save, reconnect };
    manager.registerSetupIpc = options => registerSoloistSetupIpc({ ...options, manager });
    return manager;
}

module.exports = { createSoloistManager, portInUse, KEY_FILE };
