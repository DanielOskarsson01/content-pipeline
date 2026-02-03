/**
 * Submodule Routes
 * API endpoints for running, viewing, and approving individual submodules
 */

const { Router } = require('express');
const path = require('path');
const IORedis = require('ioredis');
const db = require('../services/db');
const router = Router();

// Redis publisher for WebSocket events
const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null
};
const publisher = new IORedis(redisConnection);
publisher.on('error', (err) => {
  console.error('[submodules] Redis error:', err.message);
});

async function publishEvent(type, data) {
  try {
    await publisher.publish('pipeline-events', JSON.stringify({ type, data }));
  } catch (e) {
    console.error('[submodules] Failed to publish event:', e.message);
  }
}

// Submodule cache
const submoduleCache = {};

/**
 * Create approval records for submodule results
 * @param {string} submoduleRunId - UUID of the submodule run
 * @param {Array} results - Array of results (could be {valid:[], invalid:[]} or flat array)
 * @returns {Promise<number>} - Number of approval records created
 */
async function createApprovalRecords(submoduleRunId, results) {
  // Handle validation submodules which return {valid:[], invalid:[]}
  let flatResults = results;
  if (results && results.valid !== undefined) {
    flatResults = [...(results.valid || []), ...(results.invalid || [])];
  }

  if (!flatResults || flatResults.length === 0) {
    return 0;
  }

  const approvalRecords = flatResults.map((result, index) => ({
    submodule_run_id: submoduleRunId,
    result_index: index,
    result_url: result.url || null,
    result_entity_id: result.run_entity_id || null, // Use run_entity_id (UUID), not synthetic entity_id
    result_entity_name: result.entity_name || null,
    status: 'pending'
  }));

  const { error } = await db
    .from('submodule_result_approvals')
    .insert(approvalRecords);

  // Ignore if table doesn't exist yet (migration not run)
  if (error && error.code === '42P01') {
    console.warn('[submodules] submodule_result_approvals table not found - run migration');
    return 0;
  }
  if (error) {
    console.error('[submodules] Failed to create approval records:', error);
    return 0;
  }

  return approvalRecords.length;
}

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

// =====================================================
// VALIDATION ROUTES (must come before generic :type/:name route)
// =====================================================

/**
 * POST /api/submodules/validation/:name/execute
 * Execute a validation submodule on discovered URLs
 * Body: { run_id, run_entity_ids?, config? }
 */
