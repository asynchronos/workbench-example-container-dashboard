import { Fragment } from 'react';
import { useContainers, useSummary } from '../api/hooks';
import { ContainerRow } from './ContainerRow';
import { groupByProjectHierarchy } from '../lib/containerHierarchy';

interface ContainerListProps {
  onOpen: (id: string) => void;
}

export function ContainerList({ onOpen }: ContainerListProps) {
  const { data, isLoading, error } = useContainers();
  const { data: summary } = useSummary();

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
        Failed to load containers: {(error as Error).message}
      </div>
    );
  }

  const groups = groupByProjectHierarchy(data ?? []);
  const showGroupHeaders = groups.length > 1 || groups[0]?.project !== '(standalone)';

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Health</th>
            <th className="px-3 py-2">Uptime</th>
            <th
              className="px-3 py-2"
              title={
                summary?.unifiedMemory
                  ? 'GPU memory mapped from this host’s unified memory pool — a subset of container RAM, not a separate pool'
                  : undefined
              }
            >
              {summary?.unifiedMemory ? 'GPU-mapped' : 'GPU Mem'}
            </th>
            <th className="px-3 py-2">Service</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.project}>
              {showGroupHeaders && (
                <tr className="bg-slate-100 dark:bg-slate-800/80">
                  <th
                    colSpan={6}
                    className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {group.project === '(standalone)' ? 'Standalone' : group.project}
                  </th>
                </tr>
              )}
              {group.rows.map(({ container, level }) => (
                <ContainerRow key={container.id} container={container} onOpen={onOpen} level={level} />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
