interface ContainerState {
  Running?: boolean;
  StartedAt?: string;
}

interface ListedContainer {
  Id: string;
  State: string;
}

const CACHE_MS = 15_000;
const CONCURRENCY = 4;
const UNAVAILABLE = '—';

function formatUptime(startedAt: number | null, now: number): string {
  if (startedAt === null || startedAt <= 0 || startedAt > now) return UNAVAILABLE;
  const seconds = Math.floor((now - startedAt) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Keep only start timestamps, not inspect objects (which can contain secrets).
// A shared queue bounds inspection load even when list requests overlap.
export function createUptimeResolver(
  inspectState: (id: string) => Promise<ContainerState>,
  now: () => number = Date.now
) {
  const cache = new Map<string, {
    state: string;
    expiresAt: number;
    startedAt: Promise<number | null>;
  }>();
  let active = 0;
  const waiting: (() => void)[] = [];

  async function inspect(id: string): Promise<number | null> {
    if (active >= CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      const state = await inspectState(id);
      const startedAt = Date.parse(state.StartedAt ?? '');
      return state.Running && Number.isFinite(startedAt) && startedAt > 0 && startedAt <= now()
        ? startedAt : null;
    } catch {
      // Containers can disappear or stop between list and inspect.
      return null;
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }

  return async (containers: ListedContainer[]): Promise<Map<string, string>> => {
    const ids = new Set(containers.map((c) => c.Id));
    for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    return new Map(await Promise.all(containers.map(async (container): Promise<[string, string]> => {
      const { Id: id, State: state } = container;
      if (state !== 'running' && state !== 'paused') {
        cache.delete(id);
        return [id, UNAVAILABLE];
      }
      let entry = cache.get(id);
      if (!entry || entry.state !== state || entry.expiresAt <= now()) {
        entry = { state, expiresAt: Infinity, startedAt: inspect(id) };
        cache.set(id, entry);
        const current = entry;
        // Failed/invalid lookups are cached too, avoiding a retry storm.
        void current.startedAt.then(() => { current.expiresAt = now() + CACHE_MS; });
      }
      return [id, formatUptime(await entry.startedAt, now())];
    })));
  };
}