router.post('/validation/:name/execute', async (req, res, next) => {
  try {
    const { name } = req.params;
    const { run_id, run_entity_ids, config = {} } = req.body;

    if (!run_id) {
      return res.status(400).json({ error: 'run_id is required for validation' });
    }

    // Load validation submodule
    const submodule = loadSubmodule('validation', name);
    if (!submodule) {
      return res.status(404).json({ error: `Validation submodule not found: ${name}` });
    }

    // Get run_entity_ids if not provided
    let entityIds = run_entity_ids;
    if (!entityIds || entityIds.length === 0) {
      const { data: runEntities, error: reErr } = await db
        .from('run_entities')
        .select('id')
        .eq('run_id', run_id);

      if (reErr) throw reErr;
      entityIds = (runEntities || []).map(re => re.id);
    }

    if (entityIds.length === 0) {
      return res.status(400).json({ error: 'No entities found for this run' });
    }

    // Load discovered URLs for these entities using pagination
    // (Supabase has a project-level max rows setting, default 1000)
    const BATCH_SIZE = 1000;
    const MAX_URLS = 50000;
    let urls = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && urls.length < MAX_URLS) {
      const { data: batch, error: urlErr } = await db
        .from('discovered_urls')
        .select('id, run_entity_id, url, discovery_method, priority, status, created_at')
        .in('run_entity_id', entityIds)
        .eq('status', 'pending')
        .range(offset, offset + BATCH_SIZE - 1);

      if (urlErr) throw urlErr;

      if (!batch || batch.length === 0) {
        hasMore = false;
      } else {
        urls = urls.concat(batch);
        offset += BATCH_SIZE;
        hasMore = batch.length === BATCH_SIZE;
      }
    }

    console.log(`[validation] Loaded ${urls.length} URLs for validation (fetched in batches of ${BATCH_SIZE})`);

    if (!urls || urls.length === 0) {
      return res.json({
        submodule_run_id: null,
        submodule: `validation/${name}`,
        status: 'completed',
        message: 'No pending URLs to validate',
        result_count: 0,
        valid_count: 0,
        invalid_count: 0
      });
    }

    // Get entity info for display
    const { data: runEntities, error: reErr2 } = await db
      .from('run_entities')
      .select('id, entity_snapshot')
      .in('id', entityIds);

    if (reErr2) throw reErr2;

    const entityNameMap = {};
    for (const re of runEntities || []) {
      entityNameMap[re.id] = re.entity_snapshot?.name || 'Unknown';
    }

    const enrichedUrls = urls.map(u => ({
      ...u,
      entity_name: entityNameMap[u.run_entity_id] || 'Unknown'
    }));

    // Create logger
    const logs = [];
    const logger = {
      info: (msg, data) => logs.push({ level: 'info', msg, data, ts: Date.now() }),
      warn: (msg, data) => logs.push({ level: 'warn', msg, data, ts: Date.now() }),
      error: (msg, data) => logs.push({ level: 'error', msg, data, ts: Date.now() })
    };

    // Execute validation submodule
    const startTime = Date.now();
    let result = { valid: [], invalid: [], stats: {} };
    let error = null;

    // Publish start event
    await publishEvent('submodule_start', {
      run_id,
      submodule_type: 'validation',
      submodule_name: name,
      entity_count: entityIds.length,
      url_count: enrichedUrls.length
    });

    try {
      result = await submodule.execute(enrichedUrls, config, { logger, db });
    } catch (e) {
      error = e.message;
      logger.error(`Validation submodule ${name} failed`, { error: e.message });
    }

    const duration = Date.now() - startTime;
    const submoduleRunId = require('crypto').randomUUID();
    const status = error ? 'failed' : 'completed';

    // Save to submodule_runs
    const runRecord = {
      id: submoduleRunId,
      run_id,
      submodule_type: 'validation',
      submodule_name: name,
      run_entity_ids: entityIds,
      config,
      status,
      result_count: result.valid?.length || 0,
      results: {
        valid: result.valid || [],
        invalid: result.invalid || [],
        stats: result.stats || {}
      },
      logs,
      duration_ms: duration,
      error,
      created_at: new Date().toISOString()
    };

    const { error: insertErr } = await db
      .from('submodule_runs')
      .insert(runRecord);

    if (insertErr && insertErr.code === '42P01') {
      return res.status(503).json({
        error: 'Database not ready',
        detail: 'submodule_runs table does not exist.'
      });
    }
    if (insertErr) throw insertErr;

    // Create per-result approval records
    await createApprovalRecords(submoduleRunId, result);

    // Publish complete event
    await publishEvent('submodule_complete', {
      run_id,
      submodule_run_id: submoduleRunId,
      submodule_type: 'validation',
      submodule_name: name,
      status,
      result_count: enrichedUrls.length,
      valid_count: result.valid?.length || 0,
      invalid_count: result.invalid?.length || 0,
      duration_ms: duration
    });

    res.json({
      submodule_run_id: submoduleRunId,
      submodule: `validation/${name}`,
      status,
      result_count: enrichedUrls.length,
      valid_count: result.valid?.length || 0,
      invalid_count: result.invalid?.length || 0,
      duration_ms: duration,
      stats: result.stats,
      valid: result.valid || [],
      invalid: result.invalid || [],
      logs,
      error
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/submodules/validation/runs/:runId/:submoduleRunId/apply
 * Apply validation results - update discovered_urls status
 */
router.post('/validation/runs/:runId/:submoduleRunId/apply', async (req, res, next) => {
  try {
    const { data: subRun, error: getErr } = await db
      .from('submodule_runs')
      .select('*')
      .eq('id', req.params.submoduleRunId)
      .eq('run_id', req.params.runId)
      .single();

    if (getErr) {
      if (getErr.code === 'PGRST116') {
        return res.status(404).json({ error: 'Validation run not found' });
      }
      throw getErr;
    }

    if (subRun.submodule_type !== 'validation') {
      return res.status(400).json({ error: 'Not a validation submodule run' });
    }

    const results = subRun.results || {};
    const invalidUrls = results.invalid || [];

    if (invalidUrls.length > 0) {
      const invalidIds = invalidUrls.map(u => u.id).filter(Boolean);
      if (invalidIds.length > 0) {
        const { error: updateErr } = await db
          .from('discovered_urls')
          .update({ status: 'filtered' })
          .in('id', invalidIds);

        if (updateErr) throw updateErr;
      }
    }

    const { error: updateRunErr } = await db
      .from('submodule_runs')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_count: results.valid?.length || 0
      })
      .eq('id', req.params.submoduleRunId);

    if (updateRunErr) throw updateRunErr;

    res.json({
      applied: true,
      valid_count: results.valid?.length || 0,
      filtered_count: invalidUrls.length,
      submodule_run_id: req.params.submoduleRunId
    });
  } catch (err) { next(err); }
});

// =====================================================
// GENERIC SUBMODULE ROUTES
// =====================================================

/**
 * POST /api/submodules/:type/:name/execute
 * Execute a single submodule for given entities
 * Body: { run_id?, run_entity_ids?: string[], entities?: object[], project_id?, config?: object }
 *
 * Three modes:
 * 1. With run_id + run_entity_ids: Load entities from database, save results
 * 2. With project_id + entities: Auto-create run + run_entities, then save results
 * 3. With entities array only: Preview mode, no database save
 */
router.post('/:type/:name/execute', async (req, res, next) => {
  try {
    const { type, name } = req.params;
    let { run_id, run_entity_ids, entities: directEntities, project_id, config = {} } = req.body;

    // Load submodule
    const submodule = loadSubmodule(type, name);
    if (!submodule) {
      return res.status(404).json({ error: `Submodule not found: ${type}/${name}` });
    }

    let entities = [];
    let isPreviewMode = false;
    let createdRunId = null;
    let createdRunEntityIds = null;

    // Mode 1: Direct entities with project_id - auto-create run
    if (project_id && !run_id && directEntities && Array.isArray(directEntities) && directEntities.length > 0) {
      // Create pipeline_run
      const { data: runData, error: runErr } = await db
        .from('pipeline_runs')
        .insert({
          project_id,
          status: 'running',
          entities_total: directEntities.length,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (runErr) {
        if (runErr.code === '42P01') {
          return res.status(503).json({
            error: 'Database not ready',
            detail: 'pipeline_runs table does not exist. Run sql/mvp1b_schema.sql in Supabase.'
          });
        }
        throw runErr;
      }

      run_id = runData.id;
      createdRunId = runData.id;

      // Create run_entities from directEntities
      const runEntitiesToInsert = directEntities.map((e, idx) => ({
        run_id,
        entity_id: null, // Not linking to entities table for MVP
        entity_snapshot: {
          id: e.id || `entity-${idx}`,
          name: e.name || e.entity_name || 'Unknown',
          metadata: {
            website: e.website,
            domain: e.website ? (() => { try { return new URL(e.website.startsWith('http') ? e.website : 'https://' + e.website).hostname; } catch { return null; } })() : null,
            ...e
          }
        },
        processing_order: idx,
        status: 'pending'
      }));

      const { data: reData, error: reErr } = await db
        .from('run_entities')
        .insert(runEntitiesToInsert)
        .select();

      if (reErr) {
        if (reErr.code === '42P01') {
          return res.status(503).json({
            error: 'Database not ready',
            detail: 'run_entities table does not exist. Run sql/mvp1b_schema.sql in Supabase.'
          });
        }
        throw reErr;
      }

      run_entity_ids = reData.map(re => re.id);
      createdRunEntityIds = run_entity_ids;

      // Build entities from what we created
      entities = reData.map(re => ({
        id: re.entity_snapshot?.id || re.id,
        run_entity_id: re.id, // Include for URL storage
        name: re.entity_snapshot?.name || 'Unknown',
        entity_name: re.entity_snapshot?.name,
        website: re.entity_snapshot?.metadata?.website,
        metadata: re.entity_snapshot?.metadata || {},
        domain: re.entity_snapshot?.metadata?.domain,
        seed_urls: re.entity_snapshot?.metadata?.seed_urls || []
      }));
    }
    // Mode 2: Direct entities without project_id (preview mode - no database)
    else if (directEntities && Array.isArray(directEntities) && directEntities.length > 0) {
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
    // Mode 3: Load from database
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
        run_entity_id: re.id, // Include for URL storage
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
        error: 'Provide either "entities" array for preview, or "run_id" + "run_entity_ids" for database mode, or "project_id" + "entities" to auto-create a run'
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

    // Publish start event (only for non-preview mode)
    if (run_id) {
      await publishEvent('submodule_start', {
        run_id,
        submodule_type: type,
        submodule_name: name,
        entity_count: entities.length
      });
    }

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

      // Save to submodule_runs table
      const { error: insertErr } = await db
        .from('submodule_runs')
        .insert(runRecord);

      // If table doesn't exist, return clear error
      if (insertErr && insertErr.code === '42P01') {
        return res.status(503).json({
          error: 'Database not ready',
          detail: 'submodule_runs table does not exist. Run sql/mvp1b_schema.sql in Supabase.',
          results_lost: true
        });
      }
      if (insertErr) throw insertErr;

      // Create per-result approval records
      await createApprovalRecords(submoduleRunId, results);

      // Publish complete event
      await publishEvent('submodule_complete', {
        run_id,
        submodule_run_id: submoduleRunId,
        submodule_type: type,
        submodule_name: name,
        status,
        result_count: results.length,
        duration_ms: duration
      });
    }

    res.json({
      submodule_run_id: submoduleRunId,
      preview_mode: isPreviewMode,
      submodule: `${type}/${name}`,
      status,
      result_count: results.length,
      duration_ms: duration,
      results,
      logs,
      error,
      // Include created run info so frontend can use it for subsequent submodules
      created_run_id: createdRunId,
      created_run_entity_ids: createdRunEntityIds
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

// =====================================================
// PER-RESULT APPROVAL ROUTES
// =====================================================

/**
 * GET /api/submodules/runs/:runId/:submoduleRunId/results
 * Get results with per-result approval status
 */
router.get('/runs/:runId/:submoduleRunId/results', async (req, res, next) => {
  try {
    // Get the submodule run
    const { data: subRun, error: runErr } = await db
      .from('submodule_runs')
      .select('id, submodule_name, submodule_type, results, result_count')
      .eq('id', req.params.submoduleRunId)
      .eq('run_id', req.params.runId)
      .single();

    if (runErr && runErr.code === 'PGRST116') {
      return res.status(404).json({ error: 'Submodule run not found' });
    }
    if (runErr) throw runErr;

    // Get approval records
    const { data: approvals, error: appErr } = await db
      .from('submodule_result_approvals')
      .select('*')
      .eq('submodule_run_id', req.params.submoduleRunId)
      .order('result_index', { ascending: true });

    // Table might not exist yet
    if (appErr && appErr.code === '42P01') {
      // Return results without approval data
      const rawResults = subRun.results || [];
      const flatResults = rawResults.valid !== undefined
        ? [...(rawResults.valid || []), ...(rawResults.invalid || [])]
        : rawResults;

      return res.json({
        submodule_run_id: req.params.submoduleRunId,
        submodule_name: subRun.submodule_name,
        total_results: flatResults.length,
        results: flatResults.map((r, i) => ({
          approval_id: null,
          result_index: i,
          url: r.url,
          entity_name: r.entity_name,
          status: 'pending',
          rejection_reason: null,
          ...r
        })),
        summary: { pending: flatResults.length, approved: 0, rejected: 0 },
        approval_tracking_available: false
      });
    }
    if (appErr) throw appErr;

    // Merge results with approval status
    const rawResults = subRun.results || [];
    const flatResults = rawResults.valid !== undefined
      ? [...(rawResults.valid || []), ...(rawResults.invalid || [])]
      : rawResults;

    const approvalMap = new Map();
    for (const app of approvals || []) {
      approvalMap.set(app.result_index, app);
    }

    const mergedResults = flatResults.map((result, index) => {
      const approval = approvalMap.get(index);
      return {
        approval_id: approval?.id || null,
        result_index: index,
        url: result.url,
        entity_name: result.entity_name,
        status: approval?.status || 'pending',
        rejection_reason: approval?.rejection_reason || null,
        ...result
      };
    });

    // Calculate summary
    const summary = { pending: 0, approved: 0, rejected: 0 };
    for (const r of mergedResults) {
      summary[r.status] = (summary[r.status] || 0) + 1;
    }

    res.json({
      submodule_run_id: req.params.submoduleRunId,
      submodule_name: subRun.submodule_name,
      total_results: mergedResults.length,
      results: mergedResults,
      summary,
      approval_tracking_available: true
    });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/submodules/runs/:runId/:submoduleRunId/results/:approvalId
 * Update single result approval status
 */
router.patch('/runs/:runId/:submoduleRunId/results/:approvalId', async (req, res, next) => {
  try {
    const { action, reason } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be "approve" or "reject"' });
    }

    const status = action === 'approve' ? 'approved' : 'rejected';

    // Update the approval record
    const { data: updated, error: updateErr } = await db
      .from('submodule_result_approvals')
      .update({
        status,
        rejection_reason: action === 'reject' ? (reason || null) : null,
        decided_at: new Date().toISOString()
      })
      .eq('id', req.params.approvalId)
      .eq('submodule_run_id', req.params.submoduleRunId)
      .select()
      .single();

    if (updateErr && updateErr.code === '42P01') {
      return res.status(503).json({ error: 'Approval tracking not available - run migration' });
    }
    if (updateErr && updateErr.code === 'PGRST116') {
      return res.status(404).json({ error: 'Approval record not found' });
    }
    if (updateErr) throw updateErr;

    // Get updated summary
    const { data: allApprovals, error: summErr } = await db
      .from('submodule_result_approvals')
      .select('status')
      .eq('submodule_run_id', req.params.submoduleRunId);

    if (summErr) throw summErr;

    const summary = { pending: 0, approved: 0, rejected: 0 };
    for (const app of allApprovals || []) {
      summary[app.status] = (summary[app.status] || 0) + 1;
    }

    res.json({
      success: true,
      approval_id: req.params.approvalId,
      status: updated.status,
      submodule_summary: summary
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/submodules/runs/:runId/:submoduleRunId/batch-approval
 * Batch update multiple result approvals
 */
router.post('/runs/:runId/:submoduleRunId/batch-approval', async (req, res, next) => {
  try {
    const { approvals, trigger_chain = true } = req.body;

    if (!approvals || !Array.isArray(approvals) || approvals.length === 0) {
      return res.status(400).json({ error: 'approvals array is required' });
    }

    // Validate all approvals have required fields
    for (const app of approvals) {
      if (!app.result_id || !['approve', 'reject'].includes(app.action)) {
        return res.status(400).json({
          error: 'Each approval must have result_id and action (approve/reject)'
        });
      }
    }

    // Get the submodule run first
    const { data: subRun, error: runErr } = await db
      .from('submodule_runs')
      .select('*')
      .eq('id', req.params.submoduleRunId)
      .eq('run_id', req.params.runId)
      .single();

    if (runErr && runErr.code === 'PGRST116') {
      return res.status(404).json({ error: 'Submodule run not found' });
    }
    if (runErr) throw runErr;

    // Process each approval
    const now = new Date().toISOString();
    let approvedCount = 0;
    let rejectedCount = 0;

    for (const app of approvals) {
      const status = app.action === 'approve' ? 'approved' : 'rejected';

      const { error: updateErr } = await db
        .from('submodule_result_approvals')
        .update({
          status,
          rejection_reason: app.action === 'reject' ? (app.reason || null) : null,
          decided_at: now
        })
        .eq('id', app.result_id)
        .eq('submodule_run_id', req.params.submoduleRunId);

      if (updateErr && updateErr.code === '42P01') {
        return res.status(503).json({ error: 'Approval tracking not available - run migration' });
      }
      if (updateErr) throw updateErr;

      if (app.action === 'approve') approvedCount++;
      else rejectedCount++;
    }

    // Get final summary
    const { data: allApprovals, error: summErr } = await db
      .from('submodule_result_approvals')
      .select('status')
      .eq('submodule_run_id', req.params.submoduleRunId);

    if (summErr) throw summErr;

    const summary = { pending: 0, approved: 0, rejected: 0 };
    for (const app of allApprovals || []) {
      summary[app.status] = (summary[app.status] || 0) + 1;
    }

    // Determine new submodule status
    const newStatus = summary.pending === 0 ? 'approved' : 'partial';

    // Update submodule_runs with counts
    const { error: subRunErr } = await db
      .from('submodule_runs')
      .update({
        status: newStatus,
        approved_count: summary.approved,
        rejected_count: summary.rejected,
        approved_at: summary.pending === 0 ? now : null
      })
      .eq('id', req.params.submoduleRunId);

    if (subRunErr) throw subRunErr;

    // Publish approval event
    await publishEvent('submodule_approval', {
      run_id: req.params.runId,
      submodule_run_id: req.params.submoduleRunId,
      approved_count: summary.approved,
      rejected_count: summary.rejected,
      pending_count: summary.pending,
      status: newStatus
    });

    // Chain transfer (future enhancement)
    let chainTriggered = false;
    let nextSubmodule = null;

    // TODO: Implement chain transfer if trigger_chain=true

    res.json({
      success: true,
      submodule_run_id: req.params.submoduleRunId,
      summary: {
        total: allApprovals.length,
        approved: summary.approved,
        rejected: summary.rejected
      },
      submodule_status: newStatus,
      chain_triggered: chainTriggered,
      next_submodule: nextSubmodule
    });
  } catch (err) { next(err); }
});

module.exports = router;
