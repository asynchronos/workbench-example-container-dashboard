import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { docker } from './docker.js';

const execFileAsync = promisify(execFile);

export interface GpuMemoryByContainer {
  // containerId -> GPU memory bytes attributed to that container
  byContainer: Map<string, number>;
  // GPU memory bytes used by processes that aren't inside any known container
  // (desktop sessions, host tooling, etc.)
  otherBytes: number;
  totalBytes: number;
  // False when nvidia-smi isn't present or errored out (no GPU on the host, the
  // NVIDIA Container Toolkit didn't inject it, etc.) — distinguishes "GPU data
  // unavailable" from "0 bytes in use" so the UI doesn't silently report a
  // healthy-looking zero.
  available: boolean;
  // True on Grace-based superchips (GH200, GB200, GB300, DGX Spark's GB10, ...) where
  // CPU and GPU share one coherent memory pool over NVLink-C2C. On these hosts,
  // gpu memory reported here is mapped out of the same physical pool the cgroup RAM
  // stats already count — it's a subset, not a second independent pool to add up.
  unifiedMemory: boolean;
}

// Grace-based superchips are named GH<n> (Grace Hopper) or GB<n> (Grace Blackwell) —
// e.g. "GH200 480GB", "NVIDIA GB200" — unlike discrete data-center/consumer GPUs
// (H100, A100, B200, L40S, RTX ...), which never carry that G-prefixed model code.
export function isUnifiedMemoryGpuName(name: string): boolean {
  return /\b(GH|GB)\d{2,3}\b/i.test(name);
}

let unifiedMemoryCache: Promise<boolean> | null = null;

// Hardware doesn't change at runtime, so this is resolved once and cached for the
// life of the process rather than re-invoking nvidia-smi on every poll.
async function detectUnifiedMemory(): Promise<boolean> {
  if (!unifiedMemoryCache) {
    unifiedMemoryCache = execFileAsync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'])
      .then(({ stdout }) => stdout.split('\n').some(isUnifiedMemoryGpuName))
      .catch(() => false);
  }
  return unifiedMemoryCache;
}

// Parses `nvidia-smi --query-compute-apps=pid,used_memory --format=csv,noheader,nounits`
// output into a host-PID -> MiB map. Returns an empty map (rather than throwing) for
// empty/blank input, so callers can degrade gracefully.
export function parseComputeApps(csv: string): Map<number, number> {
  const result = new Map<number, number>();
  for (const line of csv.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [pidStr, memStr] = trimmed.split(',').map((s) => s.trim());
    const pid = Number.parseInt(pidStr, 10);
    const mib = Number.parseFloat(memStr);
    if (Number.isFinite(pid) && Number.isFinite(mib)) {
      result.set(pid, mib);
    }
  }
  return result;
}

async function getGpuProcessMemoryMiB(): Promise<Map<number, number> | null> {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-compute-apps=pid,used_memory',
      '--format=csv,noheader,nounits',
    ]);
    return parseComputeApps(stdout);
  } catch {
    // nvidia-smi not on PATH (no GPU / toolkit not configured), or it errored out.
    return null;
  }
}

// dockerode's container.top() reports host-namespace PIDs (the same ones `ps` on the
// host sees). Because this container itself now runs with `pid: host`, the local
// nvidia-smi invocation above also resolves every process on the box in the same
// host PID namespace, so the two can be lined up directly.
async function getHostPidToContainerMap(containerIds: string[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  await Promise.all(
    containerIds.map(async (id) => {
      try {
        const top = await docker.getContainer(id).top();
        const pidIndex = top.Titles.indexOf('PID');
        if (pidIndex === -1) return;
        for (const row of top.Processes) {
          const pid = Number.parseInt(row[pidIndex], 10);
          if (Number.isFinite(pid)) result.set(pid, id);
        }
      } catch {
        // Container may have exited between listContainers() and top().
      }
    })
  );
  return result;
}

export async function getGpuMemoryByContainer(): Promise<GpuMemoryByContainer> {
  const [processMemMiB, containers, unifiedMemory] = await Promise.all([
    getGpuProcessMemoryMiB(),
    docker.listContainers({ all: false }),
    detectUnifiedMemory(),
  ]);

  const byContainer = new Map<string, number>();
  if (processMemMiB === null) {
    return { byContainer, otherBytes: 0, totalBytes: 0, available: false, unifiedMemory };
  }

  const pidToContainer = await getHostPidToContainerMap(containers.map((c) => c.Id));

  let otherBytes = 0;
  let totalBytes = 0;

  for (const [pid, mib] of processMemMiB) {
    const bytes = mib * 1024 * 1024;
    totalBytes += bytes;
    const containerId = pidToContainer.get(pid);
    if (containerId) {
      byContainer.set(containerId, (byContainer.get(containerId) ?? 0) + bytes);
    } else {
      otherBytes += bytes;
    }
  }

  return { byContainer, otherBytes, totalBytes, available: true, unifiedMemory };
}
