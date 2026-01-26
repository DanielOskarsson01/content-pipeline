/**
 * Pipeline Orchestrator
 * Entity-level processing: each entity tracked separately through all steps
 *
 * Flow:
 * 1. startRun() creates run + run_entities (with snapshots) + pipeline_stages
 * 2. Queue first stage job for each entity
 * 3. Worker processes entity, calls queueNextStage() for that entity
 * 4. When all entities complete all stages, run is marked complete
 */

const { Queue } = require('bullmq');
const db = require('./db');
const entityService = require('./entityService');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD
};

const pipelineQueue = new Queue('pipeline-stages', { connection });

class PipelineOrchestrator {
  /**
   * Start a pipeline run for specified entities
   * @param {string} projectId - Project UUID
   * @param {Array<string>} entityIds - Entity UUIDs to process
   * @param {Array} [stagesOverride] - Optional stages array (from template)
   * @returns {Object} Run with run_entities
   */
  async startRun(projectId, entityIds, stagesOverride = null) {
    // 1. Fetch project
    const { data: project, error: projErr } = await db
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projErr || !project) {
      const err = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    // 2. Get stages (from override, template, or legacy config)
    const stages = stagesOverride || project.config?.stages;
    if (!stages || !Array.isArray(stages) || stages.length === 0) {
      const err = new Error('No pipeline stages configured');
      err.status = 400;
      throw err;
    }

    // 3. Fetch and validate entities
    if (!entityIds || entityIds.length === 0) {
      const err = new Error('entityIds array is required');
      err.status = 400;
      throw err;
    }

    const entities = await entityService.getByIds(entityIds);
    if (entities.length !== entityIds.length) {
      const foundIds = new Set(entities.map(e => e.id));
      const missing = entityIds.filter(id => !foundIds.has(id));
      const err = new Error(`Entities not found: ${missing.join(', ')}`);
      err.status = 404;
      throw err;
    }

    // 4. Create pipeline_runs record
    const { data: run, error: runErr } = await db
      .from('pipeline_runs')
      .insert({
        project_id: projectId,
        status: 'running',
        entities_total: entities.length,
        entities_completed: 0,
        entities_failed: 0,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (runErr) throw runErr;

    // 5. Create run_entities with entity snapshots
    const runEntities = entities.map((entity, index) => ({
      run_id: run.id,
      entity_id: entity.id,
      entity_snapshot: {
        id: entity.id,
        entity_type: entity.entity_type,
        name: entity.name,
        metadata: entity.metadata
      },
      processing_order: index,
      priority: 0,
      status: 'pending'
    }));

    const { data: createdRunEntities, error: reErr } = await db
      .from('run_entities')
      .insert(runEntities)
      .select();

    if (reErr) throw reErr;

    // 6. Create pipeline_stages records for each entity × step
    const allStages = [];
    for (const runEntity of createdRunEntities) {
      for (let i = 0; i < stages.length; i++) {
        allStages.push({
          run_id: run.id,
          run_entity_id: runEntity.id,
          stage_index: i,
          stage_name: stages[i].name,
          status: 'pending'
        });
      }
    }

    const { error: stagesErr } = await db
      .from('pipeline_stages')
      .insert(allStages);

    if (stagesErr) throw stagesErr;

    // 7. Update project status
    await db
      .from('projects')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', projectId);

    // 8. Queue first stage job for each entity
    const firstStage = stages[0];
    for (const runEntity of createdRunEntities) {
      await pipelineQueue.add('execute-stage', {
        runId: run.id,
        runEntityId: runEntity.id,
        entitySnapshot: runEntity.entity_snapshot,
        stageIndex: 0,
        operationName: firstStage.operation,
        config: firstStage.config || {},
        input: project.config?.input || {}
      }, {
        attempts: (firstStage.retry_count || 0) + 1,
        backoff: { type: 'exponential', delay: firstStage.retry_delay_ms || 5000 }
      });
    }

    return {
      ...run,
      run_entities: createdRunEntities,
      stages_created: allStages.length
    };
  }

  /**
   * Queue next stage for a specific entity
   * @param {string} runId - Run UUID
   * @param {string} runEntityId - RunEntity UUID
   * @param {number} completedIndex - Stage index that just completed
   * @param {Object} outputData - Output from completed stage
   */
  async queueNextStage(runId, runEntityId, completedIndex, outputData) {
    // Fetch project config for stages
    const { data: run } = await db
      .from('pipeline_runs')
      .select('*, projects(*)')
      .eq('id', runId)
      .single();

    if (!run || run.status === 'paused') return null;

    const stages = run.projects?.config?.stages || [];
    const nextIndex = completedIndex + 1;

    // Fetch run_entity for snapshot
    const { data: runEntity } = await db
      .from('run_entities')
      .select('*')
      .eq('id', runEntityId)
      .single();

    if (!runEntity) return null;

    if (nextIndex >= stages.length) {
      // This entity completed all stages
      await db
        .from('run_entities')
        .update({ status: 'completed' })
        .eq('id', runEntityId);

      // Update run progress
      await this.updateRunProgress(runId);
      return null;
    }

    // Check if approval is required (default: true for human-in-the-loop)
    const currentStage = stages[completedIndex];
    const requiresApproval = currentStage?.requires_approval !== false; // Default to true

    if (requiresApproval) {
      // Pause for approval - don't auto-queue next stage
      await db
        .from('pipeline_stages')
        .update({ status: 'awaiting_approval' })
        .eq('run_id', runId)
        .eq('run_entity_id', runEntityId)
        .eq('stage_index', completedIndex);

      await db
        .from('run_entities')
        .update({ status: 'awaiting_approval' })
        .eq('id', runEntityId);

      await db
        .from('pipeline_runs')
        .update({ status: 'awaiting_approval' })
        .eq('id', runId);

      return { awaiting_approval: true, completed_stage: completedIndex, next_stage: nextIndex };
    }

    // Auto-continue (approval not required for this stage)
    const nextStage = stages[nextIndex];
    await pipelineQueue.add('execute-stage', {
      runId,
      runEntityId,
      entitySnapshot: runEntity.entity_snapshot,
      stageIndex: nextIndex,
      operationName: nextStage.operation,
      config: nextStage.config || {},
      input: outputData || {}
    }, {
      attempts: (nextStage.retry_count || 0) + 1,
      backoff: { type: 'exponential', delay: nextStage.retry_delay_ms || 5000 }
    });

    return nextIndex;
  }

  /**
   * Approve a stage and continue to next stage
   * @param {string} runId - Run UUID
   * @param {string} runEntityId - RunEntity UUID (optional - if not provided, approves all entities at this stage)
   * @param {number} stageIndex - Stage index to approve
   * @param {Object} additionalInput - Optional additional input to merge with stage output
   */
  async approveStage(runId, stageIndex, runEntityId = null, additionalInput = {}) {
    // Fetch project config for stages
    const { data: run } = await db
      .from('pipeline_runs')
      .select('*, projects(*)')
      .eq('id', runId)
      .single();

    if (!run) {
      const err = new Error('Run not found');
      err.status = 404;
      throw err;
    }

    const stages = run.projects?.config?.stages || [];
    const nextIndex = stageIndex + 1;

    if (nextIndex >= stages.length) {
      // No more stages - mark as completed
      if (runEntityId) {
        await db.from('run_entities').update({ status: 'completed' }).eq('id', runEntityId);
      }
      await this.updateRunProgress(runId);
      return { completed: true };
    }

    // Get entities to approve (specific one or all awaiting)
    let entitiesToApprove;
    if (runEntityId) {
      const { data: entity } = await db
        .from('run_entities')
        .select('*')
        .eq('id', runEntityId)
        .single();
      entitiesToApprove = entity ? [entity] : [];
    } else {
      const { data: entities } = await db
        .from('run_entities')
        .select('*')
        .eq('run_id', runId)
        .eq('status', 'awaiting_approval');
      entitiesToApprove = entities || [];
    }

    if (entitiesToApprove.length === 0) {
      const err = new Error('No entities awaiting approval');
      err.status = 400;
      throw err;
    }

    const nextStage = stages[nextIndex];
    let queued = 0;

    for (const runEntity of entitiesToApprove) {
      // Get output from the completed stage
      const { data: prevStage } = await db
        .from('pipeline_stages')
        .select('output_data')
        .eq('run_id', runId)
        .eq('run_entity_id', runEntity.id)
        .eq('stage_index', stageIndex)
        .single();

      // Merge previous output with any additional input provided
      const input = { ...(prevStage?.output_data || {}), ...additionalInput };

      // Mark stage as approved
      await db
        .from('pipeline_stages')
        .update({ status: 'approved' })
        .eq('run_id', runId)
        .eq('run_entity_id', runEntity.id)
        .eq('stage_index', stageIndex);

      // Update entity status
      await db
        .from('run_entities')
        .update({ status: 'running' })
        .eq('id', runEntity.id);

      // Queue next stage
      await pipelineQueue.add('execute-stage', {
        runId,
        runEntityId: runEntity.id,
        entitySnapshot: runEntity.entity_snapshot,
        stageIndex: nextIndex,
        operationName: nextStage.operation,
        config: nextStage.config || {},
        input
      }, {
        attempts: (nextStage.retry_count || 0) + 1,
        backoff: { type: 'exponential', delay: nextStage.retry_delay_ms || 5000 }
      });

      queued++;
    }

    // Update run status back to running
    await db
      .from('pipeline_runs')
      .update({ status: 'running' })
      .eq('id', runId);

    return { approved: queued, next_stage: nextIndex };
  }

  /**
   * Update run progress counters and check for completion
   * @param {string} runId - Run UUID
   */
  async updateRunProgress(runId) {
    // Count completed and failed entities
    const { data: completed } = await db
      .from('run_entities')
      .select('id', { count: 'exact' })
      .eq('run_id', runId)
      .eq('status', 'completed');

    const { data: failed } = await db
      .from('run_entities')
      .select('id', { count: 'exact' })
      .eq('run_id', runId)
      .eq('status', 'failed');

    const { data: run } = await db
      .from('pipeline_runs')
      .select('entities_total')
      .eq('id', runId)
      .single();

    const completedCount = completed?.length || 0;
    const failedCount = failed?.length || 0;

    await db
      .from('pipeline_runs')
      .update({
        entities_completed: completedCount,
        entities_failed: failedCount
      })
      .eq('id', runId);

    // Check if all entities are done
    if (run && (completedCount + failedCount) >= run.entities_total) {
      const finalStatus = failedCount === run.entities_total ? 'failed' : 'completed';
      await db
        .from('pipeline_runs')
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString()
        })
        .eq('id', runId);

      // Update project status
      const { data: updatedRun } = await db
        .from('pipeline_runs')
        .select('project_id')
        .eq('id', runId)
        .single();

      if (updatedRun) {
        await db
          .from('projects')
          .update({ status: finalStatus, updated_at: new Date().toISOString() })
          .eq('id', updatedRun.project_id);
      }
    }
  }

