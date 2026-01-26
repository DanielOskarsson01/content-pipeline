/**
 * Template Routes
 * API endpoints for managing pipeline templates
 */

const { Router } = require('express');
const templateService = require('../services/templateService');
const router = Router();

/**
 * GET /api/templates
 * List all active templates
 */
router.get('/', async (req, res, next) => {
  try {
    const templates = await templateService.list();
    res.json(templates);
  } catch (err) { next(err); }
});

/**
 * GET /api/templates/:id
 * Get single template
 */
router.get('/:id', async (req, res, next) => {
  try {
    const template = await templateService.getById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (err) { next(err); }
});

/**
 * POST /api/templates
 * Create a new template
 * Body: { name, description?, stages[] }
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, description, stages } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const template = await templateService.create({ name, description, stages });
    res.status(201).json(template);
  } catch (err) { next(err); }
});

/**
 * PATCH /api/templates/:id
 * Update a template
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, description, stages, is_active } = req.body;
    const template = await templateService.update(req.params.id, { name, description, stages, is_active });
    res.json(template);
  } catch (err) { next(err); }
});

/**
 * DELETE /api/templates/:id
 * Deactivate a template
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await templateService.remove(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
