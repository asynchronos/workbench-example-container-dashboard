import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';

interface ControlAccessOptions {
  token?: string;
  allowedHosts: string[];
  allowedOrigins: string[];
}

// RFC 6750 bearer syntax, with a size bound to avoid hashing arbitrary input.
const TOKEN = /^[A-Za-z0-9._~+\/-]+=*$/;
const MAX_TOKEN_LENGTH = 4096;

function host(value: string): string {
  const normalized = value.toLowerCase();
  const url = new URL(`http://${normalized}`);
  if (!/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::[0-9]{1,5})?$/.test(normalized) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Control allowed hosts must be exact host:port values');
  }
  return url.host;
}

function origin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
    throw new Error('Control allowed origins must be exact http(s) origins without a trailing slash');
  }
  return value;
}

export function createControlAccess(options: ControlAccessOptions) {
  const token = options.token;
  if (token && (token.length < 32 || token.length > MAX_TOKEN_LENGTH || !TOKEN.test(token))) {
    throw new Error('DASHBOARD_CONTROL_TOKEN must be 32–4096 bearer-token characters');
  }
  const digest = token ? createHash('sha256').update(token).digest() : null;
  const hosts = new Set(options.allowedHosts.map(host));
  const origins = new Set(options.allowedOrigins.map(origin));

  const authorize: RequestHandler = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!digest) {
      res.status(503).json({ error: 'Container controls are not configured; dashboard is read-only.' });
      return;
    }
    // Use the actual Host; never trust forwarded headers from arbitrary callers.
    let requestHost: string | undefined;
    try { requestHost = host(req.get('host') ?? ''); } catch { /* Reject malformed Host below. */ }
    if (!requestHost || !hosts.has(requestHost)) {
      res.status(403).json({ error: 'This host is not allowed to control containers.' });
      return;
    }
    const requestOrigin = req.get('origin');
    if (requestOrigin !== undefined && !origins.has(requestOrigin)) {
      res.status(403).json({ error: 'This origin is not allowed to control containers.' });
      return;
    }
    // Nonbrowser clients may omit Origin; they still need the token and allowed Host.
    const match = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i.exec(req.get('authorization') ?? '');
    const supplied = match?.[1];
    if (!supplied || supplied.length > MAX_TOKEN_LENGTH ||
        !timingSafeEqual(digest, createHash('sha256').update(supplied).digest())) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'A valid control token is required.' });
      return;
    }
    next();
  };
  return { configured: digest !== null, authorize };
}

export type ControlAccess = ReturnType<typeof createControlAccess>;

export function controlAccessFromEnvironment(env: NodeJS.ProcessEnv = process.env): ControlAccess {
  const port = env.DASHBOARD_PORT ?? '7777';
  const localHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  const localOrigins = localHosts.map((value) => new URL(`http://${value}`).origin);
  if (env.NODE_ENV !== 'production') {
    localOrigins.push('http://127.0.0.1:5173', 'http://localhost:5173', 'http://[::1]:5173');
  }
  const csv = (value: string | undefined, defaults: string[]) =>
    value === undefined ? defaults : value.split(',').map((item) => item.trim()).filter(Boolean);
  return createControlAccess({
    token: env.DASHBOARD_CONTROL_TOKEN,
    allowedHosts: csv(env.DASHBOARD_CONTROL_ALLOWED_HOSTS, localHosts),
    allowedOrigins: csv(env.DASHBOARD_CONTROL_ALLOWED_ORIGINS, localOrigins),
  });
}

export function createControlAccessRouter(access: ControlAccess) {
  const router = Router();
  router.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ configured: access.configured });
  });
  // Unlock verifies credentials without reading or changing a Docker resource.
  router.post('/verify', access.authorize, (_req, res) => { res.status(204).end(); });
  return router;
}
