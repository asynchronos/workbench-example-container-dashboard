import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  computeCpuPercent,
  computeMemUsage,
  computeNet,
  computeBlockIO,
  computeStats,
  type RawDockerStats,
} from './stats.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): RawDockerStats {
  return JSON.parse(readFileSync(path.join(dir, 'fixtures', name), 'utf-8'));
}

// Fixtures captured live from `GET /containers/:id/stats?stream=false` on this host
// against the sibling dgx-ai-gateway stack (ollama, litellm), cross-checked against
// `docker stats --no-stream` output taken at the same time:
//   ollama:  CPUPerc=0.00%   MemUsage=581MiB / 100GiB
//   litellm: CPUPerc=0.14%   MemUsage=1.13GiB / 4GiB

test('computeCpuPercent returns 0 for an idle container with no cpu delta', () => {
  const raw = loadFixture('stats.sample.json');
  assert.equal(computeCpuPercent(raw), 0);
});

test('computeCpuPercent matches docker stats CLI within tolerance for an active container', () => {
  const raw = loadFixture('stats.sample2.json');
  const cpuPercent = computeCpuPercent(raw);
  // docker stats CLI reported 0.14% at the same instant.
  assert.ok(
    Math.abs(cpuPercent - 0.14) < 0.1,
    `expected ~0.14%, got ${cpuPercent}%`
  );
});

test('computeCpuPercent returns 0, not NaN, when precpu_stats is missing fields (first stream frame)', () => {
  const raw = loadFixture('stats.sample.json');
  const malformed: RawDockerStats = {
    ...raw,
    precpu_stats: {
      cpu_usage: { total_usage: 0 },
      system_cpu_usage: undefined as unknown as number,
    },
  };
  const cpuPercent = computeCpuPercent(malformed);
  assert.equal(cpuPercent, 0);
  assert.equal(JSON.stringify({ cpuPercent }), '{"cpuPercent":0}');
});

test('computeMemUsage subtracts inactive_file on cgroup v2 hosts (no `cache` field present)', () => {
  const raw = loadFixture('stats.sample.json');
  assert.equal(raw.memory_stats.stats?.cache, undefined);
  const { memUsage, memLimit } = computeMemUsage(raw);
  // usage(19318943744) - inactive_file(18709762048) = 609181696 bytes ~= 581 MiB
  assert.equal(memUsage, 609181696);
  assert.equal(memLimit, 107374182400);
});

test('computeMemUsage matches docker stats CLI MemUsage for a second container', () => {
  const raw = loadFixture('stats.sample2.json');
  const { memUsage } = computeMemUsage(raw);
  const expectedBytes = 1.13 * 1024 * 1024 * 1024;
  assert.ok(
    Math.abs(memUsage - expectedBytes) < 5 * 1024 * 1024,
    `expected ~1.13GiB, got ${memUsage} bytes`
  );
});

test('computeNet sums rx/tx bytes across all interfaces', () => {
  const raw = loadFixture('stats.sample.json');
  const { netRx, netTx } = computeNet(raw);
  assert.equal(netRx, 33159685617);
  assert.equal(netTx, 1255351650);
});

test('computeBlockIO sums read/write entries from io_service_bytes_recursive', () => {
  const raw = loadFixture('stats.sample.json');
  const { blockRead, blockWrite } = computeBlockIO(raw);
  assert.equal(blockRead, 38264832);
  assert.equal(blockWrite, 31938781184);
});

test('computeStats combines all metrics into one payload', () => {
  const raw = loadFixture('stats.sample2.json');
  const result = computeStats(raw);
  assert.ok(result.cpuPercent >= 0);
  assert.ok(result.memUsage > 0);
  assert.ok(result.memLimit > 0);
});
