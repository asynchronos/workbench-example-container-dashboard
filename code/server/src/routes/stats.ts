import { Router } from 'express';
import type { Readable } from 'node:stream';
import { docker } from '../docker.js';
import { computeStats, type RawDockerStats } from '../stats.js';

export const statsRouter = Router();

statsRouter.get('/:id/stats', async (req, res) => {
  const container = docker.getContainer(req.params.id);

  let stream: Readable;
  try {
    stream = (await container.stats({ stream: true })) as unknown as Readable;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode === 404 ? 404 : 500;
    res.status(status).json({ error: (err as Error).message });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let buffer = '';
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf-8');
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const raw = JSON.parse(line) as RawDockerStats;
        const computed = computeStats(raw);
        res.write(`data: ${JSON.stringify(computed)}\n\n`);
      } catch {
        // skip malformed/partial frame
      }
    }
  };

  const cleanup = () => {
    stream.off('data', onData);
    stream.destroy();
  };

  stream.on('data', onData);
  stream.on('error', cleanup);
  req.on('close', cleanup);
  res.on('close', cleanup);
});
