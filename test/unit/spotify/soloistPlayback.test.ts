import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '../../../src/types';
import { nextQueueIndex, prevQueueIndex } from '../../../src/utils/playbackNeighbors';

// Exercises the real Soloist bridge with independently delayed media events and remote snapshots.
const playback = vi.hoisted(() => {
    let state = { audioSrc: null as string | null };
    const listeners = new Set<(next: typeof state, previous: typeof state) => void>();
    return {
        getState: () => state,
        subscribe: (listener: (next: typeof state, previous: typeof state) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        select: (audioSrc: string | null) => {
            const previous = state;
            state = { audioSrc };
            listeners.forEach(listener => listener(state, previous));
        },
        reset: () => { state = { audioSrc: null }; listeners.clear(); },
    };
});
vi.mock('../../../src/stores/usePlaybackStore', () => ({ usePlaybackStore: playback }));
vi.mock('../../../src/stores/useAudioSettingsStore', () => ({
    useAudioSettingsStore: { getState: () => ({ volume: 0.5, isMuted: false }), subscribe: () => () => {} },
}));

class Events {
    listeners = new Map<string, Array<(event: any) => void>>();
    addEventListener(type: string, listener: (event: any) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    emit(type: string, event: object = {}) { this.listeners.get(type)?.forEach(listener => listener(event)); }
}
let documentEvents: Events;
class Audio {
    src = '';
    currentSrc = '';
    currentTime = 0;
    duration = 180;
    paused = true;
    ended = false;
    seeking = false;
    loop = false;
    getAttribute(name: string) { return name === 'src' ? this.src : null; }
    fire(type: string) { documentEvents.emit(type, { target: this }); }
    play() { this.paused = false; this.ended = false; this.fire('playing'); return Promise.resolve(); }
    pause() { this.paused = true; this.fire('pause'); }
}
type Command = { command: string; uri?: string; position_ms?: number; enabled?: boolean };
let sockets: Socket[];
class Socket extends Events {
    static OPEN = 1;
    readyState = 1;
    commands: Command[] = [];
    audibleUri: string | null = null;
    paused = true;
    repeat: 'off' | 'context' | 'track' = 'context';
    constructor(_url: string) { super(); sockets.push(this); }
    send(value: string) {
        const command: Command = JSON.parse(value);
        this.commands.push(command);
        if (command.command === 'play') { this.audibleUri = command.uri ?? this.audibleUri; this.paused = false; }
        if (command.command === 'pause') this.paused = true;
        if (command.command === 'set_repeat_track') {
            if (command.enabled) this.repeat = 'track';
            else if (this.repeat === 'track') this.repeat = 'off';
        }
        if (command.command === 'set_repeat_context') {
            if (command.enabled) this.repeat = 'context';
            else if (this.repeat === 'context') this.repeat = 'off';
        }
    }
    receive(event: object) { this.emit('message', { data: JSON.stringify(event) }); }
    close() { this.readyState = 3; this.emit('close'); }
}

const ids = ['1111111111111111111111', '2222222222222222222222', '3333333333333333333333'];
const uri = (index: number) => `spotify:track:${ids[index]}`;
const flush = async () => { for (let index = 0; index < 60; index += 1) await Promise.resolve(); };
let bridge: typeof import('../../../src/services/onlineMusic/spotify/spotifySoloist');
let sources: string[];
const select = (audio: Audio, index: number) => {
    playback.select(sources[index]);
    audio.src = sources[index];
    audio.currentSrc = sources[index];
    audio.currentTime = 0;
    void audio.play();
};
const plays = () => sockets.flatMap(socket => socket.commands.filter(command => command.command === 'play'));
const repeatCommands = (socket = sockets[0]) => socket.commands.filter(command => command.command.startsWith('set_repeat_'));
const REPEAT_OFF = [
    { type: 'command', command: 'set_repeat_track', enabled: false },
    { type: 'command', command: 'set_repeat_context', enabled: false },
];

beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    playback.reset();
    sockets = [];
    documentEvents = new Events();
    vi.stubGlobal('document', Object.assign(documentEvents, { visibilityState: 'visible' }));
    vi.stubGlobal('window', Object.assign(new Events(), {
        electron: { spotifyRequest: () => {} }, setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval,
    }));
    vi.stubGlobal('HTMLAudioElement', Audio);
    vi.stubGlobal('WebSocket', Socket);
    let serial = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:soloist-${++serial}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    bridge = await import('../../../src/services/onlineMusic/spotify/spotifySoloist');
    sources = [];
    for (const id of ids) {
        const pending = bridge.soloistSource({ id, name: id, durationMs: 180000, artists: [], album: { id: '', name: '' } } as SongResult, id, 'high');
        await vi.dynamicImportSettled();
        sockets[0].receive({ type: 'auth_state', logged_in: true });
        sources.push((await pending).url);
        sockets[0].receive({ type: 'options_changed', options: { repeat: sockets[0].repeat } });
    }
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Soloist playback ownership', () => {
    it('does not restart a track on duplicate playing events before remote confirmation', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        audio.fire('playing');
        await flush();
        expect(plays()).toEqual([{ type: 'command', command: 'play', uri: uri(0) }]);
    });

    it('ignores delayed outgoing playing events after a manual skip to another deck', async () => {
        const outgoing = new Audio();
        const incoming = new Audio();
        select(outgoing, 0);
        await flush();
        select(incoming, 1);
        await flush();
        outgoing.fire('playing');
        await flush();
        expect(sockets[0].audibleUri).toBe(uri(1));
        expect(plays().map(command => command.uri)).toEqual([uri(0), uri(1)]);
    });

    it('ignores a playing event while currentSrc still describes the outgoing resource', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        playback.select(sources[1]);
        audio.src = sources[1];
        audio.fire('playing');
        await flush();
        expect(plays().map(command => command.uri)).toEqual([uri(0)]);
        audio.currentSrc = sources[1];
        await audio.play();
        await flush();
        expect(sockets[0].audibleUri).toBe(uri(1));
    });

    it('does not let delayed outgoing pause or ended events pause a reused incoming element', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        select(audio, 1);
        await flush();
        audio.fire('pause');
        audio.fire('ended');
        await flush();
        expect(sockets[0].audibleUri).toBe(uri(1));
        expect(sockets[0].paused).toBe(false);
    });

    it('drops superseded queued commands during rapid track changes', async () => {
        const audio = new Audio();
        select(audio, 0);
        audio.pause();
        select(audio, 1);
        select(audio, 2);
        await flush();
        expect(plays().map(command => command.uri)).toEqual([uri(2)]);
        expect(sockets[0].paused).toBe(false);
    });

    it.each(['off', 'all'] as const)('follows automatic next and queue-end behavior with repeat %s', async mode => {
        const audio = new Audio();
        for (const index of [0, 1, 2]) {
            select(audio, index);
            await flush();
            audio.ended = true;
            audio.paused = true;
            audio.fire('ended');
            const next = nextQueueIndex(3, index, mode);
            if (next >= 0) select(audio, next);
            await flush();
            expect(sockets[0].audibleUri).toBe(uri(next >= 0 ? next : index));
            expect(sockets[0].paused).toBe(next < 0);
            expect(sockets[0].repeat).toBe('off');
        }
        expect(repeatCommands()).toEqual(REPEAT_OFF);
    });

    it('follows manual next/previous and a shuffled Folia queue by explicit URI', async () => {
        const audio = new Audio();
        const queue = [0, 2, 1];
        let index = 0;
        select(audio, queue[index]);
        await flush();
        index = nextQueueIndex(queue.length, index, 'one');
        select(audio, queue[index]);
        await flush();
        index = prevQueueIndex(queue.length, index, 'one');
        select(audio, queue[index]);
        await flush();
        expect(plays().map(command => command.uri)).toEqual([uri(0), uri(2), uri(0)]);
        expect(sockets[0].repeat).toBe('off');
        expect(repeatCommands()).toEqual(REPEAT_OFF);
    });

    it('restarts the same URI once for a repeat-one native loop without advancing the queue', async () => {
        const audio = new Audio();
        audio.loop = true;
        select(audio, 0);
        await flush();
        sockets[0].receive({ type: 'track_changed', item: { uri: uri(0) } });
        audio.currentTime = 0;
        audio.fire('seeking');
        audio.fire('playing');
        await flush();
        expect(plays().map(command => command.uri)).toEqual([uri(0), uri(0)]);
        expect(sockets[0].audibleUri).toBe(uri(0));
        expect(sockets[0].repeat).toBe('off');
        expect(repeatCommands()).toEqual(REPEAT_OFF);
    });

    it('leaves non-selected preview audio alone and releases Soloist for selected normal playback', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        const preview = new Audio();
        preview.src = preview.currentSrc = 'https://example.test/preview.ogg';
        await preview.play();
        await flush();
        expect(sockets[0].paused).toBe(false);
        playback.select(preview.src);
        await preview.play();
        await flush();
        expect(sockets[0].paused).toBe(true);
        expect(preview.paused).toBe(false);
    });

    it('restarts a one-song repeat-all queue even when it reuses the same source URL', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        sockets[0].receive({ type: 'track_changed', item: { uri: uri(0) } });
        audio.ended = true;
        audio.paused = true;
        audio.fire('ended');
        expect(nextQueueIndex(1, 0, 'all')).toBe(0);
        select(audio, 0);
        await flush();
        expect(plays().map(command => command.uri)).toEqual([uri(0), uri(0)]);
        expect(sockets[0].paused).toBe(false);
    });

    it('preserves pause, resume, seek and remote lyric-clock corrections without echoing them', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        sockets[0].receive({ type: 'track_changed', item: { uri: uri(0) } });
        audio.pause();
        await flush();
        expect(sockets[0].paused).toBe(true);
        await audio.play();
        await flush();
        expect(plays().at(-1)).toEqual({ type: 'command', command: 'play' });
        audio.currentTime = 60;
        audio.fire('seeking');
        await flush();
        expect(sockets[0].commands.at(-1)).toEqual({ type: 'command', command: 'seek', position_ms: 60000 });

        vi.advanceTimersByTime(1500);
        const commandsBefore = sockets[0].commands.length;
        sockets[0].receive({ type: 'position_sync', position: { position_ms: 63000, timestamp_ms: Date.now(), speed: 1 } });
        expect(audio.currentTime).toBe(63);
        audio.fire('seeking');
        await flush();
        expect(sockets[0].commands).toHaveLength(commandsBefore);
        sockets[0].receive({ type: 'playback_changed', status: 'paused' });
        expect(audio.paused).toBe(true);
        await flush();
        expect(sockets[0].commands).toHaveLength(commandsBefore);
        await audio.play();
        await flush();
        expect(plays().at(-1)).toEqual({ type: 'command', command: 'play' });
    });

    it('ignores outgoing remote snapshots and old snapshots for a repeated URI', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        const oldTimestamp = Date.now();
        vi.advanceTimersByTime(100);
        select(audio, 1);
        await flush();
        vi.advanceTimersByTime(1500);
        sockets[0].receive({ type: 'playback_state', item: { uri: uri(0) }, status: 'paused', position: { position_ms: 160000, timestamp_ms: Date.now(), speed: 0 } });
        expect(audio.paused).toBe(false);
        expect(audio.currentTime).toBe(0);
        select(audio, 0);
        await flush();
        vi.advanceTimersByTime(1500);
        sockets[0].receive({ type: 'playback_state', item: { uri: uri(0) }, status: 'paused', position: { position_ms: 160000, timestamp_ms: oldTimestamp, speed: 0 } });
        expect(audio.paused).toBe(false);
        expect(audio.currentTime).toBe(0);
    });

    it('rechecks command ownership after waiting for a reconnect and ignores the retired socket', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        sockets[0].close();
        select(audio, 1);
        await flush();
        expect(sockets).toHaveLength(2);
        select(audio, 2);
        sockets[1].receive({ type: 'auth_state', logged_in: true });
        await flush();
        expect(sockets[1].commands.filter(command => command.command === 'play').map(command => command.uri)).toEqual([uri(2)]);
        sockets[1].receive({ type: 'track_changed', item: { uri: uri(2) } });
        vi.advanceTimersByTime(1500);
        sockets[0].receive({ type: 'playback_state', item: { uri: uri(2) }, status: 'paused' });
        sockets[0].receive({ type: 'auth_state', logged_in: false });
        sockets[0].emit('close');
        expect(audio.paused).toBe(false);
        audio.currentTime = 10;
        audio.fire('seeking');
        await flush();
        expect(sockets).toHaveLength(2);
        expect(sockets[1].commands.at(-1)).toEqual({ type: 'command', command: 'seek', position_ms: 10000 });
    });

    it('invalidates a delayed outgoing state-refresh callback even when the same URI returns', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        vi.advanceTimersByTime(1000);
        select(audio, 1);
        select(audio, 0);
        await flush();
        vi.advanceTimersByTime(700);
        expect(sockets[0].commands.filter(command => command.command === 'get_state')).toEqual([]);
    });
});

