import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseThermalZoneTemp } from './hwTemps.js';

test('parseThermalZoneTemp converts millidegrees to Celsius', () => {
  assert.equal(parseThermalZoneTemp('57600'), 57.6);
  assert.equal(parseThermalZoneTemp('57600\n'), 57.6);
});

test('parseThermalZoneTemp returns null for unparseable input', () => {
  assert.equal(parseThermalZoneTemp(''), null);
  assert.equal(parseThermalZoneTemp('not-a-number'), null);
});
