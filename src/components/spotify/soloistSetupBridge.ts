// Platform-specific desktop configuration stays outside the provider data API; credentials cross only preload IPC.
export type SoloistStatus = {
    enabled: boolean;
    state: 'not-configured' | 'starting' | 'waiting-for-pairing' | 'connected' | 'error';
    error: string | null;
    hasKey: boolean;
    executable: string | null;
    persistentKey: boolean;
    external: boolean;
};

export type SoloistAction = 'status' | 'save' | 'reconnect' | 'choose-executable' | 'open';
export type SoloistRequest = (action: SoloistAction, payload?: string) => Promise<SoloistStatus | null>;

export const requestSoloistSetup: SoloistRequest = async (action, payload) => (
    await window.electron?.soloistSetup?.(action, payload) as SoloistStatus | null ?? null
);

export const soloistSetupAvailable = (): boolean => import.meta.env.VITE_FOLIA_SOLOIST === '1'
    && typeof window !== 'undefined'
    && typeof window.electron?.soloistSetup === 'function';
