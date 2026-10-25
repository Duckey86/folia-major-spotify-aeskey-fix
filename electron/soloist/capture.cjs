'use strict';
// Local-only *analysis* stream. The helper captures Soloist's decoded samples,
// calculates spectral features and publishes these values; no PCM is saved or forwarded.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const SIGNALS = ['power', 'bass', 'lowMid', 'mid', 'vocal', 'treble'];

function parseCaptureFrame(line) {
  if (line.length > 8192) return null;
  let frame;
  try { frame = JSON.parse(line); } catch { return null; }
  if (!frame || !Array.isArray(frame.spectrum) || frame.spectrum.length !== 1024) return null;
  if (SIGNALS.some(key => !Number.isInteger(frame[key]) || frame[key] < 0 || frame[key] > 255)) return null;
  if (frame.spectrum.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return frame;
}

function createSoloistCaptureBridge({ app, BrowserWindow, processEnv = process.env,
                                     files = fs, startProcess = spawn, logger = console }) {
  let child = null;
  let output = '';
  const helper = () => {
    const fromEnv = processEnv.FOLIA_SOLOIST_CAPTURE_EXE;
    const candidates = [
      fromEnv && path.isAbsolute(fromEnv) ? fromEnv : null,
      app.isPackaged ? path.join(process.resourcesPath, 'soloist-capture', 'folia-soloist-capture.exe') : null,
      path.join(app.getAppPath(), 'build', 'soloist-capture', 'folia-soloist-capture.exe'),
    ];
    return candidates.find(filename => filename && files.existsSync(filename));
  };
  function start(pid = 0) {
    if (process.platform !== 'win32' || processEnv.FOLIA_SOLOIST_CAPTURE === '0') return false;
    if (child) return true;
    const exe = helper();
    if (!exe) {
      logger.warn('[Soloist capture] helper not built; music playback remains available without audio-reactive effects');
      return false;
    }
    output = '';
    // Explicit opt-in fallback: process-loopback INCLUDE currently produces
    // silence for Soloist on some Windows audio paths. In this mode, the native
    // helper uses --probe-all and sees other applications' sound as well.
    // Keep it OFF by default to avoid responding to unrelated private audio.
    const allAudio = processEnv.FOLIA_SOLOIST_CAPTURE_ALL_AUDIO === '1';
    if (allAudio) {
      logger.warn('[Soloist capture] SYSTEM-AUDIO fallback enabled: other applications can influence the visualizer. Only spectral data crosses IPC; no PCM is saved.');
    }
    const captureArg = allAudio ? '--probe-all' : String(pid || 0);
    const running = startProcess(exe, [captureArg], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: false,
    });
    child = running;
    running.stdout?.setEncoding('utf8');
    running.stdout?.on('data', data => {
      output += data;
      // A partial/unbounded line must never grow forever.
      if (output.length > 65536) { output = ''; return; }
      for (let index; (index = output.indexOf('\n')) !== -1;) {
        const line = output.slice(0, index).trim();
        output = output.slice(index + 1);
        const frame = parseCaptureFrame(line);
        if (!frame) continue;
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('soloist-audio-frame', frame);
          }
        }
      }
    });
    running.stderr?.setEncoding('utf8');
    running.stderr?.on('data', data => logger.info(`[Soloist capture] ${String(data).trim().slice(0, 400)}`));
    running.once('error', error => {
      if (child === running) child = null;
      logger.warn('[Soloist capture] helper launch failed:', error.code || error.message);
    });
    running.once('exit', code => {
      if (child === running) child = null;
      logger.info(`[Soloist capture] helper exited (${code})`);
    });
    return true;
  }
  function stop() {
    if (child) {
      const running = child;
      child = null;
      running.kill();
    }
  }
  return { start, stop, helper };
}
module.exports = { createSoloistCaptureBridge, parseCaptureFrame };
