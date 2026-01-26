/**
 * Pipeline Run Routes
 * API endpoints for monitoring and controlling pipeline runs
 */

const { Router } = require('express');
const db = require('../services/db');
const orchestrator = require('../services/orchestrator');
const router = Router();

/**
 * GET /api/runs
 * List all pipeline runs with entity counts
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, project_id, limit = 100 } = req.query;
    let query = db
      .from('pipeline_runs')
      .select('*, projects(name, project_type)')
      .order('started_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) query = query.eq('status', status);
    if (project_id) query = query.eq('project_id', project_id);

    const { data, error } = await query;
    if (error) throw error;

    const runs = (data || []).map(run => ({
      ...run,
      project_name: run.projects?.name || 'Unknown',
      project_type: run.projects?.project_type,
      progress: run.entities_total > 0
        ? Math.round(((run.entities_completed + run.entities_failed) / run.entities_total) * 100)
        : 0
    }));

    res.json(runs);
  } catch (err) { next(err); }
});

/**
 * GET /api/runs/:id
 * Single run with entity summary
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { data: run, error: runErr } = await db
      .from('pipeline_runs')
      .select('*, projects(name, project_type, config)')
      .eq('id', req.params.id)
      .single();

    if (runErr && runErr.code !== 'PGRST116') throw runErr;
    if (!run) return res.status(404).json({ error: 'Run not found' });

    // Get entity summary
    const { data: entitySummary } = await db
      .from('run_entities')
      .select('status')
      .eq('run_id', req.params.id);

    const entityCounts = (entitySummary || []).reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {});

    res.json({
      ...run,
      project_name: run.projects?.name || 'Unknown',
      project_type: run.projects?.project_type,
      stages_config: run.projects?.config?.stages || [],
      entity_counts: entityCounts
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/runs/:id/entities
 * List run_entities for a run with their current status
 */
router.get('/:id/entities', async (req, res, next) => {
  try {
    const { status } = req.query;

    let query = db
      .from('run_entities')
      .select('*')
      .eq('run_id', req.params.id)
      .order('processing_order');

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    // For each entity, get their current stage progress
    const entities = await Promise.all((data || []).map(async (runEntity) => {
      const { data: stages } = await db
        .from('pipeline_stages')
        .select('stage_index, stage_name, status, duration_ms')
        .eq('run_entity_id', runEntity.id)
        .order('stage_index');

      const completedStages = (stages || []).filter(s => s.status === 'completed').length;
      const currentStage = (stages || []).find(s => s.status === 'running');
      const failedStage = (stages || []).find(s => s.status === 'failed');

      return {
        ...runEntity,
        entity_name: runEntity.entity_snapshot?.name,
        entity_type: runEntity.entity_snapshot?.entity_type,
        stages_completed: completedStages,
        stages_total: (stages || []).length,
        current_stage: currentStage?.stage_name,
        failed_stage: failedStage?.stage_name,
        failed_error: failedStage ? null : undefined // Could fetch error from pipeline_stages if needed
      };
    }));

    res.json(entities);
  } catch (err) { next(err); }
});

/**
 * GET /api/runs/:id/entities/:entityId
 * Single run_entity with all stage details
 */
