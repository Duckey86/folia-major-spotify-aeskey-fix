import React, { Suspense, useEffect } from 'react';
import type { OnlineProviderId } from '../../types/onlineMusic';
import { openLoginWindow, useLoginWindowStore } from './loginWindowStore';

// Provider-specific configuration belongs beside its UI; the login host only discovers entries.
export type ProviderSetupEntry = {
    providerId: OnlineProviderId;
    available: () => boolean;
    needsSetup: () => Promise<boolean>;
    Component: React.ComponentType;
    command: { id: string; title: string; description: string; keywords: string[] };
};

export const providerSetups = Object.values(import.meta.glob<{ default: ProviderSetupEntry }>('../*/setupEntry.tsx', { eager: true }))
    .map(entry => entry.default);

export const hasProviderSetup = (providerId: OnlineProviderId | null): boolean => providerSetups
    .some(entry => entry.providerId === providerId && entry.available());

export const ProviderSetup: React.FC<{ providerId: OnlineProviderId | null }> = ({ providerId }) => {
    const entry = providerSetups.find(candidate => candidate.providerId === providerId && candidate.available());
    return entry ? <Suspense fallback={null}><entry.Component /></Suspense> : null;
};

/** Open the existing account window once for an incomplete desktop setup, unless the user moved on. */
export function useProviderSetupOnboarding(): void {
    useEffect(() => {
        let active = true;
        const requestId = useLoginWindowStore.getState().requestId;
        void (async () => {
            for (const entry of providerSetups) {
                if (!entry.available() || !await entry.needsSetup()) continue;
                if (active && useLoginWindowStore.getState().requestId === requestId) openLoginWindow(entry.providerId);
                break;
            }
        })().catch(() => {});
        return () => { active = false; };
    }, []);
}
