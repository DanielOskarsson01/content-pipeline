/**
 * Project Routes
 * API endpoints for managing projects and starting pipeline runs
 *
 * New workflow:
 * 1. Templates define pipeline stages (reusable)
 * 2. Projects reference a template + contain input_data
 * 3. Starting a run auto-creates entities from input_data
 */

const { Router } = require('express');
const db = require('../services/db');
const orchestrator = require('../services/orchestrator');
const entityService = require('../services/entityService');
const router = Router();

/**
 * GET /api/projects
 * List all projects with template info
 */
router.get('/', async (req, res, next) => {
  try {
    const { template_id, status } = req.query;
    let query = db
      .from('projects')
      .select('*, templates(id, name, stages)')
      .order('created_at', { ascending: false });

    if (template_id) query = query.eq('template_id', template_id);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    // Flatten template info
    const projects = (data || []).map(p => ({
      ...p,
      template_name: p.templates?.name,
      stages: p.templates?.stages || p.config?.stages || [],
      templates: undefined
    }));

    res.json(projects);
  } catch (err) { next(err); }
});

/**
 * GET /api/projects/:id
 * Project details with template, input_data, and run history
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { data: project, error: projErr } = await db
      .from('projects')
      .select('*, templates(id, name, stages)')
      .eq('id', req.params.id)
      .single();

    if (projErr && projErr.code !== 'PGRST116') throw projErr;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { data: runs, error: runsErr } = await db
      .from('pipeline_runs')
      .select('id, status, entities_total, entities_completed, entities_failed, started_at, completed_at')
      .eq('project_id', req.params.id)
      .order('started_at', { ascending: false })
      .limit(10);

    if (runsErr) throw runsErr;

    // Get stages from template or legacy config
    const stages = project.templates?.stages || project.config?.stages || [];
    const inputItems = project.input_data || [];

    res.json({
      ...project,
      template_name: project.templates?.name,
      stages,
      input_items: inputItems,
      input_count: inputItems.length,
      runs: runs || [],
      templates: undefined
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/projects
 * Create a new project
 * Body: { name, template_id, input_data[] }
 *
 * input_data format:
 * [
 *   { "name": "Betsson", "url": "https://betsson.com" },
 *   { "name": "LeoVegas", "url": "https://leovegas.com" }
 * ]
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, template_id, input_data, project_type } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Build project data
    const projectData = {
      name,
      status: 'created',
      input_data: input_data || [],
      config: {} // Legacy field, keep for compatibility
    };

    // Template is optional but recommended
    if (template_id) {
      projectData.template_id = template_id;
    }

    // Project type is optional (inferred from template)
    if (project_type) {
      projectData.project_type = project_type;
    }

    const { data, error } = await db
      .from('projects')
      .insert(projectData)
      .select('*, templates(id, name, stages)')
      .single();

    if (error) throw error;

    res.status(201).json({
      ...data,
      template_name: data.templates?.name,
      stages: data.templates?.stages || [],
      input_count: (data.input_data || []).length,
      templates: undefined
    });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/projects/:id
 * Update project
 * Body: { name?, template_id?, input_data?, status? }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, template_id, input_data, status, config } = req.body;
    const updates = { updated_at: new Date().toISOString() };

    if (name !== undefined) updates.name = name;
    if (template_id !== undefined) updates.template_id = template_id;
    if (input_data !== undefined) updates.input_data = input_data;
    if (config !== undefined) updates.config = config;
    if (status !== undefined) {
      const validStatuses = ['created', 'running', 'completed', 'failed', 'paused', 'archived'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      }
      updates.status = status;
    }

    const { data, error } = await db
      .from('projects')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, templates(id, name, stages)')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Project not found' });

    res.json({
      ...data,
      template_name: data.templates?.name,
      stages: data.templates?.stages || data.config?.stages || [],
      templates: undefined
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/projects/:id/start
 * Start a pipeline run
 *
 * Two modes:
 * 1. Auto mode (recommended): Uses project's input_data to create entities
 *    Body: {} or { items?: number[] } (indices to run, defaults to all)
 *
 * 2. Legacy mode: Provide explicit entityIds
 *    Body: { entityIds: string[] }
 */
router.post('/:id/start', async (req, res, next) => {
  try {
    const { entityIds, items } = req.body;

    // Get project with template
    const { data: project, error: projErr } = await db
      .from('projects')
      .select('*, templates(stages)')
      .eq('id', req.params.id)
      .single();

    if (projErr) throw projErr;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Get stages from template or legacy config
    const stages = project.templates?.stages || project.config?.stages;
    if (!stages || stages.length === 0) {
      return res.status(400).json({
        error: 'Project has no pipeline stages configured',
        hint: 'Assign a template to this project or configure stages in project.config'
      });
    }

    let idsToRun = entityIds;

    // Auto mode: create entities from input_data
    if (!entityIds || entityIds.length === 0) {
      const inputData = project.input_data || [];

      if (inputData.length === 0) {
        return res.status(400).json({
          error: 'No input data in project',
          hint: 'Add input_data to the project or provide entityIds directly'
        });
      }

      // Filter by indices if specified
      let itemsToProcess = inputData;
      if (items && Array.isArray(items)) {
        itemsToProcess = items.map(i => inputData[i]).filter(Boolean);
      }

      // Create or find entities for each input item
      const createdEntities = await Promise.all(
        itemsToProcess.map(async (item) => {
          // Check if entity with same name exists
          const existing = await db
            .from('entities')
            .select('id')
            .eq('name', item.name)
            .single();

          if (existing.data) {
            return existing.data;
          }

          // Create new entity
          return entityService.create({
            name: item.name,
            entity_type: item.type || project.project_type || 'company',
            metadata: {
              url: item.url,
              domain: item.domain || (item.url ? new URL(item.url).hostname : undefined),
              ...item
            }
          });
        })
      );

      idsToRun = createdEntities.map(e => e.id);
    }

    if (!idsToRun || idsToRun.length === 0) {
      return res.status(400).json({ error: 'No entities to process' });
    }

    // Start the run with stages from template
    const run = await orchestrator.startRun(req.params.id, idsToRun, stages);
    res.status(201).json(run);
  } catch (err) { next(err); }
});

/**
 * DELETE /api/projects/:id
 * Soft delete (archive) a project
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('projects')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Project not found' });

    res.json({ message: 'Project archived', project: data });
  } catch (err) { next(err); }
});

module.exports = router;
