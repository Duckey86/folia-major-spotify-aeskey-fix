import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Setup preserves existing credentials and process ownership; no real key or daemon is used.
const require = createRequire(import.meta.url);
const { createSoloistManager, KEY_FILE } = require('../../../electron/soloist/manager.cjs');
const { registerSoloistSetupIpc, LINKS } = require('../../../electron/spotify/soloistSetupIpc.cjs');
const { createSoloistConnection } = require('../../../electron/soloist/connection.cjs');
const SECRET = 'test-personal-key-never-log';
const folders: string[] = [];
afterEach(() => {
    vi.useRealTimers();
    for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

function harness({ binary = true, encrypted = true, external = false, env = {} } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'folia-soloist-setup-'));
    folders.push(directory);
    const executable = path.join(directory, 'build', 'soloist-local', 'soloist.exe');
    if (binary) { fs.mkdirSync(path.dirname(executable), { recursive: true }); fs.writeFileSync(executable, 'fixture'); }
    const connection = { start: vi.fn(), stop: vi.fn() };
    const capture = { start: vi.fn(), stop: vi.fn() };
    const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null as number | null, killed: false,
        stderr: new EventEmitter(), kill: vi.fn(() => {
            child.killed = true;
            child.exitCode = 0;
            child.emit('exit', 0);
        }) });
    const startProcess = vi.fn((_binary: string, _args: string[], _options: unknown) => child);
    const logger = { info: vi.fn(), warn: vi.fn() };
    const options = {
        app: { getPath: () => directory, getAppPath: () => directory, isPackaged: false },
        safeStorage: { isEncryptionAvailable: () => encrypted, getSelectedStorageBackend: () => 'dpapi',
            encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')),
            decryptString: (value: Buffer) => value.toString().split('').reverse().join('') },
        platform: 'win32', processEnv: env, isPortBusy: vi.fn(async () => external),
        startProcess, logger, connectionFactory: () => connection, captureFactory: () => capture,
    };
    return { manager: createSoloistManager(options), options, directory, executable, child, connection, capture, logger, startProcess };
}

