// Receives feature frames from a local, process-specific Windows WASAPI capture.
// No audio samples or Spotify credentials cross Electron IPC.
export type SoloistCaptureFrame = {
    power: number;
    bass: number;
    lowMid: number;
    mid: number;
    vocal: number;
    treble: number;
    spectrum: number[];
};
let frame: SoloistCaptureFrame | null = null;
let lastAt = 0;
let installed = false;
export function latestSoloistCaptureFrame(): SoloistCaptureFrame | null {
    if (!installed) {
        installed = true;
        window.electron?.onSoloistAudioFrame?.(next => {
            frame = next;
            lastAt = performance.now();
        });
    }
    // Never leave a frozen spectrum behind when the capture helper exits.
    return frame && performance.now() - lastAt < 350 ? frame : null;
}
