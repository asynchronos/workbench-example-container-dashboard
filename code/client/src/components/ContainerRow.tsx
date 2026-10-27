import type { ContainerSummary } from '../api/client';

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

const STATE_BADGE: Record<string, string> = {
  running: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  exited: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  restarting: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

function StateBadge({ state }: { state: string }) {
  const cls = STATE_BADGE[state] ?? STATE_BADGE.exited;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>{state}</span>
  );
}

interface ContainerRowProps {
  container: ContainerSummary;
  onOpen: (id: string) => void;
  level: number;
}

export function ContainerRow({ container, onOpen, level }: ContainerRowProps) {
  return (
    <tr
      onClick={() => onOpen(container.id)}
      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
    >
      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
        <span style={{ paddingLeft: `${level * 1.25}rem` }} className="inline-flex items-center gap-1">
          {level > 0 && <span className="text-slate-400 dark:text-slate-600">↳</span>}
          {container.name}
        </span>
        {container.dependsOn.length > 0 && (
          <span
            className="ml-2 text-xs text-slate-400 dark:text-slate-600"
            title={`Depends on: ${container.dependsOn.join(', ')}`}
          >
            needs {container.dependsOn.length}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <StateBadge state={container.state} />
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{container.health ?? '—'}</td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{container.uptime}</td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
        {container.gpuMemUsage === null ? (
          <span title="GPU memory data unavailable" className="text-amber-600 dark:text-amber-400">
            ⚠
          </span>
        ) : container.gpuMemUsage > 0 ? (
          formatBytes(container.gpuMemUsage)
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        {container.ports.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {container.ports.map((port) => (
              <a
                key={port}
                href={`http://${window.location.hostname}:${port}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open service on port ${port}`}
                className="rounded px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/40"
              >
                :{port}
              </a>
            ))}
          </div>
        ) : (
          <span className="text-slate-400 dark:text-slate-600">—</span>
        )}
      </td>
    </tr>
  );
}