describe('Soloist onboarding and returning users', () => {
    it('reports first-run configuration without opening a separate key window', async () => {
        const h = harness({ binary: false });
        expect(await h.manager.start()).toBe('missing-executable');
        expect(h.manager.status()).toMatchObject({ state: 'not-configured', hasKey: false, executable: null });
        expect(h.startProcess).not.toHaveBeenCalled();
    });

    it('finds a personal download, saves an encrypted key, starts with the existing arguments, and restores both', async () => {
        const h = harness({ binary: false });
        const binary = path.join(h.directory, 'Downloads', 'soloist.exe');
        fs.mkdirSync(path.dirname(binary)); fs.writeFileSync(binary, 'fixture');
        expect(h.manager.selectExecutable(binary)).toBe(true);
        await h.manager.save(SECRET);
        expect(fs.readFileSync(path.join(h.directory, KEY_FILE), 'utf8')).not.toContain(SECRET);
        expect(h.startProcess).toHaveBeenCalledWith(binary, ['--device-name', 'Folia Audio', '--api-key', SECRET, '--ws', '127.0.0.1:9090'], expect.objectContaining({ windowsHide: true }));
        const returning = createSoloistManager(h.options);
        expect(returning.status()).toMatchObject({ hasKey: true, persistentKey: true, executable: binary });
        expect(JSON.stringify(returning.status())).not.toContain(SECRET);
        expect(JSON.stringify(h.logger.info.mock.calls)).not.toContain(SECRET);
    });

    it('uses an already running external daemon even without a local executable or key', async () => {
        const h = harness({ binary: false, external: true });
        expect(await h.manager.start()).toBe('external');
        expect(h.manager.status().external).toBe(true);
        await h.manager.reconnect(); h.manager.stop();
        expect(h.startProcess).not.toHaveBeenCalled();
        expect(h.child.kill).not.toHaveBeenCalled();
        expect(h.connection.start).toHaveBeenCalledTimes(2);
    });

    it('keeps a key memory-only when OS encryption is unavailable', async () => {
        const h = harness({ encrypted: false });
        await h.manager.save(SECRET);
        expect(fs.existsSync(path.join(h.directory, KEY_FILE))).toBe(false);
        expect(h.manager.status()).toMatchObject({ hasKey: true, persistentKey: false });
    });

    it('rejects the basic_text encryption fallback', async () => {
        const h = harness();
        h.options.safeStorage.getSelectedStorageBackend = () => 'basic_text';
        await h.manager.save(SECRET);
        expect(fs.existsSync(path.join(h.directory, KEY_FILE))).toBe(false);
    });

    it('rejects invalid input without overwriting an existing credential', async () => {
        const h = harness();
        await h.manager.save(SECRET);
        const sealed = fs.readFileSync(path.join(h.directory, KEY_FILE));
        expect(await h.manager.save('bad\nkey')).toMatchObject({ error: 'invalid-key' });
        expect(fs.readFileSync(path.join(h.directory, KEY_FILE))).toEqual(sealed);
    });

    it('allows replacing an imported environment key and restarts only its own daemon', async () => {
        const h = harness({ env: { SOLOIST_API_KEY: SECRET } });
        await h.manager.start();
        await h.manager.save('replacement-test-api-key');
        expect(h.child.kill).toHaveBeenCalledOnce();
        expect(h.startProcess.mock.calls[1][1]).toContain('replacement-test-api-key');
        expect(createSoloistManager(h.options).readKey()).toBe('replacement-test-api-key');
    });

    it('reports expired builds using the documented exit code', async () => {
        const h = harness();
        await h.manager.save(SECRET);
        h.child.emit('exit', 10, null);
        expect(h.manager.status()).toMatchObject({ state: 'error', error: 'build-expired' });
    });

    it('classifies rejected keys without exposing daemon output containing the key', async () => {
        const h = harness();
        await h.manager.save(SECRET);
        h.child.stderr.emit('data', `Invalid API key: ${SECRET}`);
        h.child.emit('exit', 1, null);
        expect(h.manager.status()).toMatchObject({ state: 'error', error: 'invalid-key' });
        expect(JSON.stringify(h.logger.warn.mock.calls)).not.toContain(SECRET);
        expect(JSON.stringify(h.manager.status())).not.toContain(SECRET);
    });

    it('reports asynchronous executable launch failures without serializing spawn arguments', async () => {
        const h = harness();
        await h.manager.save(SECRET);
        h.child.emit('error', Object.assign(new Error(`spawn ${SECRET}`), { code: 'EACCES' }));
        expect(h.manager.status().error).toBe('startup-failed');
        expect(JSON.stringify(h.logger.warn.mock.calls)).not.toContain(SECRET);
    });

    it('rejects directories and unrelated executables', () => {
        const h = harness();
        expect(h.manager.selectExecutable(h.directory)).toBe(false);
        expect(h.manager.selectExecutable('soloist.exe')).toBe(false);
        expect(h.manager.selectExecutable(path.join(h.directory, 'other.exe'))).toBe(false);
    });
});

