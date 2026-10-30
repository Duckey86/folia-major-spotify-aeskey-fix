import { useCallback, useEffect, useRef, useState } from 'react';
import { requestSoloistSetup, type SoloistAction, type SoloistRequest, type SoloistStatus } from './soloistSetupBridge';

// Poll sanitized platform status only while the account window is open. Never retain a key in a store.
export function useSoloistSetup(request: SoloistRequest = requestSoloistSetup) {
    const [status, setStatus] = useState<SoloistStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const live = useRef(false);
    const mutating = useRef(false);
    const revision = useRef(0);

    useEffect(() => {
        let active = true;
        live.current = true;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            const started = revision.current;
            try {
                const next = await request('status');
                if (!next) throw new Error('unavailable');
                if (active && !mutating.current && started === revision.current && next) {
                    setStatus(next);
                    if (next.state === 'connected') setError(null);
                }
            } catch {
                if (active) setError('setup-failed');
            }
            if (active) timer = setTimeout(poll, 1500);
        };
        void poll();
        return () => { active = false; live.current = false; clearTimeout(timer); };
    }, [request]);

    const run = useCallback(async (action: SoloistAction, payload?: string) => {
        if (mutating.current) return false;
        mutating.current = true;
        revision.current += 1;
        setBusy(true);
        setError(null);
        try {
            const next = await request(action, payload);
            if (!next) throw new Error('unavailable');
            if (live.current) {
                setStatus(previous => ({ ...previous, ...next }));
                setError(next.error);
            }
            return !next.error;
        } catch {
            if (live.current) setError('setup-failed');
            return false;
        } finally {
            mutating.current = false;
            revision.current += 1;
            if (live.current) setBusy(false);
        }
    }, [request]);

    return { status, busy, error, run };
}
