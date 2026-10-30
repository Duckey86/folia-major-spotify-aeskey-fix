import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, ExternalLink, FolderOpen, KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '../modal/settings/kit/Button';
import { FIELD_CLASS } from '../modal/settings/kit/TextField';
import { useSoloistSetup } from './useSoloistSetup';
import type { SoloistRequest } from './soloistSetupBridge';

// The Soloist guide lives inside the existing account window; no parallel settings page or key store.
const SoloistSetup: React.FC<{ request?: SoloistRequest }> = ({ request }) => {
    const { t } = useTranslation();
    const { status, busy, error, run } = useSoloistSetup(request);
    const [apiKey, setApiKey] = useState('');
    const [editingKey, setEditingKey] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    if (status && !status.enabled) return null;
    const state = status?.state ?? 'starting';
    const needsSetup = status && !status.external && (!status.hasKey || !status.executable);
    const expanded = Boolean(needsSetup || showGuide || editingKey);
    const failure = error ?? status?.error;
    const save = async () => {
        const candidate = apiKey.trim();
        const saved = await run('save', candidate || undefined);
        // The main process keeps the key; clear the editable copy after every submission.
        setApiKey('');
        if (saved) setEditingKey(false);
    };
    const open = (link: 'key' | 'downloads' | 'guide') => { void run('open', link); };
    const step = (number: number, title: string, done: boolean, children: React.ReactNode) => (
        <li className="flex gap-3">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--st-fill)] text-xs text-[color:var(--st-t2)]">
                {done ? <Check size={14} /> : number}
            </span>
            <div className="min-w-0 flex-1 space-y-2"><h4 className="text-[13px] font-medium">{title}</h4>{children}</div>
        </li>
    );

    return (
        <section aria-label={t('soloist.title')} className="mb-6 space-y-4 border-b border-[var(--st-line)] pb-5 text-[color:var(--st-t1)]" data-testid="soloist-setup">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('soloist.title')}</h3>
                <span role="status" className={`text-xs ${failure ? 'text-[color:var(--st-err)]' : state === 'connected' ? 'text-[color:var(--st-ok)]' : 'text-[color:var(--st-t2)]'}`}>
                    {t(`soloist.states.${failure && state !== 'not-configured' ? 'error' : state}`)}
                </span>
            </div>
            <p className="text-xs leading-relaxed text-[color:var(--st-t2)]">{t('soloist.intro')}</p>
            {failure && <p role="alert" className="text-xs leading-relaxed text-[color:var(--st-err)]">{t(`soloist.errors.${failure}`, { defaultValue: t('soloist.errors.setup-failed') })}</p>}
            {status?.hasKey && !status.persistentKey && <p className="text-xs text-[color:var(--st-warn)]">{t('soloist.memoryOnly')}</p>}
            {status?.external && <p className="text-xs text-[color:var(--st-t2)]">{t('soloist.external')}</p>}
            {expanded && <ol className="space-y-5">
                {step(1, t('soloist.step1'), Boolean(status?.hasKey), <>
                    <p className="text-xs text-[color:var(--st-t2)]">{t('soloist.personalKey')}</p>
                    <Button variant="primary" icon={ExternalLink} disabled={busy} onClick={() => open('key')}>{t('soloist.generateKey')}</Button>
                </>)}
                {step(2, t('soloist.step2'), Boolean(status?.hasKey && !editingKey), <>
                    {status?.hasKey && !editingKey ? <p className="text-xs text-[color:var(--st-t2)]">{t('soloist.keySaved')}</p> : <label className="block space-y-2 text-xs">
                        <span>{t('soloist.apiKey')}</span>
                        <input type="password" autoComplete="off" spellCheck={false} maxLength={1024} value={apiKey} onChange={event => setApiKey(event.target.value)} disabled={busy} className={`${FIELD_CLASS} w-full px-2.5`} />
                    </label>}
                    <p className="text-xs text-[color:var(--st-t2)]">{t('soloist.keyPrivacy')}</p>
                </>)}
                {step(3, t('soloist.step3'), Boolean(status?.executable), <>
                    <p className="text-xs leading-relaxed text-[color:var(--st-t2)]">{t('soloist.executableHelp')}</p>
                    {status?.executable && <p className="break-all text-xs text-[color:var(--st-t2)]">{status.executable}</p>}
                    <div className="flex flex-wrap gap-2">
                        <Button icon={FolderOpen} disabled={busy} onClick={() => void run('choose-executable')}>{t('soloist.locate')}</Button>
                        <Button icon={Download} disabled={busy} onClick={() => open('downloads')}>{t('soloist.download')}</Button>
                    </div>
                </>)}
                {step(4, t('soloist.step4'), state === 'connected' || state === 'waiting-for-pairing', <Button variant="primary" disabled={busy || !status?.executable || ((!status.hasKey || editingKey) && !apiKey.trim())} onClick={() => void save()}>{t(busy ? 'soloist.saving' : 'soloist.saveStart')}</Button>)}
                {step(5, t('soloist.step5'), state === 'connected', <p className="text-xs leading-relaxed text-[color:var(--st-t2)]">{t('soloist.pairing')}</p>)}
            </ol>}
            {!expanded && state === 'waiting-for-pairing' && <p className="text-xs leading-relaxed text-[color:var(--st-t2)]">{t('soloist.pairing')}</p>}
            <div className="flex flex-wrap gap-2">
                {status?.hasKey && <Button icon={KeyRound} disabled={busy} onClick={() => { setApiKey(''); setEditingKey(value => !value); }}>{t(editingKey ? 'soloist.cancelKey' : 'soloist.changeKey')}</Button>}
                <Button icon={RefreshCw} disabled={busy || !status || state === 'starting'} onClick={() => void run('reconnect')}>{t('soloist.reconnect')}</Button>
                <Button disabled={busy} onClick={() => setShowGuide(value => !value)}>{t(showGuide ? 'soloist.hideGuide' : 'soloist.openGuide')}</Button>
                <Button icon={ExternalLink} disabled={busy} onClick={() => open('guide')}>{t('soloist.officialGuide')}</Button>
            </div>
            {failure === 'invalid-key' && <Button variant="primary" disabled={busy} onClick={() => { setEditingKey(true); open('key'); }}>{t('soloist.generateKey')}</Button>}
            {failure === 'build-expired' && <Button variant="primary" icon={Download} disabled={busy} onClick={() => { setShowGuide(true); open('downloads'); }}>{t('soloist.download')}</Button>}
            {failure === 'missing-executable' && !expanded && <Button icon={FolderOpen} disabled={busy} onClick={() => { setShowGuide(true); void run('choose-executable'); }}>{t('soloist.locate')}</Button>}
        </section>
    );
};

export default SoloistSetup;
