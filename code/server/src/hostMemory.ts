import { readFileSync } from 'node:fs';

export interface HostMemoryUsage {
  totalBytes: number;
  usedBytes: number;
}

// Parses /proc/meminfo's MemTotal/MemAvailable (both reported in kB) into a used/total
// snapshot. MemAvailable (not MemFree) is what `free`, htop, and most memory dashboards
// treat as "actually free" — it accounts for reclaimable cache/buffers — so used here
// is defined the same way: total minus available.
export function parseMemInfo(text: string): HostMemoryUsage | null {
  const totalMatch = text.match(/^MemTotal:\s+(\d+)\s*kB/m);
  const availableMatch = text.match(/^MemAvailable:\s+(\d+)\s*kB/m);
  if (!totalMatch || !availableMatch) return null;
  const totalBytes = Number.parseInt(totalMatch[1], 10) * 1024;
  const availableBytes = Number.parseInt(availableMatch[1], 10) * 1024;
  return { totalBytes, usedBytes: totalBytes - availableBytes };
}

// On unified-memory hosts, per-container cgroup memory stats badly undercount real
// usage — GPU-resident allocations don't fully show up in a process's cgroup RSS on
// this architecture. /proc/meminfo gives the true system-wide figure instead. This
// only reflects the host (rather than just this container) because docker-compose
// runs the dashboard with `pid: host`, which also shares the host's /proc mount.
export function getHostMemoryUsage(): HostMemoryUsage | null {
  try {
    return parseMemInfo(readFileSync('/proc/meminfo', 'utf-8'));
  } catch {
    return null;
  }
}
