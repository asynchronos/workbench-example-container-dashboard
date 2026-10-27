import { Router } from 'express';
import { docker } from '../docker.js';
import { auditLog, type AuditAction } from '../audit.js';
import type { ControlAccess } from '../controlAccess.js';

async function nameOf(containerId: string): Promise<string> {
  try {
    const info = await docker.getContainer(containerId).inspect();
    return info.Name.replace(/^\//, '');
  } catch {
    return containerId;
  }
}

function handleAction(action: AuditAction, run: (req: import('express').Request) => Promise<unknown>) {
  return async (req: import('express').Request, res: import('express').Response) => {
    const { id } = req.params;
    const name = await nameOf(id);
    try {
      await run(req);
      auditLog(id, name, action, 'success');
      res.status(204).end();
    } catch (err) {
      auditLog(id, name, action, 'failure');
      const rawStatus = (err as { statusCode?: number }).statusCode;
      const status = rawStatus && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;
      res.status(status).json({ error: (err as Error).message });
    }
  };
}

export function createActionsRouter(access: ControlAccess) {
  const actionsRouter = Router();
  // This guard precedes every action, including the audit name lookup.
  actionsRouter.use(access.authorize);

  actionsRouter.post(
    '/:id/start',
    handleAction('start', (req) => docker.getContainer(req.params.id).start())
  );

  actionsRouter.post(
    '/:id/stop',
    handleAction('stop', (req) => docker.getContainer(req.params.id).stop())
  );

  actionsRouter.post(
    '/:id/restart',
    handleAction('restart', (req) => docker.getContainer(req.params.id).restart())
  );

  actionsRouter.delete(
    '/:id',
    handleAction('remove', (req) => {
      const force = req.query.force === 'true';
      return docker.getContainer(req.params.id).remove({ force });
    })
  );

  return actionsRouter;
}