  /**
   * Mark entity as failed and update run progress
   * @param {string} runId - Run UUID
   * @param {string} runEntityId - RunEntity UUID
   * @param {string|Object} error - Error details
   */
  async failEntity(runId, runEntityId, error) {
    await db
      .from('run_entities')
      .update({ status: 'failed' })
      .eq('id', runEntityId);

    await this.updateRunProgress(runId);
  }

  /**
   * Pause a run (stop queuing new jobs)
   * @param {string} runId - Run UUID
   */
  async pauseRun(runId) {
    await db
      .from('pipeline_runs')
      .update({ status: 'paused' })
      .eq('id', runId);

    const { data: run } = await db
      .from('pipeline_runs')
      .select('project_id')
      .eq('id', runId)
      .single();

    if (run) {
      await db
        .from('projects')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', run.project_id);
    }
  }

  /**
   * Resume a paused run
   * @param {string} runId - Run UUID
   */
  async resumeRun(runId) {
    // Get run and project
    const { data: run } = await db
      .from('pipeline_runs')
      .select('*, projects(*)')
      .eq('id', runId)
      .single();

    if (!run || run.status !== 'paused') return null;

    // Find pending entities and their next stage
    const { data: pendingEntities } = await db
      .from('run_entities')
      .select('*')
      .eq('run_id', runId)
      .in('status', ['pending', 'running']);

    const stages = run.projects?.config?.stages || [];

    // For each pending entity, find their latest completed stage and queue next
    for (const runEntity of pendingEntities || []) {
      const { data: latestStage } = await db
        .from('pipeline_stages')
        .select('stage_index')
        .eq('run_entity_id', runEntity.id)
        .eq('status', 'completed')
        .order('stage_index', { ascending: false })
        .limit(1)
        .single();

      const nextIndex = latestStage ? latestStage.stage_index + 1 : 0;

      if (nextIndex < stages.length) {
        const nextStage = stages[nextIndex];

        // Get output from previous stage
        let input = {};
        if (latestStage) {
          const { data: prevStageData } = await db
            .from('pipeline_stages')
            .select('output_data')
            .eq('run_entity_id', runEntity.id)
            .eq('stage_index', latestStage.stage_index)
            .single();
          input = prevStageData?.output_data || {};
        }

        await pipelineQueue.add('execute-stage', {
          runId,
          runEntityId: runEntity.id,
          entitySnapshot: runEntity.entity_snapshot,
          stageIndex: nextIndex,
          operationName: nextStage.operation,
          config: nextStage.config || {},
          input
        });
      }
    }

    // Update statuses
    await db
      .from('pipeline_runs')
      .update({ status: 'running' })
      .eq('id', runId);

    await db
      .from('projects')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', run.project_id);

    return true;
  }

