/**
 * Submodule Routes
 * API endpoints for running, viewing, and approving individual submodules
 */

const { Router } = require('express');
const path = require('path');
const db = require('../services/db');
const router = Router();

// Submodule cache
const submoduleCache = {};

/**
 * Load a submodule by name and type
 */
function loadSubmodule(type, name) {
  const cacheKey = `${type}/${name}`;
  if (!submoduleCache[cacheKey]) {
    const submodulePath = path.resolve(__dirname, '..', 'modules', 'submodules', type, `${name}.js`);
    try {
      submoduleCache[cacheKey] = require(submodulePath);
    } catch (e) {
      return null;
    }
  }
  return submoduleCache[cacheKey];
}

/**
 * GET /api/submodules
 * List available submodules by type
 */
router.get('/', async (req, res, next) => {
  try {
    const fs = require('fs');
    const submodulesDir = path.resolve(__dirname, '..', 'modules', 'submodules');

    const types = fs.readdirSync(submodulesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const result = {};
    for (const type of types) {
      const typeDir = path.join(submodulesDir, type);
      const files = fs.readdirSync(typeDir)
        .filter(f => f.endsWith('.js') && !f.startsWith('_'));

      result[type] = files.map(f => {
        const name = f.replace('.js', '');
        const submodule = loadSubmodule(type, name);
        return {
          name,
          description: submodule?.description || '',
          cost: submodule?.cost || 'medium',
          requiresExternalApi: submodule?.requiresExternalApi || false
        };
      });
    }

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * POST /api/submodules/:type/:name/execute
 * Execute a single submodule for given entities
 * Body: { run_id?, run_entity_ids?: string[], entities?: object[], config?: object }
 *
 * Two modes:
 * 1. With run_id + run_entity_ids: Load entities from database, save results
 * 2. With entities array directly: Preview mode, no database save
 */
router.post('/:type/:name/execute', async (req, res, next) => {
  try {
    const { type, name } = req.params;
    const { run_id, run_entity_ids, entities: directEntities, config = {} } = req.body;

    // Load submodule
    const submodule = loadSubmodule(type, name);
    if (!submodule) {
      return res.status(404).json({ error: `Submodule not found: ${type}/${name}` });
    }

    let entities = [];
    let isPreviewMode = false;

    // Mode 1: Direct entities (preview mode - no database)
    if (directEntities && Array.isArray(directEntities) && directEntities.length > 0) {
      isPreviewMode = true;
      entities = directEntities.map((e, idx) => ({
        id: e.id || `preview-${idx}`,
        name: e.name || e.entity_name || 'Unknown',
        entity_name: e.name || e.entity_name,
        website: e.website,
        domain: e.website ? new URL(e.website.startsWith('http') ? e.website : 'https://' + e.website).hostname : null,
        metadata: e.metadata || e,
        seed_urls: e.seed_urls || []
      }));
    }
    // Mode 2: Load from database
    else if (run_id && run_entity_ids && run_entity_ids.length > 0) {
      const { data: runEntities, error: reErr } = await db
        .from('run_entities')
        .select('*')
        .in('id', run_entity_ids);

      if (reErr) throw reErr;
      if (!runEntities || runEntities.length === 0) {
        return res.status(404).json({ error: 'Run entities not found' });
      }

      entities = runEntities.map(re => ({
        id: re.entity_snapshot?.id || re.id,
        name: re.entity_snapshot?.name || 'Unknown',
        entity_name: re.entity_snapshot?.name,
        website: re.entity_snapshot?.metadata?.website,
        metadata: re.entity_snapshot?.metadata || {},
        domain: re.entity_snapshot?.metadata?.domain,
        seed_urls: re.entity_snapshot?.metadata?.seed_urls || []
      }));
    }
    else {
      return res.status(400).json({
        error: 'Provide either "entities" array for preview, or "run_id" + "run_entity_ids" for database mode'
      });
    }

    // Create logger
    const logs = [];
    const logger = {
      info: (msg, data) => logs.push({ level: 'info', msg, data, ts: Date.now() }),
      warn: (msg, data) => logs.push({ level: 'warn', msg, data, ts: Date.now() }),
      error: (msg, data) => logs.push({ level: 'error', msg, data, ts: Date.now() })
    };

    // Execute submodule
    const startTime = Date.now();
    let results = [];
    let error = null;

    try {
      results = await submodule.execute(entities, config, { logger, db });
    } catch (e) {
      error = e.message;
      logger.error(`Submodule ${name} failed`, { error: e.message });
    }

    const duration = Date.now() - startTime;

    // Generate a run ID for tracking
    const submoduleRunId = require('crypto').randomUUID();
    const status = error ? 'failed' : 'completed';

    // Only store to database if we have a run_id (not preview mode)
    if (run_id) {
      const runRecord = {
        id: submoduleRunId,
        run_id,
        submodule_type: type,
        submodule_name: name,
        run_entity_ids,
        config,
        status,
        result_count: results.length,
        results, // Store all results - filtering happens in Step 2
        logs,
        duration_ms: duration,
        error,
        created_at: new Date().toISOString()
      };

      // Try to insert into submodule_runs (may not exist yet)
      const { error: insertErr } = await db
        .from('submodule_runs')
        .insert(runRecord);

      // If table doesn't exist, just log warning
      if (insertErr && insertErr.code === '42P01') {
        console.warn('submodule_runs table does not exist, results not persisted');
      }
    }

    res.json({
      submodule_run_id: submoduleRunId,
      preview_mode: !run_id,
      submodule: `${type}/${name}`,
      status,
      result_count: results.length,
      duration_ms: duration,
      results, // Return all results
      logs,
      error
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/submodules/runs/:runId
 * Get submodule runs for a pipeline run
 */
router.get('/runs/:runId', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('submodule_runs')
      .select('id, submodule_type, submodule_name, run_entity_ids, status, result_count, duration_ms, created_at, error')
      .eq('run_id', req.params.runId)
      .order('created_at', { ascending: false });

    if (error && error.code === '42P01') {
      // Table doesn't exist
      return res.json([]);
    }
    if (error) throw error;

    res.json(data || []);
  } catch (err) { next(err); }
});

/**
 * GET /api/submodules/runs/:runId/:submoduleRunId
 * Get a specific submodule run with full results
 */
router.get('/runs/:runId/:submoduleRunId', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('submodule_runs')
      .select('*')
      .eq('id', req.params.submoduleRunId)
      .single();

    if (error && error.code === '42P01') {
      return res.status(404).json({ error: 'Submodule runs not available' });
    }
    if (error && error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Submodule run not found' });
    }
    if (error) throw error;

    res.json(data);
  } catch (err) { next(err); }
});

/**
 * POST /api/submodules/runs/:runId/:submoduleRunId/approve
 * Approve submodule results and optionally save to discovered_urls
 */
router.post('/runs/:runId/:submoduleRunId/approve', async (req, res, next) => {
  try {
    const { selected_urls } = req.body; // Optional: subset of URLs to approve

    // Get the submodule run with run_id validation
    const { data: subRun, error: getErr } = await db
      .from('submodule_runs')
      .select('*')
      .eq('id', req.params.submoduleRunId)
      .eq('run_id', req.params.runId) // Validate run_id matches
      .single();

    if (getErr && getErr.code === '42P01') {
      return res.status(404).json({ error: 'Submodule runs not available' });
    }
    if (getErr && getErr.code === 'PGRST116') {
      return res.status(404).json({ error: 'Submodule run not found or run_id mismatch' });
    }
    if (getErr) throw getErr;
    if (!subRun) {
      return res.status(404).json({ error: 'Submodule run not found' });
    }

    // Idempotency: return success if already approved
    if (subRun.status === 'approved') {
      return res.json({
        approved: true,
        urls_saved: subRun.approved_count || 0,
        submodule_run_id: req.params.submoduleRunId,
        already_approved: true
      });
    }

    // Get URLs to save (all results or selected subset)
    let urlsToSave = subRun.results || [];
    if (selected_urls && selected_urls.length > 0) {
      urlsToSave = urlsToSave.filter(r => selected_urls.includes(r.url));
    }

    // Save approved URLs to discovered_urls
    // FIX: Associate each URL with its correct entity, not broadcast to all
    if (urlsToSave.length > 0 && subRun.run_entity_ids?.length > 0) {
      // Build entity_id -> run_entity_id mapping
      const { data: runEntities, error: reErr } = await db
        .from('run_entities')
        .select('id, entity_snapshot')
        .in('id', subRun.run_entity_ids);

      if (reErr) throw reErr;

      const entityToRunEntityMap = {};
      for (const re of runEntities || []) {
        const entityId = re.entity_snapshot?.id;
        if (entityId) {
          entityToRunEntityMap[entityId] = re.id;
        }
      }

      const urlRecords = [];
      for (const urlItem of urlsToSave) {
        // Use entity_id from result to find correct run_entity_id
        // Fall back to first run_entity_id for single-entity runs
        let targetRunEntityId = subRun.run_entity_ids[0];
        if (urlItem.entity_id && entityToRunEntityMap[urlItem.entity_id]) {
          targetRunEntityId = entityToRunEntityMap[urlItem.entity_id];
        }

        urlRecords.push({
          run_entity_id: targetRunEntityId,
          url: urlItem.url,
          discovery_method: subRun.submodule_name,
          priority: 0,
          status: 'pending',
          created_at: new Date().toISOString()
        });
      }

      const { error: insertErr } = await db
        .from('discovered_urls')
        .upsert(urlRecords, { onConflict: 'run_entity_id,url', ignoreDuplicates: true });

      if (insertErr) throw insertErr;
    }

    // Update submodule run status
    const { error: updateErr } = await db
      .from('submodule_runs')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_count: urlsToSave.length
      })
      .eq('id', req.params.submoduleRunId);

    if (updateErr) throw updateErr;

    res.json({
      approved: true,
      urls_saved: urlsToSave.length,
      submodule_run_id: req.params.submoduleRunId
    });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/submodules/runs/:runId/:submoduleRunId
 * Reject/discard submodule results
 */
router.delete('/runs/:runId/:submoduleRunId', async (req, res, next) => {
  try {
    const { error } = await db
      .from('submodule_runs')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', req.params.submoduleRunId);

    if (error && error.code !== '42P01') throw error;

    res.json({ rejected: true });
  } catch (err) { next(err); }
});

module.exports = router;
