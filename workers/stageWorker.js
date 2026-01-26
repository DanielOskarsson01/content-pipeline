/**
 * Pipeline Stage Worker
 * Processes entity-level jobs from the pipeline-stages queue
 *
 * Each job contains:
 * - runId: Pipeline run UUID
 * - runEntityId: Run entity UUID (entity being processed)
 * - entitySnapshot: Frozen entity data at run start
 * - stageIndex: Current step (0-11)
 * - operationName: Module to execute
 * - config: Stage configuration
 * - input: Output from previous stage
 */

require('dotenv').config();

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const path = require('path');
const db = require('../services/db');
const orchestrator = require('../services/orchestrator');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null
};

// Worker ID for observability
const workerId = `worker-${process.pid}`;

// Redis publisher for WebSocket events
const publisher = new IORedis(connection);

async function publishEvent(type, data) {
  try {
    await publisher.publish('pipeline-events', JSON.stringify({ type, data }));
  } catch (e) {
    console.error('Failed to publish event:', e.message);
  }
}

// Stage execution worker
const worker = new Worker('pipeline-stages', async (job) => {
  const { runId, runEntityId, entitySnapshot, stageIndex, operationName, config, input } = job.data;
  const startTime = Date.now();

  const entityName = entitySnapshot?.name || runEntityId?.slice(0, 8);
  console.log(`[Stage ${stageIndex}] Starting: ${operationName} for "${entityName}" (run: ${runId.slice(0, 8)})`);

  // Mark stage as running
  await db
    .from('pipeline_stages')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      worker_id: workerId
    })
    .eq('run_id', runId)
    .eq('run_entity_id', runEntityId)
    .eq('stage_index', stageIndex);

  // Mark run_entity as running if this is first stage
  if (stageIndex === 0) {
    await db
      .from('run_entities')
      .update({ status: 'running' })
      .eq('id', runEntityId);
  }

  // Get stage ID for events
  const { data: stageRow } = await db
    .from('pipeline_stages')
    .select('id')
    .eq('run_id', runId)
    .eq('run_entity_id', runEntityId)
    .eq('stage_index', stageIndex)
    .single();

  await publishEvent('stage_update', {
    run_id: runId,
    run_entity_id: runEntityId,
    entity_name: entityName,
    stage_id: stageRow?.id,
    stage_index: stageIndex,
    status: 'running',
    operation: operationName
  });

  // Load operation module dynamically
  const modulePath = path.resolve(__dirname, '..', 'modules', 'operations', `${operationName}.js`);
  let operation;
  try {
    operation = require(modulePath);
  } catch (e) {
    throw new Error(`Operation module not found: ${operationName} (${modulePath})`);
  }

  // Track AI tokens
  let tokensUsed = 0;

  // Build execution context
  const context = {
    db,
    runId,
    runEntityId,
    entitySnapshot,
    workerId,
    logger: {
      info: (...args) => console.log(`[${operationName}:${entityName}]`, ...args),
      warn: (...args) => console.warn(`[${operationName}:${entityName}]`, ...args),
      error: (...args) => console.error(`[${operationName}:${entityName}]`, ...args)
    },
    publishProgress: async (progress, message) => {
      await publishEvent('stage_progress', {
        run_id: runId,
        run_entity_id: runEntityId,
        entity_name: entityName,
        stage_index: stageIndex,
        progress,
        message
      });
    },
    trackTokens: (count) => { tokensUsed += count; }
  };

  // Execute operation
  const result = await operation.execute(input, config, context);

  // Calculate duration
  const endTime = Date.now();
  const durationMs = endTime - startTime;

  // Store results with observability columns
  await db
    .from('pipeline_stages')
    .update({
      status: 'completed',
      output_data: result?.output_data || result || {},
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      retry_count: job.attemptsMade,
      ai_tokens_used: result?.tokens_used || tokensUsed
    })
    .eq('run_id', runId)
    .eq('run_entity_id', runEntityId)
    .eq('stage_index', stageIndex);

  await publishEvent('stage_update', {
    run_id: runId,
    run_entity_id: runEntityId,
    entity_name: entityName,
    stage_id: stageRow?.id,
    stage_index: stageIndex,
    status: 'completed',
    operation: operationName,
    duration_ms: durationMs
  });

  // Notify about created content items
  if (result?.content_items_created) {
    for (const id of result.content_items_created) {
      await publishEvent('content_created', { content_id: id, entity_name: entityName });
    }
  }

  // Queue next stage for this entity
  const nextIndex = await orchestrator.queueNextStage(runId, runEntityId, stageIndex, result?.output_data || result);

  if (nextIndex === null) {
    // Entity completed all stages
    console.log(`[Entity] Completed: "${entityName}" (run: ${runId.slice(0, 8)})`);
    await publishEvent('entity_complete', {
      run_id: runId,
      run_entity_id: runEntityId,
      entity_name: entityName,
      status: 'completed'
    });
  }

  return result;
}, {
  connection,
  concurrency: 2,
  stalledInterval: 60000
});

// Error handling
worker.on('failed', async (job, err) => {
  const { runId, runEntityId, entitySnapshot, stageIndex, operationName } = job.data;
  const entityName = entitySnapshot?.name || runEntityId?.slice(0, 8);

  console.error(`[Stage ${stageIndex}] Failed: ${operationName} for "${entityName}" — ${err.message}`);

  // Mark stage as failed with observability
  await db
    .from('pipeline_stages')
    .update({
      status: 'failed',
      error: { message: err.message, stack: err.stack },
      completed_at: new Date().toISOString(),
      retry_count: job.attemptsMade,
      worker_id: workerId
    })
    .eq('run_id', runId)
    .eq('run_entity_id', runEntityId)
    .eq('stage_index', stageIndex);

  const { data: stageRow } = await db
    .from('pipeline_stages')
    .select('id')
    .eq('run_id', runId)
    .eq('run_entity_id', runEntityId)
    .eq('stage_index', stageIndex)
    .single();

  await publishEvent('stage_update', {
    run_id: runId,
    run_entity_id: runEntityId,
    entity_name: entityName,
    stage_id: stageRow?.id,
    stage_index: stageIndex,
    status: 'failed',
    operation: operationName,
    error: err.message
  });

  // If all retries exhausted, fail this entity (not entire run)
  if (job.attemptsMade >= job.opts.attempts) {
    await orchestrator.failEntity(runId, runEntityId, err.message);
    await publishEvent('entity_complete', {
      run_id: runId,
      run_entity_id: runEntityId,
      entity_name: entityName,
      status: 'failed',
      error: err.message
    });
  }
});

worker.on('ready', () => {
  console.log(`Pipeline stage worker ready (${workerId})`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close();
  publisher.disconnect();
  process.exit(0);
});

console.log('Starting pipeline stage worker...');
