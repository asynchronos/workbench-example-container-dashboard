import { useEffect, useState } from 'react';
import { HostSummary } from './components/HostSummary';
import { ContainerList } from './components/ContainerList';
import { ContainerDetailDrawer } from './components/ContainerDetailDrawer';
import { ToastProvider } from './components/Toast';
import { ControlAccessPanel } from './components/ControlAccessPanel';

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('dashboard-theme') !== 'light'; } catch { return true; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('dashboard-theme', dark ? 'dark' : 'light'); } catch { /* Storage may be unavailable. */ }
  }, [dark]);

  return (
    <ToastProvider>
      <div className="min-h-screen dashboard-shell p-4 sm:p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <header className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/80">
          <div><p className="text-xs uppercase tracking-widest text-teal-600 dark:text-teal-300">Docker · Local monitor</p>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Container Dashboard
          </h1></div>
          <button onClick={() => setDark((value) => !value)} aria-label="Toggle dark theme" aria-pressed={dark} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">{dark ? 'Light theme' : 'Dark theme'}</button>
          </header>
          <ControlAccessPanel />
          <HostSummary />
          <ContainerList onOpen={setSelectedId} />
        </div>
      </div>
      {selectedId && (
        <ContainerDetailDrawer key={selectedId} containerId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </ToastProvider>
  );
}
