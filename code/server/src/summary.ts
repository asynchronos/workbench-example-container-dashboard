import { docker } from './docker.js';
import { computeStats, type RawDockerStats } from './stats.js';
import { getGpuMemoryByContainer } from './gpu.js';
import { getHostMemoryUsage } from './hostMemory.js';
import { getCpuTemperatureC, getGpuTemperatureC } from './hwTemps.js';

export interface HostSummary {
  running: number;
  stopped: number;
  paused: number;
  total: number;
  totalCpuPercent: number;
  totalMemUsage: number;
  totalGpuMemUsage: number;
  otherGpuMemUsage: number;
  gpuAvailable: boolean;
  unifiedMemory: boolean;
  // Only populated when unifiedMemory is true: true system-wide memory usage from
  // /proc/meminfo, since per-container cgroup sums (totalMemUsage) badly undercount
  // GPU-resident allocations on this architecture. Null if /proc/meminfo is unreadable.
  hostMemUsage: number | null;
  hostMemTotal: number | null;
  // Null when the underlying sensor is unreadable (no thermal zones / no nvidia-smi).
  cpuTempC: number | null;
  gpuTempC: number | null;
}

export async function getSummary(): Promise<HostSummary> {
  const containers = await docker.listContainers({ all: true });

  let running = 0;
  let stopped = 0;
  let paused = 0;
  for (const c of containers) {
    if (c.State === 'running') running += 1;
    else if (c.State === 'paused') paused += 1;
    else stopped += 1;
  }

  const runningContainers = containers.filter((c) => c.State === 'running');
  const [snapshots, gpuMemory, gpuTempC] = await Promise.all([
    Promise.all(
      runningContainers.map(async (c) => {
        try {
          const raw = (await docker.getContainer(c.Id).stats({ stream: false })) as unknown as RawDockerStats;
          return computeStats(raw);
        } catch {
          return null;
        }
      })
    ),
    getGpuMemoryByContainer(),
    getGpuTemperatureC(),
  ]);

  let totalCpuPercent = 0;
  let totalMemUsage = 0;
  for (const snap of snapshots) {
    if (!snap) continue;
    totalCpuPercent += snap.cpuPercent;
    totalMemUsage += snap.memUsage;
  }

  const hostMemory = gpuMemory.unifiedMemory ? getHostMemoryUsage() : null;

  return {
    running,
    stopped,
    paused,
    total: containers.length,
    totalCpuPercent,
    totalMemUsage,
    totalGpuMemUsage: gpuMemory.totalBytes,
    otherGpuMemUsage: gpuMemory.otherBytes,
    gpuAvailable: gpuMemory.available,
    unifiedMemory: gpuMemory.unifiedMemory,
    hostMemUsage: hostMemory?.usedBytes ?? null,
    hostMemTotal: hostMemory?.totalBytes ?? null,
    cpuTempC: getCpuTemperatureC(),
    gpuTempC,
  };
}
