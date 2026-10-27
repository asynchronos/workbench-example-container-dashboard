import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { docker } from './docker.js';
import { createActionsRouter } from './routes/actions.js';
import { createControlAccess, controlAccessFromEnvironment, createControlAccessRouter, type ControlAccess } from './controlAccess.js';

// Synthetic fixture credential, never used by a running dashboard.
const TOKEN = 'synthetic-control-token-for-tests-only';
const HOST = 'dashboard.test:7777';
const ORIGIN = 'https://dashboard.test';
const access = () => createControlAccess({ token: TOKEN, allowedHosts: [HOST], allowedOrigins: [ORIGIN] });
const actions = [
  ['POST', '/api/containers/fixture/start', 'start'],
  ['POST', '/api/containers/fixture/stop', 'stop'],
  ['POST', '/api/containers/fixture/restart', 'restart'],
  ['DELETE', '/api/containers/fixture?force=false', 'remove'],
] as const;

async function fixture(t: TestContext, control: ControlAccess) {
  const calls: { action: string; value?: unknown }[] = [];
  t.mock.method(docker, 'getContainer', (id: string) => {
    calls.push({ action: 'lookup', value: id });
    return {
      inspect: async () => { calls.push({ action: 'inspect' }); return { Name: '/fixture' }; },
      start: async () => { calls.push({ action: 'start' }); },
      stop: async () => { calls.push({ action: 'stop' }); },
      restart: async () => { calls.push({ action: 'restart' }); },
      remove: async (value: unknown) => { calls.push({ action: 'remove', value }); },
    };
  });
  t.mock.method(console, 'log', () => {});
  const app = express();
  app.use('/api/control-access', createControlAccessRouter(control));
  app.get('/api/containers', (_req, res) => res.json([]));
  app.use('/api/containers', createActionsRouter(control));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve); server.once('error', reject);
  });
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve()); server.closeAllConnections();
  }));
  const send = (method: string, path: string, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; body: string; headers: import('node:http').IncomingHttpHeaders }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: (server.address() as AddressInfo).port, path, method,
        headers: { Host: HOST, ...headers } }, (res) => {
        let body = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, body, headers: res.headers }));
      });
      req.on('error', reject); req.end();
    });
  return { calls, send };
}

test('every action rejects missing, invalid, malformed and URL-only credentials before any Docker lookup', async (t) => {
  const { calls, send } = await fixture(t, access());
  for (const [method, path] of actions) {
    for (const headers of [{}, { Authorization: 'Bearer incorrect' }, { Authorization: `Basic ${TOKEN}` },
      { Authorization: `Bearer ${TOKEN} extra` }, { Cookie: `control_token=${TOKEN}` }]) {
      const response = await send(method, path, headers);
      assert.equal(response.status, 401);
      assert.equal(response.headers['www-authenticate'], 'Bearer');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.body.includes(TOKEN), false);
    }
    assert.equal((await send(method, `${path}${path.includes('?') ? '&' : '?'}token=${TOKEN}`)).status, 401);
  }
  assert.deepEqual(calls, []);
});

test('unconfigured controls reject actions and verification while status and read access remain available', async (t) => {
  const { calls, send } = await fixture(t, createControlAccess({ allowedHosts: [HOST], allowedOrigins: [ORIGIN] }));
  for (const [method, path] of [...actions, ['POST', '/api/control-access/verify', 'verify']] as const) {
    assert.equal((await send(method, path, { Authorization: `Bearer ${TOKEN}` })).status, 503);
  }
  const status = await send('GET', '/api/control-access');
  assert.equal(status.status, 200);
  assert.deepEqual(JSON.parse(status.body), { configured: false });
  assert.equal(status.headers['cache-control'], 'no-store');
  assert.equal((await send('GET', '/api/containers')).status, 200);
  assert.deepEqual(calls, []);
});

test('valid token dispatches every action once and preserves remove force=false', async (t) => {
  const { calls, send } = await fixture(t, access());
  for (const [method, path, action] of actions) {
    const before = calls.length;
    assert.equal((await send(method, path, { Authorization: `Bearer ${TOKEN}`, Origin: ORIGIN })).status, 204);
    assert.deepEqual(calls.slice(before).map((call) => call.action), ['lookup', 'inspect', 'lookup', action]);
  }
  assert.deepEqual(calls.at(-1), { action: 'remove', value: { force: false } });
});

