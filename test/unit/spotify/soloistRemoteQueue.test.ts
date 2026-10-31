import { describe, expect, it } from 'vitest';
import type { SongResult } from '../../../src/types';
import { buildRemoteQueueItems, planRemoteQueueCommand } from '../../../src/components/app/playback/bridges/remoteQueueFeed';

// Remote queue operations must retain source identity and follow reordered mixed-provider queues.
const song = (providerId: string, id: string): SongResult => ({
    id, name: id, artists: [], album: { id: 'album', name: 'Album' }, durationMs: 180000,
    sourceRef: { kind: 'online', providerId, mediaId: id },
} as SongResult);

describe('Soloist remote queue integration', () => {
    it('preserves order and resolves a stale index by provider-qualified identity after shuffle', () => {
        const a = song('spotify', '1111111111111111111111');
        const b = song('spotify', '2222222222222222222222');
        const other = song('netease', '1111111111111111111111');
        const before = buildRemoteQueueItems([a, b, other], { unavailable: 'N/A', video: 'MV' });
        expect(before.map(row => row.key)).toEqual([
            'online:spotify:1111111111111111111111',
            'online:spotify:2222222222222222222222',
            'online:netease:1111111111111111111111',
        ]);
        const guard = { readOnly: false, displayKey: before[0].key, playingKey: before[0].key };
        const shuffled = [other, a, b];
        for (const type of ['queue-play', 'queue-play-next', 'queue-move-to-end', 'queue-remove'] as const) {
            expect(planRemoteQueueCommand(shuffled, { type, key: before[1].key, index: 1 }, guard)).toBe(2);
            expect(planRemoteQueueCommand([other, a], { type, key: before[1].key, index: 1 }, guard)).toBe(-1);
        }
        expect(planRemoteQueueCommand(shuffled, { type: 'queue-remove', key: before[0].key, index: 0 }, guard)).toBe(-1);
        expect(planRemoteQueueCommand(shuffled, { type: 'queue-play', key: before[0].key, index: 0 }, guard)).toBe(1);
    });
});
