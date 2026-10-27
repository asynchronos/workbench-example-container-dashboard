import { useEffect, useRef, useState } from 'react';
import { useContainer, useContainerActions, useContainers, useControlAccess } from '../api/hooks';
import { subscribeToStats, type ContainerStats, type StatsConnectionStatus } from '../api/client';
import { ResourceMeter } from './ResourceMeter';
import { LiveStatChart } from './LiveStatChart';
import { LogViewer } from './LogViewer';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';

interface ContainerDetailDrawerProps {
  containerId: string;
  onClose: () => void;
}

const MAX_SAMPLES = 60;

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

export function ContainerDetailDrawer({ containerId, onClose }: ContainerDetailDrawerProps) {
  const { data: inspect } = useContainer(containerId);
  const { data: containers } = useContainers();
  const { start, stop, restart, remove } = useContainerActions();
  const { showToast } = useToast();
  const { enabled: controlsEnabled } = useControlAccess();
  const actionInFlight = useRef(false);
  const isBusy = start.isPending || stop.isPending || restart.isPending || remove.isPending;

  const [latestStats, setLatestStats] = useState<ContainerStats | null>(null);
  const [streamStatus, setStreamStatus] = useState<StatsConnectionStatus>({ state: 'connecting', lastUpdated: null });
  const [tab, setTab] = useState<'metrics' | 'logs'>('metrics');
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'remove' | null>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmAction) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, confirmAction]);

  const summary = containers?.find((c) => c.id === containerId);
  const canStream = !summary || summary.state === 'running';

  useEffect(() => {
    setLatestStats(null);
    setCpuHistory([]);
    setMemHistory([]);
    setStreamStatus({ state: 'connecting', lastUpdated: null });
    if (!canStream) return;
    const unsubscribe = subscribeToStats(containerId, (stats: ContainerStats) => {
      setLatestStats(stats);
      setCpuHistory((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), stats.cpuPercent]);
      setMemHistory((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), stats.memUsage]);
    }, setStreamStatus);
    return unsubscribe;
  }, [containerId, canStream]);

  const runSimpleAction = (
    label: string,
    mutate: () => Promise<void>
  ) => {
    if (actionInFlight.current || isBusy || !controlsEnabled) return;
    actionInFlight.current = true;
    mutate()
      .then(() => showToast(`Container ${label}`, 'success'))
      .catch((err: Error) => showToast(err.message, 'error'))
      .finally(() => { actionInFlight.current = false; });
  };

  const confirmDestructive = () => {
    if (actionInFlight.current || isBusy || !controlsEnabled) return;
    if (confirmAction === 'stop') {
      runSimpleAction('stopped', () => stop.mutateAsync(containerId));
    } else if (confirmAction === 'remove') {
      actionInFlight.current = true;
      remove
        .mutateAsync({ id: containerId, force: false })
        .then(() => {
          showToast('Container removed', 'success');
          onClose();
        })
        .catch((err: Error) => showToast(err.message, 'error'))
        .finally(() => { actionInFlight.current = false; });
    }
    setConfirmAction(null);
  };

  const name = inspect?.Name.replace(/^\//, '') ?? summary?.name ?? containerId;
  const image = inspect?.Config.Image ?? summary?.image ?? '';
  const isRunning = summary?.state === 'running';
  const metricsAreStale = streamStatus.state !== 'live' && latestStats !== null;
  const streamLabel = !canStream
    ? `No live metrics — container is ${summary?.state}`
    : streamStatus.state === 'live' ? 'Live metrics'
    : streamStatus.state === 'reconnecting'
      ? `Reconnecting${metricsAreStale ? ' — values are stale' : ' — no metrics received'}`
    : streamStatus.state === 'disconnected'
      ? `Disconnected${metricsAreStale ? ' — values are stale' : ' — no metrics received'}`
    : streamStatus.state === 'stale'
      ? (metricsAreStale ? 'Waiting for fresh metrics — values are stale' : 'Metrics unavailable — no samples received')
    : 'Connecting — waiting for metrics';

  const ports = inspect
    ? Object.entries(inspect.NetworkSettings.Ports)
        .filter(([, v]) => v)
        .map(([containerPort, bindings]) => `${containerPort} → ${bindings![0].HostIp}:${bindings![0].HostPort}`)
    : [];

  const networks = inspect ? Object.keys(inspect.NetworkSettings.Networks) : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !confirmAction) onClose();
      }}>
      <div role="dialog" aria-label="Container details" className="flex h-full w-[calc(100%-1rem)] max-w-xl flex-col bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{name}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{image}</p>
            <p className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">
              {containerId.slice(0, 12)}
            </p>
            {ports.length > 0 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Ports: {ports.join(', ')}
              </p>
            )}
            {networks.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Networks: {networks.join(', ')}
              </p>
            )}
          </div>
          <button
            aria-label="Close container details"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2 border-b border-slate-200 px-4 pt-3 dark:border-slate-700">
          {(['metrics', 'logs'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t px-3 py-1.5 text-sm font-medium capitalize ${
                tab === t
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'metrics' ? (
            <div className="flex flex-col gap-4">
              <div aria-label="Metric stream status" className="text-xs text-slate-500 dark:text-slate-400">
                <p role="status" className={canStream && streamStatus.state === 'live'
                  ? 'font-medium text-emerald-700 dark:text-emerald-300'
                  : 'font-medium text-amber-700 dark:text-amber-300'}>{streamLabel}</p>
                {canStream && streamStatus.lastUpdated !== null && (
                  <p>Last update: <time dateTime={new Date(streamStatus.lastUpdated).toISOString()}>
                    {new Date(streamStatus.lastUpdated).toLocaleTimeString()}
                  </time></p>
                )}
              </div>
              <div className={`flex flex-col gap-4${metricsAreStale ? ' opacity-60' : ''}`}>
              <ResourceMeter label="Container memory" value={latestStats?.memUsage ?? null}
                maximum={latestStats?.memLimit ?? 0}
                display={latestStats ? `${formatBytes(latestStats.memUsage)} / ${formatBytes(latestStats.memLimit)}` : 'Waiting for metrics'}
                hint="Usage relative to the memory limit reported by Docker" />
              <LiveStatChart
                label="CPU %"
                values={cpuHistory}
                formatValue={(v) => `${v.toFixed(1)}%`}
                color="#3b82f6"
              />
              <LiveStatChart
                label="Memory"
                values={memHistory}
                formatValue={formatBytes}
                color="#8b5cf6"
              />
              </div>
            </div>
          ) : (
            <div className="h-full">
              <LogViewer containerId={containerId} />
            </div>
          )}
        </div>

        {!controlsEnabled && <p className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">Read-only. Enable controls above the container list to manage containers.</p>}
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
          <button
            disabled={!controlsEnabled || isBusy || isRunning}
            onClick={() => runSimpleAction('started', () => start.mutateAsync(containerId))}
            className="rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            Start
          </button>
          <button
            disabled={!controlsEnabled || isBusy || !isRunning}
            onClick={() => { if (controlsEnabled && !actionInFlight.current && !isBusy) setConfirmAction('stop'); }}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            Stop
          </button>
          <button
            disabled={!controlsEnabled || isBusy || !isRunning}
            onClick={() => runSimpleAction('restarted', () => restart.mutateAsync(containerId))}
            className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            Restart
          </button>
          <button
            disabled={!controlsEnabled || isBusy}
            onClick={() => { if (controlsEnabled && !actionInFlight.current && !isBusy) setConfirmAction('remove'); }}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Remove
          </button>
        </div>
      </div>

      {confirmAction && (
        <ConfirmDialog
          containerName={name}
          action={confirmAction}
          onConfirm={confirmDestructive}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
