import { providerSetups } from '../../login/providerSetupRegistry';
import { openLoginWindow } from '../../login/loginWindowStore';
import { defineCommand } from '../commandFactories';

// Setup actions open their existing account surface, where the user can review changes before saving.
export const providerSetupCommands = providerSetups.map(entry => defineCommand({
    ...entry.command,
    group: 'settings',
    platform: ['win'],
    isAvailable: entry.available,
    execute: () => {
        openLoginWindow(entry.providerId);
        return true;
    },
}));
