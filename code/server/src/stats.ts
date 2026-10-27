export interface RawDockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number; percpu_usage?: number[] };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number; percpu_usage?: number[] };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage: number;
    limit: number;
    stats?: {
      cache?: number;
      total_inactive_file?: number;
      inactive_file?: number;
    };
  };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio_stats?: {
    io_service_bytes_recursive?: { op: string; value: number }[];
  };
}

export interface ComputedStats {
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  netRx: number;
  netTx: number;
  blockRead: number;
  blockWrite: number;
}

export function computeCpuPercent(raw: RawDockerStats): number {
  const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
  const systemDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
  const onlineCpus = raw.cpu_stats.online_cpus ?? raw.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;

  // The first frame of a streaming stats() call often has an empty/zeroed precpu_stats
  // (no prior sample yet to diff against), which can produce NaN here — guard explicitly
  // since JSON.stringify silently turns NaN into `null` rather than throwing.
  if (!Number.isFinite(systemDelta) || !Number.isFinite(cpuDelta) || systemDelta <= 0 || cpuDelta < 0) {
    return 0;
  }

  return (cpuDelta / systemDelta) * onlineCpus * 100;
}

// Mirrors the Docker CLI's own memory calculation (moby/cli calculateMemUsageUnixNoCache):
// cgroup v1 hosts expose `total_inactive_file`, cgroup v2 hosts expose `inactive_file`
// instead of `cache`. Falling back to raw `stats.cache` keeps older cgroup v1 hosts working.
export function computeMemUsage(raw: RawDockerStats): { memUsage: number; memLimit: number } {
  const { usage } = raw.memory_stats;
  const s = raw.memory_stats.stats ?? {};

  let inactive: number | undefined;
  if (s.total_inactive_file !== undefined && s.total_inactive_file < usage) {
    inactive = s.total_inactive_file;
  } else if (s.inactive_file !== undefined && s.inactive_file < usage) {
    inactive = s.inactive_file;
  } else if (s.cache !== undefined) {
    inactive = s.cache;
  }

  return {
    memUsage: inactive !== undefined ? usage - inactive : usage,
    memLimit: raw.memory_stats.limit,
  };
}

export function computeNet(raw: RawDockerStats): { netRx: number; netTx: number } {
  const networks = raw.networks ?? {};
  let netRx = 0;
  let netTx = 0;
  for (const iface of Object.values(networks)) {
    netRx += iface.rx_bytes;
    netTx += iface.tx_bytes;
  }
  return { netRx, netTx };
}

export function computeBlockIO(raw: RawDockerStats): { blockRead: number; blockWrite: number } {
  const entries = raw.blkio_stats?.io_service_bytes_recursive ?? [];
  let blockRead = 0;
  let blockWrite = 0;
  for (const entry of entries) {
    const op = entry.op.toLowerCase();
    if (op === 'read') blockRead += entry.value;
    if (op === 'write') blockWrite += entry.value;
  }
  return { blockRead, blockWrite };
}

export function computeStats(raw: RawDockerStats): ComputedStats {
  const { memUsage, memLimit } = computeMemUsage(raw);
  const { netRx, netTx } = computeNet(raw);
  const { blockRead, blockWrite } = computeBlockIO(raw);
  return {
    cpuPercent: computeCpuPercent(raw),
    memUsage,
    memLimit,
    netRx,
    netTx,
    blockRead,
    blockWrite,
  };
}
