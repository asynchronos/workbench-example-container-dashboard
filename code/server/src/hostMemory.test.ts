import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMemInfo } from './hostMemory.js';

const SAMPLE = `MemTotal:       127600624 kB
MemFree:         4184928 kB
MemAvailable:   49967164 kB
Buffers:           94820 kB
Cached:         46405740 kB
`;

test('parseMemInfo computes used bytes as MemTotal minus MemAvailable', () => {
  const result = parseMemInfo(SAMPLE);
  assert.ok(result);
  assert.equal(result.totalBytes, 127600624 * 1024);
  assert.equal(result.usedBytes, (127600624 - 49967164) * 1024);
});

test('parseMemInfo returns null when required fields are missing', () => {
  assert.equal(parseMemInfo('MemFree: 123 kB\n'), null);
  assert.equal(parseMemInfo(''), null);
});
