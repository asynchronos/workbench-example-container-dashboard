import { Router } from 'express';
import { getSummary } from '../summary.js';

export const summaryRouter = Router();

summaryRouter.get('/', async (_req, res) => {
  try {
    res.json(await getSummary());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
