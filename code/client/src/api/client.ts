export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health: string | null;
  created: number;
  uptime: string;
  ports: number[];
  gpuMemUsage: number | null;
  composeProject: string | null;
  composeService: string | null;
  dependsOn: string[];
}

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
  hostMemUsage: number | null;
  hostMemTotal: number | null;
  cpuTempC: number | null;
  gpuTempC: number | null;
}

export interface ContainerStats {
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  netRx: number;
  netTx: number;
  blockRead: number;
  blockWrite: number;
}

// Subset of dockerode's ContainerInspectInfo used by the detail drawer header.
export interface ContainerInspect {
  Id: string;
  Name: string;
  Config: { Image: string };
  NetworkSettings: {
    Ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
    Networks: Record<string, { IPAddress: string }>;
  };
  Mounts: { Type: string; Source: string; Destination: string }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Memory only: never store the control token in storage, URLs or build settings.
let controlToken: string | null = null;
const controlListeners = new Set<() => void>();
function setControlToken(token: string | null) {
  controlToken = token;
  for (const notify of controlListeners) notify();
}
export const controlSession = {
  subscribe: (notify: () => void) => {
    controlListeners.add(notify);
    return () => { controlListeners.delete(notify); };
  },
  isUnlocked: () => controlToken !== null,
  lock: () => setControlToken(null),
};

async function controlRequest(path: string, method: 'POST' | 'DELETE'): Promise<void> {
  if (!controlToken) throw new ApiError(401, 'Enable controls with a control token first.');
  try {
    await request<void>(path, { method, headers: { Authorization: `Bearer ${controlToken}` } });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 503)) setControlToken(null);
    throw err;
  }
}

export const api = {
  getControlAccess: () => request<{ configured: boolean }>('/control-access'),
  unlockControls: async (token: string) => {
    await request<void>('/control-access/verify', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    setControlToken(token);
  },
  listContainers: () => request<ContainerSummary[]>('/containers'),
  getContainer: (id: string) => request<ContainerInspect>(`/containers/${id}`),
  getSummary: () => request<HostSummary>('/summary'),
  startContainer: (id: string) => controlRequest(`/containers/${encodeURIComponent(id)}/start`, 'POST'),
  stopContainer: (id: string) => controlRequest(`/containers/${encodeURIComponent(id)}/stop`, 'POST'),
  restartContainer: (id: string) => controlRequest(`/containers/${encodeURIComponent(id)}/restart`, 'POST'),
  removeContainer: (id: string, force = false) =>
    controlRequest(`/containers/${encodeURIComponent(id)}?force=${force}`, 'DELETE'),
};

export type StatsConnectionState = 'connecting' | 'live' | 'reconnecting' | 'disconnected' | 'stale';
export interface StatsConnectionStatus {
  state: StatsConnectionState;
  // Browser receipt time of the last valid sample, never the connection-open time.
  lastUpdated: number | null;
}

export const STATS_STALE_AFTER_MS = 10_000;
const STAT_FIELDS: (keyof ContainerStats)[] = [
  'cpuPercent', 'memUsage', 'memLimit', 'netRx', 'netTx', 'blockRead', 'blockWrite',
];

export function subscribeToStats(
  id: string,
  onMessage: (stats: ContainerStats) => void,
  onStatus?: (status: StatsConnectionStatus) => void
): () => void {
  const source = new EventSource(`/api/containers/${encodeURIComponent(id)}/stats`);
  let active = true;
  let lastUpdated: number | null = null;
  let staleTimer: ReturnType<typeof setTimeout>;
  const report = (state: StatsConnectionState) => {
    if (active) onStatus?.({ state, lastUpdated });
  };
  const watchForSamples = () => {
    clearTimeout(staleTimer);
    staleTimer = setTimeout(() => report('stale'), STATS_STALE_AFTER_MS);
  };
  report('connecting');
  watchForSamples();
  source.onopen = () => {
    if (!active) return;
    // A successful reconnect is not proof that the old sample is current.
    report(lastUpdated === null ? 'connecting' : 'stale');
    watchForSamples();
  };
  source.onerror = () => {
    if (!active) return;
    clearTimeout(staleTimer);
    report(source.readyState === EventSource.CLOSED ? 'disconnected' : 'reconnecting');
    // EventSource owns retries; creating another source here would duplicate them.
  };
  source.onmessage = (event) => {
    if (!active) return;
    let stats: ContainerStats;
    try {
      const value: unknown = JSON.parse(event.data);
      if (!value || typeof value !== 'object' || !STAT_FIELDS.every((field) =>
        typeof (value as ContainerStats)[field] === 'number' &&
        Number.isFinite((value as ContainerStats)[field])
      )) throw new Error('Invalid metric sample');
      stats = value as ContainerStats;
    } catch {
      report('stale');
      return;
    }
    lastUpdated = Date.now();
    report('live');
    watchForSamples();
    onMessage(stats);
  };
  return () => {
    active = false;
    clearTimeout(staleTimer);
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
    source.close();
  };
}

export function subscribeToLogs(
  id: string,
  tail: number,
  onLine: (line: string) => void
): () => void {
  const source = new EventSource(`/api/containers/${id}/logs?tail=${tail}`);
  source.onmessage = (event) => {
    onLine(JSON.parse(event.data) as string);
  };
  return () => source.close();
}
