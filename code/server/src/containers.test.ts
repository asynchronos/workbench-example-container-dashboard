import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { docker } from './docker.js';
import { containersRouter } from './routes/containers.js';

test('container detail returns only allowlisted fields, including nested metadata', async (t) => {
  const info = {
    Id: 'fixture-id',
    Name: '/fixture',
    Config: { Image: 'example:latest', Env: ['SYNTHETIC_PRIVATE_VALUE'], Labels: { private: 'hidden' } },
    HostConfig: { Privileged: true },
    State: { Pid: 123 },
    NetworkSettings: {
      SandboxKey: '/private/network',
      Ports: {
        '80/tcp': [{ HostIp: '127.0.0.1', HostPort: '8080', unexpected: 'hidden' }],
        '443/tcp': null,
      },
      Networks: { bridge: { IPAddress: '172.17.0.2', NetworkID: 'private-network-id' } },
    },
    Mounts: [{ Type: 'volume', Source: '/data', Destination: '/app/data', Name: 'private-volume' }],
    FutureDockerField: 'hidden',
  };
  t.mock.method(docker, 'getContainer', (id: string) => {
    assert.equal(id, 'fixture-id');
    return { inspect: async () => info };
  });
  const app = express();
  app.use('/api/containers', containersRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
    server.closeAllConnections();
  }));

  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/containers/fixture-id`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    Id: 'fixture-id',
    Name: '/fixture',
    Config: { Image: 'example:latest' },
    NetworkSettings: {
      Ports: { '80/tcp': [{ HostIp: '127.0.0.1', HostPort: '8080' }], '443/tcp': null },
      Networks: { bridge: { IPAddress: '172.17.0.2' } },
    },
    Mounts: [{ Type: 'volume', Source: '/data', Destination: '/app/data' }],
  });
  assert.equal(JSON.stringify(body).includes('SYNTHETIC_PRIVATE_VALUE'), false);
});
