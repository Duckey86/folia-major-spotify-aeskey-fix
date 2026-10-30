import { lazy } from 'react';
import type { ProviderSetupEntry } from '../login/providerSetupRegistry';
import { requestSoloistSetup, soloistSetupAvailable } from './soloistSetupBridge';

// UI-only configuration entry. Music, accounts, lyrics and playback continue through Omni.
export default {
    providerId: 'spotify',
    available: soloistSetupAvailable,
    needsSetup: async () => {
        const status = await requestSoloistSetup('status');
        return Boolean(status?.enabled && !status.external && (!status.hasKey || !status.executable));
    },
    Component: lazy(() => import('./SoloistSetup')),
    command: {
        id: 'soloist-setup', title: 'Spotify Soloist setup', description: 'Configure the personal playback companion',
        keywords: ['api key', 'connect pairing', '播放器连接', '个人密钥', '配对'],
    },
} satisfies ProviderSetupEntry;
