/**
 * Entity Routes
 * API endpoints for managing entities (companies, topics, persons)
 */

const express = require('express');
const router = express.Router();
const entityService = require('../services/entityService');

/**
 * GET /api/entities
 * List entities with optional filtering
 * Query params: entity_type, search, page, limit
 */
router.get('/', async (req, res, next) => {
  try {
    const { entity_type, search, page, limit } = req.query;
    const result = await entityService.list({
      entity_type,
      search,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/entities/:id
 * Get single entity by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const entity = await entityService.getById(req.params.id);
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }
    res.json(entity);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/entities
 * Create a single entity
 * Body: { entity_type, name, metadata? }
 */
router.post('/', async (req, res, next) => {
  try {
    const { entity_type, name, metadata } = req.body;

    if (!entity_type || !name) {
      return res.status(400).json({ error: 'entity_type and name are required' });
    }

    const entity = await entityService.create({ entity_type, name, metadata });
    res.status(201).json(entity);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/entities/bulk
 * Bulk create entities
 * Body: { entities: [{ entity_type, name, metadata? }] }
 */
router.post('/bulk', async (req, res, next) => {
  try {
    const { entities } = req.body;

    if (!entities || !Array.isArray(entities) || entities.length === 0) {
      return res.status(400).json({ error: 'entities array is required' });
    }

    // Validate all entities have required fields
    for (const entity of entities) {
      if (!entity.entity_type || !entity.name) {
        return res.status(400).json({ error: 'Each entity must have entity_type and name' });
      }
    }

    const created = await entityService.bulkCreate(entities);
    res.status(201).json({ created: created.length, entities: created });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/entities/:id
 * Update entity
 * Body: { name?, metadata? }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, metadata } = req.body;
    const entity = await entityService.update(req.params.id, { name, metadata });
    res.json(entity);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/entities/:id
 * Delete entity
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await entityService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