describe('Soloist connection status', () => {
    function observe() {
        vi.useFakeTimers();
        const sockets: Array<EventEmitter & { terminate: () => void }> = [];
        const update = vi.fn();
        const connection = createSoloistConnection({ update, createSocket: () => {
            const socket = Object.assign(new EventEmitter(), { terminate: vi.fn(() => socket.emit('close')) });
            sockets.push(socket); return socket;
        } });
        connection.start();
        const auth = (logged_in: boolean) => sockets.at(-1)!.emit('message', Buffer.from(JSON.stringify({ type: 'auth_state', logged_in })));
        return { connection, update, auth, sockets };
    }

    it('shows Starting, Waiting for Pairing and Connected from actual authentication events', () => {
        const h = observe();
        expect(h.update).toHaveBeenLastCalledWith('starting', null);
        h.auth(false); expect(h.update).toHaveBeenLastCalledWith('waiting-for-pairing', null);
        h.auth(true); expect(h.update).toHaveBeenLastCalledWith('connected', null);
        h.connection.stop();
    });

    it('accepts restored pairing immediately and ignores malformed or unrelated events', () => {
        const h = observe();
        h.sockets[0].emit('message', Buffer.from('not json'));
        h.sockets[0].emit('message', Buffer.from('{"type":"playback_state"}'));
        expect(h.update).toHaveBeenCalledTimes(1);
        h.auth(true); expect(h.update).toHaveBeenLastCalledWith('connected', null);
        h.connection.stop();
    });

    it('reports pairing trouble but continues observing a later successful pairing', () => {
        const h = observe(); h.auth(false);
        vi.advanceTimersByTime(120000);
        expect(h.update).toHaveBeenLastCalledWith('error', 'pairing-timeout');
        h.auth(true); expect(h.update).toHaveBeenLastCalledWith('connected', null);
        h.connection.stop();
    });

    it('distinguishes a listening port from a responding Soloist endpoint', () => {
        const h = observe();
        vi.advanceTimersByTime(15000);
        expect(h.update).toHaveBeenLastCalledWith('error', 'startup-timeout');
        h.connection.stop(); expect(vi.getTimerCount()).toBe(0);
    });

    it('reports disconnection and reconnects without restarting the daemon', () => {
        const h = observe(); h.auth(true); h.sockets[0].emit('close');
        expect(h.update).toHaveBeenLastCalledWith('error', 'connection-lost');
        vi.advanceTimersByTime(1500); h.auth(true);
        expect(h.update).toHaveBeenLastCalledWith('connected', null);
        h.connection.stop();
    });

    it('resets the pairing deadline on reconnect and releases all timers on stop', () => {
        const h = observe(); h.auth(false);
        h.connection.start(); h.auth(false);
        vi.advanceTimersByTime(120000);
        expect(h.update).toHaveBeenLastCalledWith('error', 'pairing-timeout');
        h.connection.stop(); expect(vi.getTimerCount()).toBe(0);
    });
});

describe('Soloist setup IPC boundary', () => {
    function ipc() {
        let handler: (...args: any[]) => Promise<unknown>;
        const manager = { status: () => ({ enabled: true }), save: vi.fn(), reconnect: vi.fn(), selectExecutable: vi.fn(() => true) };
        const shell = { openExternal: vi.fn() };
        const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:\\Downloads\\soloist.exe'] })) };
        registerSoloistSetupIpc({ manager, shell, dialog, ipcMain: { handle: (_: string, fn: typeof handler) => { handler = fn; } }, isTrusted: (event: any) => event.trusted });
        const frame = {};
        const event = { trusted: true, senderFrame: frame, sender: { mainFrame: frame } };
        return { manager, shell, dialog, invoke: (action: string, payload?: unknown, patch = {}) => handler({ ...event, ...patch }, action, payload) };
    }

    it('opens only official allowlisted pages, including the exact key-generation URL', async () => {
        const h = ipc();
        await h.invoke('open', 'key');
        expect(h.shell.openExternal).toHaveBeenCalledWith('https://developer.spotify.com/dashboard/soloist');
        await h.invoke('open', 'downloads');
        expect(h.shell.openExternal).toHaveBeenCalledWith(LINKS.downloads);
        await h.invoke('open', 'https://example.com');
        expect(h.shell.openExternal).toHaveBeenCalledTimes(2);
    });

    it('rejects untrusted windows and subframes before reading or saving credentials', async () => {
        const h = ipc();
        expect(await h.invoke('save', SECRET, { trusted: false })).toBeNull();
        expect(await h.invoke('save', SECRET, { senderFrame: {} })).toBeNull();
        expect(h.manager.save).not.toHaveBeenCalled();
    });

    it('allows only native-dialog executable selection, not renderer-supplied paths', async () => {
        const h = ipc();
        await h.invoke('choose-executable', 'C:\\malicious.exe');
        expect(h.manager.selectExecutable).toHaveBeenCalledWith('C:\\Downloads\\soloist.exe');
        expect(await h.invoke('execute', 'anything')).toBeNull();
    });
});
