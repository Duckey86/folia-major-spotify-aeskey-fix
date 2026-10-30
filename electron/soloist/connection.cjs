'use strict';

const { WebSocket } = require('ws');

// Observe authentication independently of playback; never forward daemon messages or credentials.
function createSoloistConnection({ update, createSocket = url => new WebSocket(url), timers = globalThis }) {
    let socket = null;
    let retry = null;
    let deadline = null;
    let pairing = null;
    let active = false;

    function stop() {
        active = false;
        timers.clearTimeout(retry);
        timers.clearTimeout(deadline);
        timers.clearTimeout(pairing);
        retry = null;
        deadline = null;
        pairing = null;
        const previous = socket;
        socket = null;
        previous?.terminate();
    }

    function connect() {
        if (!active) return;
        const current = createSocket('ws://127.0.0.1:9090');
        socket = current;
        let answered = false;
        const timeout = timers.setTimeout(() => current.terminate(), 3000);
        current.on('message', bytes => {
            if (!active || socket !== current || bytes.length > 16384) return;
            let event;
            try { event = JSON.parse(String(bytes)); } catch { return; }
            if (event.type !== 'auth_state' || typeof event.logged_in !== 'boolean') return;
            answered = true;
            timers.clearTimeout(timeout);
            timers.clearTimeout(deadline);
            if (event.logged_in) {
                timers.clearTimeout(pairing);
                pairing = null;
                update('connected', null);
            } else {
                update('waiting-for-pairing', null);
                if (!pairing) pairing = timers.setTimeout(() => {
                    update('error', 'pairing-timeout');
                }, 120000);
            }
        });
        // Network errors contain no useful user-facing fact beyond an unavailable local endpoint.
        current.on('error', () => {});
        current.on('close', () => {
            timers.clearTimeout(timeout);
            if (!active || socket !== current) return;
            socket = null;
            if (answered) {
                timers.clearTimeout(pairing);
                pairing = null;
                update('error', 'connection-lost');
            }
            retry = timers.setTimeout(connect, 1500);
        });
    }

    function start() {
        stop();
        active = true;
        update('starting', null);
        deadline = timers.setTimeout(() => update('error', 'startup-timeout'), 15000);
        connect();
    }

    return { start, stop };
}

module.exports = { createSoloistConnection };