describe('Soloist remote repeat synchronization', () => {
    it('bounds retries when dispatch is accepted but repeat off is not confirmed', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        sockets[0].receive({ type: 'options_changed', options: { repeat: 'context' } });
        sockets[0].receive({ type: 'command_result', command: 'set_repeat_track' });
        sockets[0].receive({ type: 'command_result', command: 'set_repeat_context' });
        for (let index = 0; index < 10; index += 1) {
            sockets[0].receive({ type: 'options_changed', options: { repeat: 'context' } });
        }
        expect(repeatCommands()).toHaveLength(4);
        vi.advanceTimersByTime(2500);
        sockets[0].receive({ type: 'playback_state', options: { repeat: 'context' } });
        expect(repeatCommands()).toHaveLength(6);
        sockets[0].receive({ type: 'options_changed', options: { repeat: 'off' } });
        vi.advanceTimersByTime(10000);
        sockets[0].receive({ type: 'playback_state', options: { repeat: 'off' } });
        expect(repeatCommands()).toHaveLength(6);
    });

    it('restores repeat off after authentication is replaced on the same socket', async () => {
        select(new Audio(), 0);
        await flush();
        sockets[0].receive({ type: 'auth_state', logged_in: false });
        sockets[0].repeat = 'context';
        sockets[0].receive({ type: 'auth_state', logged_in: true });
        expect(sockets[0].repeat).toBe('off');
        expect(repeatCommands()).toEqual([...REPEAT_OFF, ...REPEAT_OFF]);
    });

    it('initializes only the replacement socket when the previous connection remains open after logout', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        sockets[0].receive({ type: 'auth_state', logged_in: false });
        select(audio, 1);
        await flush();
        expect(sockets[0].readyState).toBe(Socket.OPEN);
        sockets[1].receive({ type: 'auth_state', logged_in: true });
        await flush();
        expect(repeatCommands(sockets[0])).toEqual(REPEAT_OFF);
        expect(sockets[1].commands.slice(0, 3)).toEqual([...REPEAT_OFF, { type: 'command', command: 'play', uri: uri(1) }]);
    });

    it('clears retained context repeat on connection before sending the first play', async () => {
        expect(sockets[0].commands.slice(0, 2)).toEqual(REPEAT_OFF);
        expect(sockets[0].repeat).toBe('off');
        select(new Audio(), 0);
        await flush();
        expect(sockets[0].commands.findIndex(command => command.command === 'play')).toBe(2);
        expect(repeatCommands()).toEqual(REPEAT_OFF);
    });

    it.each(['context', 'track'] as const)('repairs reported %s repeat once while confirmation is pending', async repeat => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        sockets[0].repeat = repeat;
        sockets[0].receive({ type: 'options_changed', options: { repeat } });
        sockets[0].receive({ type: 'options_changed', options: { repeat } });
        select(audio, 1);
        select(audio, 2);
        await flush();
        expect(sockets[0].repeat).toBe('off');
        expect(sockets[0].audibleUri).toBe(uri(2));
        expect(repeatCommands()).toEqual([...REPEAT_OFF, ...REPEAT_OFF]);
        sockets[0].receive({ type: 'options_changed', options: { repeat: 'off' } });
        for (let index = 0; index < 3; index += 1) {
            sockets[0].receive({ type: 'playback_state', item: { uri: uri(2) }, options: { repeat: 'off' } });
        }
        expect(repeatCommands()).toHaveLength(4);
        // A later external change is a new correction, not a permanently suppressed request.
        sockets[0].repeat = repeat;
        sockets[0].receive({ type: 'options_changed', options: { repeat } });
        expect(sockets[0].repeat).toBe('off');
        expect(repeatCommands()).toHaveLength(6);
    });

    it('handles repeat options even in a snapshot too old to drive the current lyric clock', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        sockets[0].repeat = 'context';
        sockets[0].receive({
            type: 'playback_state', item: { uri: uri(0) }, status: 'paused', options: { repeat: 'context' },
            position: { position_ms: 179000, timestamp_ms: Date.now() - 10000, speed: 0 },
        });
        expect(sockets[0].repeat).toBe('off');
        expect(audio.paused).toBe(false);
        expect(audio.currentTime).toBe(0);
    });

    it('resets retained repeat on reconnect before the newest queued play and ignores the old socket', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        sockets[0].close();
        select(audio, 1);
        await flush();
        select(audio, 2);
        expect(sockets[1].repeat).toBe('context');
        sockets[1].receive({ type: 'auth_state', logged_in: true });
        sockets[1].receive({ type: 'playback_state', options: { repeat: 'context' } });
        await flush();
        expect(sockets[1].commands.slice(0, 3)).toEqual([...REPEAT_OFF, { type: 'command', command: 'play', uri: uri(2) }]);
        expect(sockets[1].repeat).toBe('off');
        sockets[1].receive({ type: 'options_changed', options: { repeat: 'off' } });
        sockets[0].receive({ type: 'options_changed', options: { repeat: 'context' } });
        expect(repeatCommands(sockets[1])).toEqual(REPEAT_OFF);
    });

    it('leaves remote options alone during non-Soloist playback, then repairs them before reacquiring playback', async () => {
        const audio = new Audio();
        select(audio, 0);
        await flush();
        playback.select('https://example.test/other.ogg');
        await flush();
        sockets[0].repeat = 'context';
        sockets[0].receive({ type: 'options_changed', options: { repeat: 'context' } });
        expect(repeatCommands()).toEqual(REPEAT_OFF);
        select(audio, 1);
        await flush();
        expect(sockets[0].repeat).toBe('off');
        expect(sockets[0].audibleUri).toBe(uri(1));
        expect(repeatCommands()).toEqual([...REPEAT_OFF, ...REPEAT_OFF]);
    });
});
