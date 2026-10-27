import { Router } from 'express';
import { PassThrough } from 'node:stream';
import type { Readable } from 'node:stream';
import { docker } from '../docker.js';

export const logsRouter = Router();

logsRouter.get('/:id/logs', async (req, res) => {
  const container = docker.getContainer(req.params.id);
  const tail = Number.parseInt(String(req.query.tail ?? '200'), 10) || 200;

  let logStream: Readable;
  try {
    logStream = (await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    })) as unknown as Readable;
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

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(logStream, stdout, stderr);

  const sendLines = (chunk: Buffer) => {
    for (const line of chunk.toString('utf-8').split('\n')) {
      if (line.length === 0) continue;
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }
  };

  const cleanup = () => {
    stdout.off('data', sendLines);
    stderr.off('data', sendLines);
    logStream.destroy();
  };

  stdout.on('data', sendLines);
  stderr.on('data', sendLines);
  logStream.on('error', cleanup);
  req.on('close', cleanup);
  res.on('close', cleanup);
});
