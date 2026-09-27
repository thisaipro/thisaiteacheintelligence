import express from 'express';
import cookieParser from 'cookie-parser';
import type { IdentityResolver } from './auth/identity';
import { DEV_USERS } from './auth/identity';
import type { Repo } from './repo/types';
import { teacherAssessmentRouter, type RouteConfig } from './routes/teacherAssessment';

export interface AppConfig extends RouteConfig {
  repo: Repo;
  identity: IdentityResolver;
  /** Serves GET /api/me and POST /api/dev/switch-user — stand-ins for thisai.pro in local dev only. */
  devRoutes?: boolean;
}

export function createApp(cfg: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  app.get('/api/teacher-assessment/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/api/teacher-assessment', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/teacher-assessment', teacherAssessmentRouter(cfg));

  if (cfg.devRoutes) {
    app.get('/api/me', async (req, res) => {
      const me = await cfg.identity(req);
      if (!me) return res.status(401).json({ error: 'unauthenticated' });
      res.json(me);
    });
    app.get('/api/dev/users', (_req, res) => res.json(DEV_USERS));
    app.post('/api/dev/switch-user', (req, res) => {
      const key = String(req.body?.user ?? '');
      if (key !== 'none' && !DEV_USERS[key]) return res.status(400).json({ error: 'unknown user' });
      res.cookie('ta_dev_user', key, { httpOnly: true, sameSite: 'lax' });
      res.json({ ok: true });
    });
  }
  return app;
}
