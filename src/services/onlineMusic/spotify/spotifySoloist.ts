import type { SongResult } from '../../../types';
import type { AudioQualityPreference } from '../../../types/onlineMusic';
import { createProviderSongMetadata } from '../../../utils/songMetadata';
import { useAudioSettingsStore } from '../../../stores/useAudioSettingsStore';

// src/services/onlineMusic/spotify/spotifySoloist.ts
// Experimental, opt-in playback adapter: Soloist renders audio through Windows itself.
// A silent WAV keeps Folia's <audio> timeline usable; its waveform is NOT Soloist's audio.
// Soloist's unauthenticated WebSocket must only listen on localhost.
const SOLOIST_URL = 'ws://127.0.0.1:9090';
const SAMPLE_RATE = 8000;
const MAX_SILENCE_MS = 30 * 60 * 1000;
const MAX_TRACKS = 24;

export const useSpotifySoloist = import.meta.env.VITE_FOLIA_SOLOIST === '1'
    && typeof window !== 'undefined'
    && typeof window.electron?.spotifyRequest === 'function';

type RegisteredTrack = { uri: string; durationMs: number };
type SoloistEvent = {
    type: string;
    logged_in?: boolean;
    message?: string;
    status?: string;
    item?: { uri?: string };
    position?: { position_ms?: number; timestamp_ms?: number; speed?: number };
};
const tracks = new Map<string, RegisteredTrack>();
let conn: WebSocket | null = null;
let connecting: Promise<WebSocket> | null = null;
let remoteLoggedIn = false;
let currentAudio: HTMLAudioElement | null = null;
let currentUri: string | null = null;
let currentSourceUrl: string | null = null;
let remoteUri: string | null = null;
let expectingPlayUntil = 0;
let listenersInstalled = false;
// Internal silent-timeline corrections must never be echoed to Soloist as user seeks.
const suppressedSeekUntil = new WeakMap<HTMLAudioElement, { target: number; startedAt: number }>();
const suppressedRemotePauseUntil = new WeakMap<HTMLAudioElement, number>();
const soloistVolume = () => {
    const { volume, isMuted } = useAudioSettingsStore.getState();
    return Math.round(Math.max(0, Math.min(1, isMuted ? 0 : volume)) * 100);
};

/** Duration-bearing silent media; the real audio is output by the separate Soloist process. */
export function createSilentWav(durationMs: number): Blob {
    const boundedMs = Math.max(1000, Math.min(MAX_SILENCE_MS, Number.isFinite(durationMs) ? durationMs : 180000));
    const frames = Math.ceil(boundedMs / 1000) * SAMPLE_RATE;
    const buffer = new ArrayBuffer(44 + frames);
    const view = new DataView(buffer);
    const put = (at: number, text: string) => {
        for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
    };
    put(0, 'RIFF');
    view.setUint32(4, 36 + frames, true);
    put(8, 'WAVE');
    put(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM format chunk
    view.setUint16(20, 1, true);  // PCM
    view.setUint16(22, 1, true);  // mono
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE, true); // byte rate (8-bit samples)
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    put(36, 'data');
    view.setUint32(40, frames, true);
    // 8-bit unsigned PCM silence is 128, not zero.
    new Uint8Array(buffer, 44).fill(128);
    return new Blob([buffer], { type: 'audio/wav' });
}

function infoOf(audio: HTMLAudioElement): RegisteredTrack | undefined {
    return tracks.get(audio.currentSrc) ?? tracks.get(audio.src);
}

// Identify the silent timeline so it never overwrites captured audio bands.
export function isSoloistTimelineAudio(audio: HTMLAudioElement | null): boolean {
    return audio !== null && Boolean(infoOf(audio));
}

function syncPosition(position: SoloistEvent['position']) {
    if (!position || !currentAudio || !currentUri) return;
    const audio = currentAudio;
    if (infoOf(audio)?.uri !== currentUri || audio.seeking) return;
    const baseMs = position.position_ms;
    if (typeof baseMs !== 'number' || !Number.isFinite(baseMs)) return;
    const elapsedMs = typeof position.timestamp_ms === 'number' && position.speed === 1
        ? Math.max(0, Date.now() - position.timestamp_ms) : 0;
    const next = Math.max(0, Math.min((baseMs + elapsedMs) / 1000, Math.max(0, audio.duration - 0.1)));
    // Correct persistent offset, including differences smaller than the previous 1.3s dead zone.
    if (Number.isFinite(next) && Math.abs(audio.currentTime - next) > 0.35) {
        suppressedSeekUntil.set(audio, { target: next, startedAt: performance.now() });
        audio.currentTime = next;
    }
}

