import { describe, expect, it } from 'vitest';
import { createSilentWav } from '../../../src/services/onlineMusic/spotify/spotifySoloist';

// test/unit/spotify/spotifySoloist.test.ts
// Folia's silent audio timeline is well-formed; Soloist renders actual audio separately.

describe('Soloist timeline media', () => {
    it('generates playable-length mono 8-bit PCM silence', async () => {
        const blob = createSilentWav(2700);
        expect(blob.type).toBe('audio/wav');
        expect(blob.size).toBe(44 + 3 * 8000);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const dv = new DataView(bytes.buffer);
        expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
        expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
        expect(dv.getUint32(4, true)).toBe(blob.size - 8);
        expect(dv.getUint32(24, true)).toBe(8000);
        expect(dv.getUint16(22, true)).toBe(1);
        expect(dv.getUint16(34, true)).toBe(8);
        expect(dv.getUint32(40, true)).toBe(3 * 8000);
        expect(bytes.slice(44).every(value => value === 128)).toBe(true);
    });
    it('limits empty and unreasonable durations', () => {
        expect(createSilentWav(0).size).toBe(44 + 8000);
        expect(createSilentWav(Number.NaN).size).toBe(44 + 180 * 8000);
    });
});
