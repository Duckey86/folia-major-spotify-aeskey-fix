import { afterEach, describe, expect, it, vi } from 'vitest';
import entry from '../../../src/components/spotify/setupEntry';

// The registered login entry prompts only incomplete setups, and never reads back a credential.
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Soloist setup discovery', () => {
    function desktop(patch = {}) {
        vi.stubEnv('VITE_FOLIA_SOLOIST', '1');
        const request = vi.fn(async () => ({ enabled: true, external: false, hasKey: false, executable: null, ...patch }));
        vi.stubGlobal('window', { electron: { soloistSetup: request } });
        return request;
    }

    it('offers onboarding for a new user through the registered account entry', async () => {
        const request = desktop();
        expect(entry.available()).toBe(true);
        expect(await entry.needsSetup()).toBe(true);
        expect(request).toHaveBeenCalledWith('status', undefined);
    });

    it('skips onboarding when the saved key and executable already exist', async () => {
        desktop({ hasKey: true, executable: 'C:\\Soloist\\soloist.exe' });
        expect(await entry.needsSetup()).toBe(false);
    });

    it('skips onboarding for an externally managed Soloist instance', async () => {
        desktop({ external: true });
        expect(await entry.needsSetup()).toBe(false);
    });

    it('returns users to setup if their selected executable went missing', async () => {
        desktop({ hasKey: true });
        expect(await entry.needsSetup()).toBe(true);
    });

    it('keeps onboarding out of web, disabled and unsupported desktop builds', async () => {
        desktop({ enabled: false });
        expect(await entry.needsSetup()).toBe(false);
        vi.stubEnv('VITE_FOLIA_SOLOIST', '0');
        expect(entry.available()).toBe(false);
        vi.stubGlobal('window', {});
        vi.stubEnv('VITE_FOLIA_SOLOIST', '1');
        expect(entry.available()).toBe(false);
    });
});
