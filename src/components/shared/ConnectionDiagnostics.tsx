import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Copy, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import Modal from './Modal';
import { RevenueCat, type RevenueCatDiagnostics } from '../../plugins/RevenueCat';
import {
  isSupabaseConfigured,
  supabaseConfigError,
  supabaseHost,
  probeSupabase,
} from '../../lib/supabase';

/**
 * Reports what the *shipped binary* actually contains, which is otherwise
 * invisible: env vars are inlined at build time and the API keys come from CI
 * secrets, so "sign-in says Load failed" and "the paywall says Error 11" are
 * indistinguishable from a bad connection unless something on the device says
 * which project and which kind of key this build was compiled against.
 *
 * Nothing here is a secret. Hosts are public (the Supabase URL ships in every
 * client bundle by design) and the RevenueCat key is reduced to its prefix.
 */

type Check = {
  label: string;
  ok: boolean | null; // null = still running
  detail: string;
};

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) return <Loader2 size={15} className="text-gray-400 animate-spin flex-shrink-0 mt-0.5" />;
  return ok
    ? <CheckCircle2 size={15} className="text-green-400 flex-shrink-0 mt-0.5" />
    : <XCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />;
}

export default function ConnectionDiagnostics({ onClose }: { onClose: () => void }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setCopied(false);

    const native = Capacitor.isNativePlatform();

    // Rendered immediately with the network-bound rows pending, so the panel is
    // useful before the probes finish.
    const initial: Check[] = [
      { label: 'Platform', ok: true, detail: native ? `iOS app (${Capacitor.getPlatform()})` : 'Web browser' },
      supabaseConfigError
        ? { label: 'Accounts config', ok: false, detail: supabaseConfigError }
        : isSupabaseConfigured
          ? { label: 'Accounts config', ok: true, detail: `Project ${supabaseHost}` }
          : { label: 'Accounts config', ok: false, detail: 'This build has no Supabase credentials, so sign-in and cloud sync are switched off. Everything else works offline.' },
      { label: 'Accounts server', ok: null, detail: 'Checking…' },
      ...(native ? [{ label: 'Purchases', ok: null, detail: 'Checking…' } as Check] : []),
    ];
    setChecks(initial);

    // Resolve rows by label rather than index — the Purchases row only exists
    // on native, so positions shift between platforms.
    const settle = (label: string, ok: boolean, detail: string) =>
      setChecks(prev => prev.map(c => (c.label === label ? { ...c, ok, detail } : c)));

    if (isSupabaseConfigured) {
      const probe = await probeSupabase();
      settle('Accounts server', probe.ok, probe.detail);
    } else {
      settle('Accounts server', false, 'Skipped — no project configured in this build.');
    }

    if (native) {
      try {
        const rc: RevenueCatDiagnostics = await RevenueCat.getDiagnostics();
        settle(
          'Purchases',
          rc.configured && rc.offeringsStatus.startsWith('ok'),
          [`API key: ${rc.keyPrefix}`, rc.configurationError || null, `Offerings: ${rc.offeringsStatus}`]
            .filter(Boolean)
            .join('\n'),
        );
      } catch (e) {
        settle('Purchases', false, e instanceof Error ? e.message : 'The purchases plugin did not respond.');
      }
    }

    setRunning(false);
  }, []);

  useEffect(() => { void run(); }, [run]);

  async function copyReport() {
    const report = checks.map(c => `${c.ok === false ? 'FAIL' : c.ok ? 'OK  ' : '... '} ${c.label}: ${c.detail}`).join('\n');
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const anyFailure = checks.some(c => c.ok === false);

  return (
    <Modal title="Connection diagnostics" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-gray-400">
          What this build is configured to talk to. Useful when sign-in or purchases fail —
          it separates a problem with this device&apos;s connection from a problem with the app build itself.
        </p>

        <div className="space-y-2">
          {checks.map(c => (
            <div key={c.label} className="flex items-start gap-2.5 bg-dark-700 rounded-xl p-3">
              <StatusIcon ok={c.ok} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{c.label}</p>
                <p className="text-xs text-gray-300 whitespace-pre-line break-words">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {anyFailure && !running && (
          <p className="text-xs text-gray-400 leading-relaxed">
            A failure above that mentions the build, an API key, or a project URL can only be fixed by
            shipping a new build — retrying on this device won&apos;t help.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => void run()}
            disabled={running}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-300 border border-dark-400 rounded-xl py-2.5 disabled:opacity-50"
          >
            <RefreshCw size={13} className={running ? 'animate-spin' : ''} /> Run again
          </button>
          <button
            onClick={() => void copyReport()}
            disabled={running}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-300 border border-dark-400 rounded-xl py-2.5 disabled:opacity-50"
          >
            <Copy size={13} /> {copied ? 'Copied' : 'Copy report'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
