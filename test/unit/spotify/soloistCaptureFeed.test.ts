import { afterEach, describe, expect, it, vi } from 'vitest';
import { spotifyProvider } from '../../../src/services/onlineMusic/spotify/spotifyProvider';
import * as timeline from '../../../src/services/onlineMusic/spotify/spotifySoloist';
import type { ProviderAudioAnalysisFrame } from '../../../src/types/onlineMusic';

// Verifies external analysis ownership, IPC subscription and stale-frame expiry through the adapter.

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Soloist audio analysis', () => {
    it('uses capture only for its timeline and keeps expired capture distinct from native audio', () => {
        const externalAudio = {} as HTMLAudioElement;
        const nativeAudio = {} as HTMLAudioElement;
        vi.spyOn(timeline, 'isSoloistTimelineAudio').mockImplementation(audio => audio === externalAudio);
        let receive!: (frame: ProviderAudioAnalysisFrame) => void;
        const subscribe = vi.fn((callback: typeof receive) => {
            receive = callback;
            return () => {};
        });
        vi.stubGlobal('window', { electron: { onSoloistAudioFrame: subscribe } });
        const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
        const read = spotifyProvider.playback!.readAudioAnalysisFrame!;

        expect(read(nativeAudio)).toBeUndefined();
        expect(subscribe).not.toHaveBeenCalled();
        expect(read(externalAudio)).toBeNull();
        const frame = { power: 0.5, bass: 0.2, lowMid: 0.3, mid: 0.4, vocal: 0.5, treble: 0.6, spectrum: [10, 20] };
        receive(frame);
        expect(read(externalAudio)).toBe(frame);
        expect(read(nativeAudio)).toBeUndefined();
        clock.mockReturnValue(1349);
        expect(read(externalAudio)).toBe(frame);
        clock.mockReturnValue(1350);
        expect(read(externalAudio)).toBeNull();
        receive(frame);
        expect(read(externalAudio)).toBe(frame);
        expect(subscribe).toHaveBeenCalledTimes(1);
    });
});