test('disallowed Host and Origin fail before any Docker lookup even with a valid token', async (t) => {
  const { calls, send } = await fixture(t, access());
  for (const [method, path] of actions) {
    for (const headers of [
      { Host: 'attacker.test' }, { Host: 'dashboard.test:7778' },
      { Origin: 'https://attacker.test' }, { Origin: 'null' },
      { Origin: `${ORIGIN}/` }, { Origin: `${ORIGIN}.attacker.test` },
      { Host: 'attacker.test', 'X-Forwarded-Host': HOST },
    ]) {
      assert.equal((await send(method, path, { Authorization: `Bearer ${TOKEN}`, ...headers })).status, 403);
    }
  }
  assert.deepEqual(calls, []);
});

test('verification and nonbrowser callers require the token but verification never touches Docker', async (t) => {
  const { calls, send } = await fixture(t, access());
  assert.equal((await send('POST', '/api/control-access/verify')).status, 401);
  assert.equal((await send('POST', '/api/control-access/verify', { Authorization: `bearer ${TOKEN}` })).status, 204);
  assert.deepEqual(calls, []);
  assert.equal((await send('POST', '/api/containers/fixture/start', { Authorization: `Bearer ${TOKEN}` })).status, 204);
  assert.equal(calls.filter((call) => call.action === 'start').length, 1);
});

test('environment defaults allow loopback hosts and Vite origin only outside production', async (t) => {
  const production = controlAccessFromEnvironment({ NODE_ENV: 'production', DASHBOARD_CONTROL_TOKEN: TOKEN });
  const { calls, send } = await fixture(t, production);
  for (const Host of ['127.0.0.1:7777', 'localhost:7777', '[::1]:7777']) {
    assert.equal((await send('POST', '/api/control-access/verify', { Host, Origin: `http://${Host}`, Authorization: `Bearer ${TOKEN}` })).status, 204);
  }
  assert.equal((await send('POST', '/api/control-access/verify', { Host: '127.0.0.1:7777', Origin: 'http://localhost:5173', Authorization: `Bearer ${TOKEN}` })).status, 403);
  assert.deepEqual(calls, []);
});

test('development proxy target Host works with explicit browser Origin, without trusting forwarded headers', async (t) => {
  const development = controlAccessFromEnvironment({ DASHBOARD_PORT: '7788', DASHBOARD_CONTROL_TOKEN: TOKEN });
  const { calls, send } = await fixture(t, development);
  assert.equal((await send('POST', '/api/control-access/verify', {
    Host: '127.0.0.1:7788', Origin: 'http://localhost:5173', Authorization: `Bearer ${TOKEN}`,
  })).status, 204);
  assert.deepEqual(calls, []);
});

test('explicit allowlists replace defaults and invalid configuration fails closed', async (t) => {
  const explicit = controlAccessFromEnvironment({
    NODE_ENV: 'production', DASHBOARD_CONTROL_TOKEN: TOKEN,
    DASHBOARD_CONTROL_ALLOWED_HOSTS: HOST, DASHBOARD_CONTROL_ALLOWED_ORIGINS: ORIGIN,
  });
  const { send } = await fixture(t, explicit);
  assert.equal((await send('POST', '/api/control-access/verify', { Origin: ORIGIN, Authorization: `Bearer ${TOKEN}` })).status, 204);
  assert.equal((await send('POST', '/api/control-access/verify', { Host: 'localhost:7777', Authorization: `Bearer ${TOKEN}` })).status, 403);
  assert.throws(() => controlAccessFromEnvironment({ DASHBOARD_CONTROL_TOKEN: 'short' }), /32–4096/);
  assert.throws(() => createControlAccess({ token: TOKEN, allowedHosts: ['*'], allowedOrigins: [] }));
  assert.throws(() => createControlAccess({ token: TOKEN, allowedHosts: [HOST], allowedOrigins: ['https://dashboard.test/'] }));
});

test('explicit empty host allowlist denies token holders', async (t) => {
  const empty = controlAccessFromEnvironment({ DASHBOARD_CONTROL_TOKEN: TOKEN, DASHBOARD_CONTROL_ALLOWED_HOSTS: '', DASHBOARD_CONTROL_ALLOWED_ORIGINS: '' });
  const { calls, send } = await fixture(t, empty);
  assert.equal((await send('POST', '/api/control-access/verify', { Authorization: `Bearer ${TOKEN}` })).status, 403);
  assert.deepEqual(calls, []);
});

test('default HTTP port configuration matches canonical browser Host and Origin', async (t) => {
  const control = controlAccessFromEnvironment({ NODE_ENV: 'production', DASHBOARD_PORT: '80', DASHBOARD_CONTROL_TOKEN: TOKEN });
  const { calls, send } = await fixture(t, control);
  assert.equal((await send('POST', '/api/control-access/verify', { Host: 'localhost', Origin: 'http://localhost', Authorization: `Bearer ${TOKEN}` })).status, 204);
  assert.deepEqual(calls, []);
});
