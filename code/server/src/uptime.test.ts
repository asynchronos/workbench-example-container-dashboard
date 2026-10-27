import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUptimeResolver } from './uptime.js';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const running = (Id = 'fixture') => ({ Id, State: 'running' });
const state = (startedAt: number) => ({ Running: true, StartedAt: new Date(startedAt).toISOString() });

test('uptime uses the last start, never the older container creation time', async () => {
  const resolve = createUptimeResolver(async () => state(NOW - 5 * 60_000), () => NOW);
  const container = { ...running(), Created: NOW / 1000 - 30 * 86400 };
  assert.equal((await resolve([container])).get('fixture'), '5m');
});

test('formats minute, hour and day durations including paused wall-clock uptime', async () => {
  const starts = new Map([['minutes', NOW - 30_000], ['hours', NOW - 3_780_000], ['paused', NOW - 90_000_000]]);
  const resolve = createUptimeResolver(async (id) => state(starts.get(id)!), () => NOW);
  assert.deepEqual(await resolve([
    running('minutes'), running('hours'), { Id: 'paused', State: 'paused' },
  ]), new Map([['minutes', '0m'], ['hours', '1h 3m'], ['paused', '1d 1h']]));
});

test('non-running containers show unavailable without an inspect', async () => {
  let calls = 0;
  const resolve = createUptimeResolver(async () => { calls++; return state(NOW); }, () => NOW);
  const result = await resolve(['created', 'exited', 'dead', 'restarting'].map((State) => ({ Id: State, State })));
  assert.deepEqual([...result.values()], ['—', '—', '—', '—']);
  assert.equal(calls, 0);
});

test('invalid, missing, zero, future and stopped inspect states are unavailable; failures are isolated', async () => {
  const responses = new Map([
    ['invalid', { Running: true, StartedAt: 'not-a-date' }],
    ['missing', { Running: true }],
    ['zero', { Running: true, StartedAt: '0001-01-01T00:00:00Z' }],
    ['future', state(NOW + 60_000)],
    ['stopped', { ...state(NOW - 60_000), Running: false }],
    ['ok', state(NOW - 120_000)],
  ]);
  const resolve = createUptimeResolver(async (id) => {
    if (id === 'failed') throw new Error('synthetic inspect failure');
    return responses.get(id)!;
  }, () => NOW);
  const result = await resolve([...responses.keys(), 'failed'].map(running));
  for (const id of ['invalid', 'missing', 'zero', 'future', 'stopped', 'failed']) assert.equal(result.get(id), '—');
  assert.equal(result.get('ok'), '2m');
});

test('cache stores timestamps so displayed duration advances without inspecting each poll', async () => {
  let now = NOW;
  let calls = 0;
  const resolve = createUptimeResolver(async () => { calls++; return state(NOW - 55_000); }, () => now);
  assert.equal((await resolve([running()])).get('fixture'), '0m');
  now += 5_000;
  assert.equal((await resolve([running()])).get('fixture'), '1m');
  assert.equal(calls, 1);
});

test('external restarts are refreshed at expiry and failures retry after the short TTL', async () => {
  let now = NOW;
  let calls = 0;
  let startedAt = NOW - 3_600_000;
  const resolve = createUptimeResolver(async () => {
    calls++;
    if (calls === 3) throw new Error('synthetic failure');
    return state(startedAt);
  }, () => now);
  assert.equal((await resolve([running()])).get('fixture'), '1h 0m');
  startedAt = NOW;
  now += 14_999;
  assert.equal((await resolve([running()])).get('fixture'), '1h 0m');
  assert.equal(calls, 1);
  now++;
  assert.equal((await resolve([running()])).get('fixture'), '0m');
  assert.equal(calls, 2);
  now += 15_000;
  assert.equal((await resolve([running()])).get('fixture'), '—');
  await resolve([running()]);
  assert.equal(calls, 3);
  now += 15_000;
  assert.equal((await resolve([running()])).get('fixture'), '0m');
  assert.equal(calls, 4);
});

test('stopping, pausing or removing a listed container invalidates its cached start', async () => {
  let calls = 0;
  const resolve = createUptimeResolver(async () => { calls++; return state(NOW - calls * 60_000); }, () => NOW);
  await resolve([running()]);
  await resolve([{ Id: 'fixture', State: 'exited' }]);
  assert.equal((await resolve([running()])).get('fixture'), '2m');
  assert.equal((await resolve([{ Id: 'fixture', State: 'paused' }])).get('fixture'), '3m');
  await resolve([]);
  assert.equal((await resolve([running()])).get('fixture'), '4m');
});

test('overlapping polls share lookups and limit inspections to four globally', async () => {
  let active = 0;
  let peak = 0;
  const calls = new Map<string, number>();
  const releases: (() => void)[] = [];
  const resolve = createUptimeResolver(async (id) => {
    active++;
    peak = Math.max(peak, active);
    calls.set(id, (calls.get(id) ?? 0) + 1);
    await new Promise<void>((release) => releases.push(release));
    active--;
    return state(NOW - 60_000);
  }, () => NOW);
  const containers = Array.from({ length: 10 }, (_, i) => running(String(i)));
  const first = resolve(containers);
  const second = resolve(containers);
  const third = resolve([running('extra-a'), running('extra-b')]);
  assert.equal(active, 4);
  for (let batch = 0; batch < 3; batch++) {
    releases.splice(0).forEach((release) => release());
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  const [a, b, c] = await Promise.all([first, second, third]);
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.deepEqual(a, b);
  assert.deepEqual([...c.values()], ['1m', '1m']);
  assert.equal(calls.size, 12);
  assert.ok([...calls.values()].every((count) => count === 1));
});
