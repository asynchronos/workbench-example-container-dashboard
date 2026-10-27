import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { containersRouter } from './routes/containers.js';
import { statsRouter } from './routes/stats.js';
import { logsRouter } from './routes/logs.js';
import { createActionsRouter } from './routes/actions.js';
import { controlAccessFromEnvironment, createControlAccessRouter } from './controlAccess.js';
import { summaryRouter } from './routes/summary.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.DASHBOARD_PORT ?? '7777', 10);

const app = express();
const controlAccess = controlAccessFromEnvironment();

app.use('/api/control-access', createControlAccessRouter(controlAccess));

app.use('/api/containers', containersRouter);
app.use('/api/containers', statsRouter);
app.use('/api/containers', logsRouter);
app.use('/api/containers', createActionsRouter(controlAccess));
app.use('/api/summary', summaryRouter);

if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`container-dashboard server listening on :${port}`);
});
