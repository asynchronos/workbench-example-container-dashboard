import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseComputeApps, isUnifiedMemoryGpuName } from './gpu.js';

test('parseComputeApps parses host-PID -> MiB pairs from nvidia-smi CSV output', () => {
  const csv = '1498996, 36694\n1508587, 22917\n';
  const result = parseComputeApps(csv);
  assert.equal(result.size, 2);
  assert.equal(result.get(1498996), 36694);
  assert.equal(result.get(1508587), 22917);
});

test('parseComputeApps ignores blank lines', () => {
  const csv = '1498996, 36694\n\n1508587, 22917\n\n';
  assert.equal(parseComputeApps(csv).size, 2);
});

test('parseComputeApps returns an empty map for empty input', () => {
  assert.equal(parseComputeApps('').size, 0);
});

test('isUnifiedMemoryGpuName recognizes Grace Hopper / Grace Blackwell superchips', () => {
  assert.equal(isUnifiedMemoryGpuName('GH200 480GB'), true);
  assert.equal(isUnifiedMemoryGpuName('GB200'), true);
  assert.equal(isUnifiedMemoryGpuName('GB300'), true);
  assert.equal(isUnifiedMemoryGpuName('GB10'), true);
});

test('isUnifiedMemoryGpuName rejects discrete data-center and consumer GPUs', () => {
  assert.equal(isUnifiedMemoryGpuName('NVIDIA H100 80GB HBM3'), false);
  assert.equal(isUnifiedMemoryGpuName('NVIDIA A100-SXM4-80GB'), false);
  assert.equal(isUnifiedMemoryGpuName('NVIDIA B200'), false);
  assert.equal(isUnifiedMemoryGpuName('NVIDIA GeForce RTX 4090'), false);
  assert.equal(isUnifiedMemoryGpuName(''), false);
});
