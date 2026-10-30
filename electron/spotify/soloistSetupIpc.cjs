'use strict';

// Only Folia's main frame may configure the companion. No response contains the API key.
const LINKS = Object.freeze({
    key: 'https://developer.spotify.com/dashboard/soloist',
    downloads: 'https://developer.spotify.com/documentation/soloist/reference/downloads-and-updates',
    guide: 'https://developer.spotify.com/documentation/soloist',
});

function registerSoloistSetupIpc({ manager, ipcMain, dialog, shell, isTrusted }) {
    let mutation = Promise.resolve();
    ipcMain.handle('soloist-setup', async (event, action, payload) => {
        if (!isTrusted(event) || event.senderFrame !== event.sender.mainFrame) return null;
        try {
            if (!manager.status().enabled) return manager.status();
            if (action === 'status') return manager.status();
            if (action === 'open' && Object.hasOwn(LINKS, payload)) {
                await shell.openExternal(LINKS[payload]);
                return manager.status();
            }
            // Save/restart/selection are serialized so a second click cannot race process ownership.
            if (!['save', 'reconnect', 'choose-executable'].includes(action)) return null;
            const run = async () => {
                if (action === 'choose-executable') {
                    const reply = await dialog.showOpenDialog({
                        properties: ['openFile'], filters: [{ name: 'Soloist', extensions: ['exe'] }],
                    });
                    if (!reply.canceled && !manager.selectExecutable(reply.filePaths[0])) {
                        return { ...manager.status(), state: 'error', error: 'missing-executable' };
                    }
                    return manager.status();
                }
                if (action === 'save') {
                    if (payload !== undefined && typeof payload !== 'string') return null;
                    return manager.save(payload);
                }
                return manager.reconnect();
            };
            const result = mutation.then(run);
            mutation = result.catch(() => {});
            return await result;
        } catch {
            // OS and spawn errors may embed command arguments. Never serialize or log them.
            return { enabled: true, state: 'error', error: 'setup-failed' };
        }
    });
}

module.exports = { registerSoloistSetupIpc, LINKS };
