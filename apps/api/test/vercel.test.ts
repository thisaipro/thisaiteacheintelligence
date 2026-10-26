import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../web/api/index';
import { getRuntimeApp } from '../src/runtime';

vi.mock('../src/runtime', () => ({ getRuntimeApp: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

describe('Vercel API entry', () => {
  it('preserves the API path, query, bearer and JSON body for Express', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/teacher-assessment/attempts', (req, res) => res.json({
      body: req.body, query: req.query, authorization: req.headers.authorization,
    }));
    vi.mocked(getRuntimeApp).mockResolvedValue(app);
    const result = await request(handler).post('/api/teacher-assessment/attempts?test=1')
      .auth('test-bearer', { type: 'bearer' }).send({ grade_band: 'Pre-school' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ body: { grade_band: 'Pre-school' }, query: { test: '1' }, authorization: 'Bearer test-bearer' });
  });

  it('returns a JSON 503 without exposing configuration errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getRuntimeApp).mockRejectedValue(new Error('private configuration details'));
    const result = await request(handler).get('/api/me');
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'service_unavailable' });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.text).not.toContain('private');
  });
});
