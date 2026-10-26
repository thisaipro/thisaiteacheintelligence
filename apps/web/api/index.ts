import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRuntimeApp } from '@thisai/ta-api/runtime';

// Same-origin /api/* function alongside the existing Vite static deployment.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getRuntimeApp();
    app(req, res);
  } catch {
    console.error('Teacher Assessment API initialization failed; check server environment variables');
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'service_unavailable' }));
  }
}