  /**
   * Retry failed entities in a run
   * @param {string} runId - Run UUID
   */
  async retryFailed(runId) {
    const { data: run } = await db
      .from('pipeline_runs')
      .select('*, projects(*)')
      .eq('id', runId)
      .single();

    if (!run) return null;

    const stages = run.projects?.config?.stages || [];

    // Find failed entities
    const { data: failedEntities } = await db
      .from('run_entities')
      .select('*')
      .eq('run_id', runId)
      .eq('status', 'failed');

    if (!failedEntities || failedEntities.length === 0) return { retried: 0 };

    // Reset failed entities to pending
    await db
      .from('run_entities')
      .update({ status: 'pending' })
      .eq('run_id', runId)
      .eq('status', 'failed');

    // Queue first stage for each (restart from beginning)
    const firstStage = stages[0];
    for (const runEntity of failedEntities) {
      await pipelineQueue.add('execute-stage', {
        runId,
        runEntityId: runEntity.id,
        entitySnapshot: runEntity.entity_snapshot,
        stageIndex: 0,
        operationName: firstStage.operation,
        config: firstStage.config || {},
        input: run.projects?.config?.input || {}
      });
    }

    // Update run status
    await db
      .from('pipeline_runs')
      .update({
        status: 'running',
        entities_failed: 0
      })
      .eq('id', runId);

    return { retried: failedEntities.length };
  }

  /**
   * Mark entire run as failed (legacy method for backward compatibility)
   */
  async failRun(runId, error) {
    await db
      .from('pipeline_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: { message: typeof error === 'string' ? error : error.message }
      })
      .eq('id', runId);

    const { data: run } = await db
      .from('pipeline_runs')
      .select('project_id')
      .eq('id', runId)
      .single();

    if (run) {
      await db
        .from('projects')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', run.project_id);
    }
  }
}

module.exports = new PipelineOrchestrator();
