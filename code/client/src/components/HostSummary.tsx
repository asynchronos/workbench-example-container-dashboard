import { ResourceMeter } from './ResourceMeter';
import { useSummary } from '../api/hooks';
import { classifyTemp, useTempAlert, type TempLevel } from '../lib/tempAlerts';

function formatTemp(celsius: number | null): string {
  return celsius === null ? '—' : `${celsius.toFixed(0)}°C`;
}

function tempColor(level: TempLevel): string | undefined {
  if (level === 'critical') return 'text-red-600 dark:text-red-400';
  if (level === 'warning') return 'text-amber-600 dark:text-amber-400';
  return undefined;
}

// Highlights the whole tile (not just the number) so a hot sensor is noticeable even
// at a glance — critical also pulses since that's the level where action is needed.
function tempTone(level: TempLevel): string {
  if (level === 'critical') {
    return 'rounded-md px-2 py-1 ring-1 ring-red-300 bg-red-50 animate-pulse dark:bg-red-950/40 dark:ring-red-800';
  }
  if (level === 'warning') {
    return 'rounded-md px-2 py-1 ring-1 ring-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:ring-amber-800';
  }
  return '';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function Stat({
  label,
  value,
  warning,
  hint,
  valueClassName,
  tone,
}: {
  label: string;
  value: string;
  warning?: string;
  hint?: string;
  valueClassName?: string;
  tone?: string;
}) {
  return (
    <div className={`flex flex-col ${tone ?? ''}`}>
      <span className="text-xs text-slate-500 dark:text-slate-400" title={hint}>
        {label}
        {hint && <sup className="ml-0.5 text-slate-400 dark:text-slate-500">ⓘ</sup>}
      </span>
      <span className={`text-lg font-semibold ${valueClassName ?? 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </span>
      {warning && (
        <span
          title={warning}
          className="text-xs font-medium text-amber-600 dark:text-amber-400"
        >
          ⚠ unavailable
        </span>
      )}
    </div>
  );
}

export function HostSummary() {
  const { data, isLoading } = useSummary();

  const cpuLevel = classifyTemp(data?.cpuTempC ?? null);
  const gpuLevel = classifyTemp(data?.gpuTempC ?? null);
  useTempAlert('CPU temp', data?.cpuTempC ?? null);
  useTempAlert('GPU temp', data?.gpuTempC ?? null);

  if (isLoading || !data) {
    return <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Resource overview">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ResourceMeter label="Host memory" value={data.hostMemUsage} maximum={data.hostMemTotal ?? 0}
          display={data.hostMemUsage !== null && data.hostMemTotal !== null
            ? `${formatBytes(data.hostMemUsage)} / ${formatBytes(data.hostMemTotal)}` : 'Unavailable'}
          hint={data.unifiedMemory ? 'Shared CPU + GPU memory pool' : 'System-wide memory usage'} />
        <ResourceMeter label="CPU temperature" value={data.cpuTempC} display={formatTemp(data.cpuTempC)}
          hint="Scale 0–100°C · warning 75°C · critical 90°C" temperature />
        <ResourceMeter label="GPU temperature" value={data.gpuTempC} display={formatTemp(data.gpuTempC)}
          hint="Scale 0–100°C · warning 75°C · critical 90°C" temperature />
      </div>
    <div className="flex flex-wrap gap-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <Stat label="Running" value={String(data.running)} />
      <Stat label="Stopped" value={String(data.stopped)} />
      <Stat label="Paused" value={String(data.paused)} />
      <Stat label="Total" value={String(data.total)} />
      <Stat label="Total CPU" value={`${data.totalCpuPercent.toFixed(1)}%`} />
      {data.unifiedMemory && data.hostMemUsage !== null && data.hostMemTotal !== null ? (
        <>
          <Stat
            label="Unified Memory"
            value={`${formatBytes(data.hostMemUsage)} / ${formatBytes(data.hostMemTotal)}`}
            hint="True system-wide usage from the host — CPU and GPU share one coherent memory pool on this hardware, so this is the number that matches the DGX dashboard."
          />
          <Stat
            label="Container Mem"
            value={formatBytes(data.totalMemUsage)}
            hint="Sum of per-container cgroup memory stats only. On unified memory hardware this undercounts real usage, since GPU-resident allocations aren't fully reflected in a container's cgroup stats — see Unified Memory above for the true total."
          />
        </>
      ) : (
        <Stat
          label={data.unifiedMemory ? 'Container Mem' : 'Total Mem'}
          value={formatBytes(data.totalMemUsage)}
          hint={
            data.unifiedMemory
              ? 'Host-wide figure unavailable (/proc/meminfo unreadable) — showing the per-container cgroup sum only, which undercounts real usage on unified memory hardware.'
              : undefined
          }
        />
      )}
      <Stat
        label={data.unifiedMemory ? 'GPU-mapped' : 'GPU Mem'}
        value={data.gpuAvailable ? formatBytes(data.totalGpuMemUsage) : '—'}
        warning={
          data.gpuAvailable
            ? undefined
            : 'GPU memory data unavailable — nvidia-smi not found or errored'
        }
        hint={
          data.unifiedMemory
            ? 'GPU memory mapped by compute processes (containers + host) — drawn from the Unified Memory pool above, not a separate pool.'
            : undefined
        }
      />
      <Stat
        label="CPU Temp"
        value={formatTemp(data.cpuTempC)}
        valueClassName={tempColor(cpuLevel)}
        tone={tempTone(cpuLevel)}
        warning={data.cpuTempC === null ? 'CPU temperature unavailable — /sys/class/thermal unreadable' : undefined}
      />
      <Stat
        label="GPU Temp"
        value={formatTemp(data.gpuTempC)}
        valueClassName={tempColor(gpuLevel)}
        tone={tempTone(gpuLevel)}
        warning={data.gpuTempC === null ? 'GPU temperature unavailable — nvidia-smi not found or errored' : undefined}
      />
    </div>
    </section>
  );
}