function onEvent(event: SoloistEvent) {
    if (event.type === 'auth_state') remoteLoggedIn = event.logged_in === true;
    if (event.type === 'track_changed' || event.type === 'playback_state') {
        remoteUri = event.item?.uri ?? null;
    }
    if (event.type === 'position_sync' || event.type === 'playback_state') {
        // Soloist's position_sync event contains no URI. Never apply an old
        // track's position to the silent timeline of a newly selected track.
        if (remoteUri === currentUri && Date.now() >= expectingPlayUntil) syncPosition(event.position);
    }
    // When a Spotify app pauses the same Soloist track, reflect it in Folia too.
    if ((event.type === 'playback_changed' || event.type === 'playback_state')
        && remoteUri === currentUri
        && currentAudio && infoOf(currentAudio)?.uri === currentUri
        && Date.now() >= expectingPlayUntil) {
        if (event.status === 'paused' && !currentAudio.paused) {
            const audio = currentAudio;
            // Do not echo this remote pause back as a second pause command.
            suppressedRemotePauseUntil.set(audio, performance.now() + 1000);
            audio.pause();
        }
    }
}

/** Connect only to Soloist on the loopback interface. No API key enters Folia. */
function ready(): Promise<WebSocket> {
    if (conn?.readyState === WebSocket.OPEN && remoteLoggedIn) return Promise.resolve(conn);
    if (connecting) return connecting;
    connecting = new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(SOLOIST_URL);
        let settled = false;
        const limit = setTimeout(() => {
            if (settled) return;
            settled = true;
            socket.close();
            reject(new Error('Soloist did not answer on ws://127.0.0.1:9090'));
        }, 5000);
        const fail = (message: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(limit);
            reject(new Error(message));
        };
        socket.addEventListener('message', raw => {
            let data: SoloistEvent;
            try {
                data = JSON.parse(String(raw.data)) as SoloistEvent;
            } catch { return; }
            onEvent(data);
            if (!settled && data.type === 'auth_state') {
                if (!data.logged_in) {
                    fail('Soloist is running, but Spotify Connect is not logged in');
                    socket.close();
                } else {
                    settled = true;
                    clearTimeout(limit);
                    conn = socket;
                    console.info('[Soloist] Connected to Spotify Soloist on localhost');
                    resolve(socket);
                }
            } else if (data.type === 'error') {
                console.warn('[Soloist] Command rejected:', data.message);
            }
        });
        socket.addEventListener('error', () => fail('Cannot connect to Soloist at ws://127.0.0.1:9090'));
        socket.addEventListener('close', () => {
            if (conn === socket) conn = null;
            remoteLoggedIn = false;
            if (!settled) fail('Soloist disconnected during login');
        });
    }).finally(() => { connecting = null; });
    return connecting;
}

// Re-anchor Folia's silent timeline when returning from a background window.
// Soloist position_sync is an anchor update, NOT a periodic clock tick; get_state
// supplies a fresh position even when no new position_sync has been broadcast.
let lastPositionRequestMs = 0;
function requestPositionSnapshot(): void {
    if (!currentUri || !currentAudio || !remoteLoggedIn || conn?.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastPositionRequestMs < 600) return;
    lastPositionRequestMs = Date.now();
    try {
        conn.send(JSON.stringify({ type: 'command', command: 'get_state' }));
    } catch (error) {
        console.warn('[Soloist] Could not refresh playback position', error);
    }
}

let commandChain: Promise<void> = Promise.resolve();
function command(name: string, fields: Record<string, unknown> = {}): void {
    // Commands are ordered to avoid a stale pause overtaking the next track's play.
    commandChain = commandChain.catch(() => undefined).then(async () => {
        const socket = await ready();
        socket.send(JSON.stringify({ type: 'command', command: name, ...fields }));
    }).catch(error => console.error(`[Soloist] ${name} failed`, error));
}

