/**
 * Submodules Route Tests
 * Tests the GET /api/submodules metadata endpoint
 */

const request = require('supertest');
const express = require('express');

// Mock Redis to avoid connection errors in tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    publish: jest.fn().mockResolvedValue(1),
  }));
});

// Mock db to avoid Supabase connection
jest.mock('../../../services/db', () => ({
  from: jest.fn(() => ({
    insert: jest.fn().mockResolvedValue({ error: null }),
    select: jest.fn().mockResolvedValue({ data: [], error: null }),
  })),
}));

describe('GET /api/submodules', () => {
  let app;
  let submodulesRouter;

  beforeAll(() => {
    // Load the actual router
    submodulesRouter = require('../../../routes/submodules');
  });

  beforeEach(() => {
    app = express();
    app.use('/api/submodules', submodulesRouter);
  });

  it('should return 200 with success:true', async () => {
    const response = await request(app).get('/api/submodules');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should return categories object', async () => {
    const response = await request(app).get('/api/submodules');
    expect(response.body.categories).toBeDefined();
    expect(typeof response.body.categories).toBe('object');
  });

  it('should have Step 1 categories (website, search)', async () => {
    const response = await request(app).get('/api/submodules');
    const { categories } = response.body;

    // Check website category exists with correct step
    expect(categories.website).toBeDefined();
    expect(categories.website.step).toBe(1);
    expect(categories.website.label).toBe('Website');

    // Check search category exists with correct step
    expect(categories.search).toBeDefined();
    expect(categories.search.step).toBe(1);
  });

  it('should have Step 2 categories (filtering, dedup)', async () => {
    const response = await request(app).get('/api/submodules');
    const { categories } = response.body;

    // Check filtering category exists with correct step
    expect(categories.filtering).toBeDefined();
    expect(categories.filtering.step).toBe(2);

    // Check dedup category exists with correct step
    expect(categories.dedup).toBeDefined();
    expect(categories.dedup.step).toBe(2);
  });

  it('should have required fields on each category', async () => {
    const response = await request(app).get('/api/submodules');
    const { categories } = response.body;

    const requiredCategoryFields = ['label', 'icon', 'description', 'step', 'order', 'submodules'];

    for (const category of Object.values(categories)) {
      for (const field of requiredCategoryFields) {
        expect(category[field]).toBeDefined();
      }
      expect(Array.isArray(category.submodules)).toBe(true);
    }
  });

  it('should have required fields on each submodule', async () => {
    const response = await request(app).get('/api/submodules');
    const { categories } = response.body;

    const requiredSubmoduleFields = ['id', 'name', 'description', 'cost', 'options'];

    for (const category of Object.values(categories)) {
      for (const submodule of category.submodules) {
        for (const field of requiredSubmoduleFields) {
          expect(submodule[field]).toBeDefined();
        }
        expect(Array.isArray(submodule.options)).toBe(true);
      }
    }
  });

  it('should have valid cost values on submodules', async () => {
    const response = await request(app).get('/api/submodules');
    const { categories } = response.body;
    const validCosts = ['cheap', 'medium', 'expensive'];

    for (const category of Object.values(categories)) {
      for (const submodule of category.submodules) {
        expect(validCosts).toContain(submodule.cost);
      }
    }
  });
});

describe('POST /api/submodules/reload', () => {
  let app;
  let submodulesRouter;

  beforeAll(() => {
    submodulesRouter = require('../../../routes/submodules');
  });

  beforeEach(() => {
    app = express();
    app.use('/api/submodules', submodulesRouter);
  });

  it('should return success in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const response = await request(app).post('/api/submodules/reload');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    process.env.NODE_ENV = originalEnv;
  });

  it('should return 403 in production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const response = await request(app).post('/api/submodules/reload');
    expect(response.status).toBe(403);

    process.env.NODE_ENV = originalEnv;
  });
});
