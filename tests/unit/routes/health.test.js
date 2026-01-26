/**
 * Health Route Tests
 */

const request = require('supertest');
const express = require('express');

describe('Health Endpoint', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  });

  it('should return 200 OK', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('should include timestamp', async () => {
    const response = await request(app).get('/health');
    expect(response.body.timestamp).toBeDefined();
  });
});
