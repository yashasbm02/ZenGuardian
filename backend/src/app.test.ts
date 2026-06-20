import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('App API Routes', () => {
  const app = createApp();

  it('GET /api/health should return ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'zenguardian');
    expect(res.body).toHaveProperty('time');
  });

  it('should return 404 for unknown /api routes', async () => {
    const res = await request(app).get('/api/unknown-route-123');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('message', 'Not Found');
  });
});
