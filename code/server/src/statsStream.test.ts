import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  subscribeToStats, STATS_STALE_AFTER_MS,
  type ContainerStats, type StatsConnectionStatus,
} from '../../client/src/api/client.js';

const sample: ContainerStats = {
  cpuPercent: 1.5, memUsage: 512, memLimit: 1024,
  netRx: 0, netTx: 0, blockRead: 0, blockWrite: 0,
};

class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closes = 0;
  constructor(readonly url: string) { FakeEventSource.instances.push(this); }
  close() { this.closes++; this.readyState = 2; }
  message(value: unknown = sample) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

function setup(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
  Object.defineProperty(globalThis, 'EventSource', { value: FakeEventSource, configurable: true });
  FakeEventSource.instances = [];
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000 });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'EventSource', original);
    else Reflect.deleteProperty(globalThis, 'EventSource');
  });
  const statuses: StatsConnectionStatus[] = [];
  const samples: ContainerStats[] = [];
  const close = subscribeToStats('fixture/id', value => samples.push(value), status => statuses.push(status));
  t.after(close);
  return { source: FakeEventSource.instances[0], statuses, samples, close };
}

test('stats stream waits for a valid sample before live, and timestamps sample receipt', (t) => {
  const { source, statuses, samples } = setup(t);
  assert.equal(source.url, '/api/containers/fixture%2Fid/stats');
  assert.deepEqual(statuses.at(-1), { state: 'connecting', lastUpdated: null });
  source.onopen?.();
  assert.deepEqual(statuses.at(-1), { state: 'connecting', lastUpdated: null });
  t.mock.timers.tick(500);
  source.message();
  assert.deepEqual(statuses.at(-1), { state: 'live', lastUpdated: 1_500 });
  assert.deepEqual(samples, [sample]);
});

test('stats stream marks silent connections stale and keeps the last successful sample time', (t) => {
  const { source, statuses } = setup(t);
  source.onopen?.();
  t.mock.timers.tick(STATS_STALE_AFTER_MS);
  assert.deepEqual(statuses.at(-1), { state: 'stale', lastUpdated: null });
  source.message();
  const updated = statuses.at(-1)!.lastUpdated;
  t.mock.timers.tick(STATS_STALE_AFTER_MS - 1);
  assert.equal(statuses.at(-1)!.state, 'live');
  t.mock.timers.tick(1);
  assert.deepEqual(statuses.at(-1), { state: 'stale', lastUpdated: updated });
  source.message();
  assert.deepEqual(statuses.at(-1), { state: 'live', lastUpdated: 21_000 });
});

test('stats stream reconnects using the same source and requires a fresh sample to recover', (t) => {
  const { source, statuses } = setup(t);
  source.message();
  source.onerror?.();
  assert.deepEqual(statuses.at(-1), { state: 'reconnecting', lastUpdated: 1_000 });
  t.mock.timers.tick(STATS_STALE_AFTER_MS * 2);
  assert.equal(statuses.at(-1)!.state, 'reconnecting');
  source.onopen?.();
  assert.deepEqual(statuses.at(-1), { state: 'stale', lastUpdated: 1_000 });
  source.message();
  assert.deepEqual(statuses.at(-1), { state: 'live', lastUpdated: 21_000 });
  assert.equal(FakeEventSource.instances.length, 1);
});

test('stats stream distinguishes a permanently closed source from automatic retries', (t) => {
  const { source, statuses } = setup(t);
  source.readyState = FakeEventSource.CLOSED;
  source.onerror?.();
  assert.deepEqual(statuses.at(-1), { state: 'disconnected', lastUpdated: null });
});

test('malformed metric frames never replace samples or advance the last-update time', (t) => {
  const { source, statuses, samples } = setup(t);
  source.message();
  t.mock.timers.tick(500);
  for (const data of ['bad json', 'null', '{}', JSON.stringify({ ...sample, cpuPercent: 'bad' }), '{"cpuPercent":1e999}']) {
    source.onmessage?.({ data });
    assert.deepEqual(statuses.at(-1), { state: 'stale', lastUpdated: 1_000 });
  }
  assert.deepEqual(samples, [sample]);
  source.message();
  assert.deepEqual(statuses.at(-1), { state: 'live', lastUpdated: 1_500 });
});

test('cleanup cancels timers, closes the source and ignores already queued old callbacks', (t) => {
  const { source, statuses, samples, close } = setup(t);
  const message = source.onmessage!;
  const open = source.onopen!;
  const error = source.onerror!;
  source.message();
  close();
  const count = statuses.length;
  message({ data: JSON.stringify({ ...sample, cpuPercent: 99 }) });
  open(); error();
  t.mock.timers.tick(STATS_STALE_AFTER_MS * 2);
  assert.equal(statuses.length, count);
  assert.deepEqual(samples, [sample]);
  assert.equal(source.closes, 1);
  assert.equal(source.onmessage, null);
  assert.equal(source.onopen, null);
  assert.equal(source.onerror, null);
});

test('existing two-argument stats subscriptions remain supported', (t) => {
  setup(t);
  let received: ContainerStats | undefined;
  const close = subscribeToStats('second', value => { received = value; });
  const source = FakeEventSource.instances[1];
  source.message();
  assert.deepEqual(received, sample);
  close();
});
