import { useRef, useState, type FormEvent } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { api, controlSession } from '../api/client';
import { useControlAccess } from '../api/hooks';

export function ControlAccessPanel() {
  const access = useControlAccess();
  const mutations = useIsMutating();
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function enable(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !token) return;
    inFlight.current = true;
    setVerifying(true);
    setError('');
    const candidate = token;
    setToken('');
    try {
      await api.unlockControls(candidate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable controls.');
      void access.refetch();
    } finally {
      inFlight.current = false;
      setVerifying(false);
    }
  }

  return (
    <section aria-label="Container control access" className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
      {access.isPending ? <p>Checking control access…</p> : access.isError ? (
        <div className="flex items-center gap-3"><p>Control access unavailable. Monitoring remains available.</p><button onClick={() => void access.refetch()} className="underline">Retry</button></div>
      ) : !access.data?.configured ? (
        <p>Read-only dashboard. Container controls are not configured on the server.</p>
      ) : access.unlocked ? (
        <div className="flex items-center justify-between gap-3">
          <p>Container controls enabled for this page session.</p>
          <button disabled={mutations > 0} onClick={controlSession.lock} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50 dark:border-slate-600">Lock controls</button>
        </div>
      ) : (
        <form onSubmit={enable} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">Control token
            <input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} disabled={verifying} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <button type="submit" disabled={verifying || !token} className="rounded-lg bg-teal-700 px-3 py-2 text-white disabled:opacity-50">{verifying ? 'Checking…' : 'Enable controls'}</button>
          <p className="w-full text-xs text-slate-500 dark:text-slate-400">Token stays in memory and is cleared when this page reloads. Monitoring does not require it.</p>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
