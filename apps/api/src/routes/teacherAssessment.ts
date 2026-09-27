/* /api/teacher-assessment — thin Express adapter over the service. */
import { Router } from 'express';
import type { IdentityResolver } from '../auth/identity';
import { createService, type ServiceConfig } from '../service';

export interface RouteConfig extends ServiceConfig {
  identity: IdentityResolver;
}

export function teacherAssessmentRouter(cfg: RouteConfig): Router {
  const r = Router();
  const service = createService(cfg);
  r.use((req, res, next) => {
    (async () => {
      const me = await cfg.identity(req);
      const query = Object.fromEntries(Object.entries(req.query).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
      const out = await service.handle({ method: req.method, path: req.path, query, body: req.body, me });
      res.status(out.status).json(out.body);
    })().catch(next);
  });
  return r;
}