/** Capture non-bubbling media events, and forward Folia's existing transport to Soloist. */
function installControls() {
    if (listenersInstalled) return;
    listenersInstalled = true;

    document.addEventListener('playing', event => {
        const audio = event.target;
        if (!(audio instanceof HTMLAudioElement)) return;
        const info = infoOf(audio);
        if (!info) {
            if (currentAudio) command('pause');
            currentAudio = null;
            currentUri = null;
            currentSourceUrl = null;
            return;
        }
        const sourceUrl = audio.currentSrc || audio.src;
        const changed = info.uri !== currentUri || currentAudio !== audio || currentSourceUrl !== sourceUrl || remoteUri !== info.uri;
        currentAudio = audio;
        currentUri = info.uri;
        currentSourceUrl = sourceUrl;
        expectingPlayUntil = Date.now() + 1300;
        command('play', changed ? { uri: info.uri } : {});
        command('set_volume', { volume: soloistVolume() });
        // Re-check after Soloist has processed play and the track guard has expired.
        window.setTimeout(() => {
            if (currentAudio === audio && currentUri === info.uri && !audio.paused) requestPositionSnapshot();
        }, 1700);
        console.info(`[Soloist] ${changed ? 'Starting' : 'Resuming'} ${info.uri}`);
    }, true);

    document.addEventListener('pause', event => {
        const audio = event.target;
        if (!(audio instanceof HTMLAudioElement) || audio !== currentAudio) return;
        if (performance.now() < (suppressedRemotePauseUntil.get(audio) ?? 0)) return;
        command('pause');
    }, true);

    document.addEventListener('seeking', event => {
        const audio = event.target;
        if (!(audio instanceof HTMLAudioElement) || audio !== currentAudio) return;
        const correction = suppressedSeekUntil.get(audio);
        if (correction) {
            suppressedSeekUntil.delete(audio);
            const ageSeconds = (performance.now() - correction.startedAt) / 1000;
            // The seeking event can be delayed by background throttling. Compare with the
            // corrected position extrapolated forward, not a short fixed 400ms timeout.
            if (ageSeconds < 15 && Math.abs(audio.currentTime - (correction.target + ageSeconds)) < 1.0) return;
        }
        if (Number.isFinite(audio.currentTime)) command('seek', { position_ms: Math.round(audio.currentTime * 1000) });
    }, true);

    // Folia applies volume in its Web Audio graph, so element.volume may stay 1.
    // Read the actual listener volume from Folia's audio settings instead.
    useAudioSettingsStore.subscribe((next, previous) => {
        if (currentAudio && (next.volume !== previous.volume || next.isMuted !== previous.isMuted)) {
            command('set_volume', { volume: soloistVolume() });
        }
    });

    document.addEventListener('ended', event => {
        if (event.target === currentAudio) command('pause');
    }, true);

    // Keep the clock anchored while visible, and always re-check immediately on Alt+Tab back.
    // This is lightweight metadata polling; it does not stream audio over WebSocket.
    window.setInterval(() => {
        if (document.visibilityState === 'visible' && currentAudio && !currentAudio.paused) {
            requestPositionSnapshot();
        }
    }, 2500);
    window.addEventListener('focus', requestPositionSnapshot);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') requestPositionSnapshot();
    });

    window.addEventListener('beforeunload', () => {
        if (currentAudio && conn?.readyState === WebSocket.OPEN && remoteLoggedIn) {
            conn.send(JSON.stringify({ type: 'command', command: 'pause' }));
        }
    });
}

/** Returns playable timeline media, while the actual audible sound is delegated to Soloist. */
export async function soloistSource(song: SongResult, trackId: string, quality: AudioQualityPreference): Promise<{ url: string; fetchedAt: number; quality: AudioQualityPreference }> {
    if (!/^[0-9A-Za-z]{22}$/.test(trackId)) throw new Error('Invalid Spotify track ID');
    await ready();
    installControls();
    const durationMs = createProviderSongMetadata(song).durationMs || 180000;
    const url = URL.createObjectURL(createSilentWav(durationMs));
    tracks.set(url, { uri: `spotify:track:${trackId}`, durationMs });
    // Limit blob memory; never revoke the current audio element's source.
    if (tracks.size > MAX_TRACKS) {
        for (const key of tracks.keys()) {
            if (tracks.size <= MAX_TRACKS) break;
            if (currentAudio && (currentAudio.currentSrc === key || currentAudio.src === key)) continue;
            tracks.delete(key);
            URL.revokeObjectURL(key);
        }
    }
    return { url, fetchedAt: Date.now(), quality };
}