router.get('/:id/entities/:entityId', async (req, res, next) => {
  try {
    const { data: runEntity, error: reErr } = await db
      .from('run_entities')
      .select('*')
      .eq('id', req.params.entityId)
      .eq('run_id', req.params.id)
      .single();

    if (reErr && reErr.code !== 'PGRST116') throw reErr;
    if (!runEntity) return res.status(404).json({ error: 'Run entity not found' });

    // Get all stages for this entity
    const { data: stages, error: stagesErr } = await db
      .from('pipeline_stages')
      .select('*')
      .eq('run_entity_id', req.params.entityId)
      .order('stage_index');

    if (stagesErr) throw stagesErr;

    res.json({
      ...runEntity,
      entity_name: runEntity.entity_snapshot?.name,
      entity_type: runEntity.entity_snapshot?.entity_type,
      stages: stages || []
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/runs/:id/stages
 * All stages for a run, grouped by entity
 */
router.get('/:id/stages', async (req, res, next) => {
  try {
    const { stage_index, status } = req.query;

    let query = db
      .from('pipeline_stages')
      .select('*, run_entities(entity_snapshot)')
      .eq('run_id', req.params.id)
      .order('stage_index');

    if (stage_index !== undefined) query = query.eq('stage_index', parseInt(stage_index));
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    // Add entity name to each stage
    const stages = (data || []).map(stage => ({
      ...stage,
      entity_name: stage.run_entities?.entity_snapshot?.name,
      run_entities: undefined // Remove nested object
    }));

    res.json(stages);
  } catch (err) { next(err); }
});

/**
 * PATCH /api/runs/:id
 * Pause or resume a run
 * Body: { action: 'pause' | 'resume' }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { action } = req.body;

    if (!action || !['pause', 'resume'].includes(action)) {
      return res.status(400).json({ error: 'action must be "pause" or "resume"' });
    }

    let result;
    if (action === 'pause') {
      await orchestrator.pauseRun(req.params.id);
      result = { status: 'paused' };
    } else {
      const resumed = await orchestrator.resumeRun(req.params.id);
      if (!resumed) {
        return res.status(400).json({ error: 'Run cannot be resumed (not paused or not found)' });
      }
      result = { status: 'running' };
    }

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * POST /api/runs/:id/retry
 * Retry failed entities in a run
 */
router.post('/:id/retry', async (req, res, next) => {
  try {
    const result = await orchestrator.retryFailed(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * POST /api/runs/:id/stages/:stageIndex/approve
 * Approve a completed stage and continue to next stage
 * Body: { run_entity_id?: string, additional_input?: object }
 */
router.post('/:id/stages/:stageIndex/approve', async (req, res, next) => {
  try {
    const { run_entity_id, additional_input } = req.body;
    const stageIndex = parseInt(req.params.stageIndex);

    if (isNaN(stageIndex) || stageIndex < 0) {
      return res.status(400).json({ error: 'Invalid stage index' });
    }

    const result = await orchestrator.approveStage(
      req.params.id,
      stageIndex,
      run_entity_id || null,
      additional_input || {}
    );

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /api/runs/:id/awaiting-approval
 * Get stages awaiting approval for a run
 */
router.get('/:id/awaiting-approval', async (req, res, next) => {
  try {
    const { data: stages, error } = await db
      .from('pipeline_stages')
      .select('*, run_entities(entity_snapshot)')
      .eq('run_id', req.params.id)
      .eq('status', 'awaiting_approval')
      .order('stage_index');

    if (error) throw error;

    const result = (stages || []).map(stage => ({
      ...stage,
      entity_name: stage.run_entities?.entity_snapshot?.name,
      run_entities: undefined
    }));

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /api/runs/:id/discovered-urls
 * Get discovered URLs for a run (or specific entity)
 */
router.get('/:id/discovered-urls', async (req, res, next) => {
  try {
    const { run_entity_id, status, limit = 1000 } = req.query;

    // Get run_entity IDs for this run
    let query;
    if (run_entity_id) {
      query = db
        .from('discovered_urls')
        .select('*, run_entities(entity_snapshot)')
        .eq('run_entity_id', run_entity_id)
        .limit(parseInt(limit));
    } else {
      // Get all run_entities for this run first
      const { data: runEntities } = await db
        .from('run_entities')
        .select('id')
        .eq('run_id', req.params.id);

      const runEntityIds = (runEntities || []).map(re => re.id);

      query = db
        .from('discovered_urls')
        .select('*, run_entities(entity_snapshot)')
        .in('run_entity_id', runEntityIds)
        .limit(parseInt(limit));
    }

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const urls = (data || []).map(url => ({
      ...url,
      entity_name: url.run_entities?.entity_snapshot?.name,
      run_entities: undefined
    }));

    res.json(urls);
  } catch (err) { next(err); }
});

/**
 * GET /api/runs/:id/scraped-pages
 * Get scraped pages for a run (or specific entity)
 */
router.get('/:id/scraped-pages', async (req, res, next) => {
  try {
    const { run_entity_id, limit = 100 } = req.query;

    let query;
    if (run_entity_id) {
      query = db
        .from('scraped_pages')
        .select('id, run_entity_id, url, content_type, word_count, scraped_at, run_entities(entity_snapshot)')
        .eq('run_entity_id', run_entity_id)
        .limit(parseInt(limit));
    } else {
      const { data: runEntities } = await db
        .from('run_entities')
        .select('id')
        .eq('run_id', req.params.id);

      const runEntityIds = (runEntities || []).map(re => re.id);

      query = db
        .from('scraped_pages')
        .select('id, run_entity_id, url, content_type, word_count, scraped_at, run_entities(entity_snapshot)')
        .in('run_entity_id', runEntityIds)
        .limit(parseInt(limit));
    }

    const { data, error } = await query;
    if (error) throw error;

    const pages = (data || []).map(page => ({
      ...page,
      entity_name: page.run_entities?.entity_snapshot?.name,
      run_entities: undefined
    }));

    res.json(pages);
  } catch (err) { next(err); }
});

module.exports = router;
