# BullMQ Architecture — Universal Content Pipeline

**Last Updated**: 2026-01-25
**Status**: Infrastructure Complete, Ready for Implementation
**Architecture**: Generic worker with dynamic module loading via pipeline_templates

## Naming Convention

| Term | Definition | Location |
|------|------------|----------|
| **Step** | One of 12 pipeline stages (0-11) | UI, templates |
| **Module** | Operation code that executes a step | `modules/operations/` |
| **Phase** | Configured group of submodules within a module | `config.phases[]` |
| **Submodule** | Single-task unit within a module | `modules/submodules/{type}/` |

## Architecture Overview

### Core Design Decision
Build a **generic BullMQ worker** that dynamically loads modules based on `pipeline_templates` configuration. The worker does NOT know about specific content types — it reads the template, loads the module, executes it, and writes results to the universal content library (content_items).

**Key Principle**: The worker is content-type-agnostic. Adding a new content type (news, podcasts, company profiles) requires only:
1. A new pipeline_template row in the database
2. Module files in `/modules/operations/`
3. Submodule files in `/modules/submodules/{type}/`

No worker code changes needed.

## Infrastructure

### Server
- **Provider**: Hetzner Cloud VPS (CX22: 2 vCPU, 4GB RAM)
- **IP**: 188.245.110.34
- **OS**: Ubuntu 24.04.3 LTS
- **Node.js**: 20.20.0

### Redis Configuration
```bash
bind 127.0.0.1
port 6379
requirepass Danne2025
save 900 1
```

### Queue Design

One queue per pipeline stage concept (generic, not per content type):

```javascript
const { Queue } = require('bullmq');

const connection = {
  host: '127.0.0.1',
  port: 6379,
  password: 'Danne2025'
};

// Single pipeline queue — jobs carry their own stage config
const pipelineQueue = new Queue('pipeline-stages', { connection });

// Optional: separate queue for retention cleanup
const maintenanceQueue = new Queue('maintenance', { connection });
```

**Why one queue?** Each job carries its operation name and config from the pipeline_template. The worker dynamically loads the right operation module. No need for separate queues per step.

## Output Data Structure (UI Contract)

The dashboard slide-in results panel expects `output_data` to include per-submodule breakdowns. Modules MUST write results in this format:

```javascript
// pipeline_stages.output_data structure
{
  // Summary stats (displayed in stage header)
  total: 77,
  duration: '4.2s',

  // Per-submodule stats (displayed in stage stats grid)
  stats: {
    by_submodule: { sitemap: 42, navigation: 35 },
    by_phase: { cheap_parallel: 65, fallback_search: 12 }
  },

  // Per-submodule detailed results (displayed in slide-in panel)
  submodule_results: {
    sitemap: {
      items: [
        { url: 'https://example.com/about', status: 'success', title: 'About Page' },
        { url: 'https://example.com/team', status: 'success', title: 'Team' }
      ],
      duration: '1.2s',
      errors: []
    },
    navigation: {
      items: [
        { url: 'https://example.com/products', status: 'success', title: 'Products' }
      ],
      duration: '0.8s',
      errors: []
    }
  }
}
```

**Why this structure?**
- `total` + `stats.by_submodule`: Powers the stage overview in the accordion header
- `submodule_results[name].items`: Powers the slide-in results panel when clicking a submodule row
- No schema changes required — this is JSONB within existing `output_data` column

---

## Worker Architecture

### Generic Worker

```javascript
const { Worker } = require('bullmq');

const worker = new Worker('pipeline-stages', async (job) => {
  const { runId, stageIndex, operationName, config, input } = job.data;

  // 1. Mark stage as running
  await db.updateStageStatus(runId, stageIndex, 'running');

  // 2. Dynamically load module
  const module = require(`./modules/operations/${operationName}`);

  // 3. Create context (shared services)
  const context = {
    db,
    contentLibrary: new ContentLibrary(db),
    tagService: new TagService(db),
    logger: createLogger(runId, stageIndex)
  };

  // 4. Execute module (module loads its own submodules based on config)
  const result = await module.execute(input, config, context);

  // 5. Store stage results
  await db.updateStageResult(runId, stageIndex, result.output_data);

  // 6. Queue next stage (if any)
  await queueNextStage(runId, stageIndex, result);

  return result;
}, { connection });
```

### Module → Submodule Relationship

Modules dynamically load submodules based on phase configuration:

```javascript
// modules/operations/discovery.js (Module)
async execute(input, config, context) {
  for (const phase of config.phases) {
    // Load submodules for this phase
    for (const submoduleName of phase.submodules) {
      const submodule = require(`../submodules/discovery/${submoduleName}`);
      const results = await submodule.execute(entities, config, context);
      // Accumulate results in memory
    }
  }
  // Single database write at end
  await db.from('discovered_urls').upsert(allUrls);
}
```

### Pipeline Orchestrator

```javascript
class PipelineOrchestrator {
  async startRun(projectId) {
    // 1. Get project and its type
    const project = await db.getProject(projectId);

    // 2. Get active template for this project type
    const template = await db.getActiveTemplate(project.project_type);

    // 3. Create pipeline_run record
    const run = await db.createRun(projectId, template.id);

    // 4. Create all pipeline_stages records (pending)
    const stages = template.stages;
    for (let i = 0; i < stages.length; i++) {
      await db.createStage(run.id, stages[i], i);
    }

    // 5. Queue first stage
    await pipelineQueue.add('execute-stage', {
      runId: run.id,
      stageIndex: 0,
      operationName: stages[0].operation,
      config: stages[0].config,
      input: project.config  // First stage gets project config as input
    });

    return run;
  }

  async queueNextStage(runId, completedIndex, result) {
    const run = await db.getRun(runId);
    const template = await db.getTemplate(run.template_id);
    const stages = template.stages;

    const nextIndex = completedIndex + 1;
    if (nextIndex >= stages.length) {
      // Pipeline complete
      await db.updateRunStatus(runId, 'completed');
      return;
    }

    // Queue next stage with previous output as input
    await pipelineQueue.add('execute-stage', {
      runId,
      stageIndex: nextIndex,
      operationName: stages[nextIndex].operation,
      config: stages[nextIndex].config,
      input: result.output_data
    });
  }
}
```

### Module Interface

Every module follows this contract:

```javascript
// modules/operations/{name}.js
module.exports = {
  name: 'module-name',
  type: 'discovery',  // discovery, validation, extraction, generation, qa, packaging
  configSchema: { /* JSON Schema for config validation */ },

  // Main execution function
  async execute(input, config, context) {
    // input: data from previous stage (or project.config for first stage)
    // config: from pipeline_template stage config (includes phases/submodules)
    // context: { db, contentLibrary, tagService, logger }

    // Load and execute submodules based on config.phases
    for (const phase of config.phases) {
      for (const submoduleName of phase.submodules) {
        const submodule = require(`../submodules/${this.type}/${submoduleName}`);
        results.push(...await submodule.execute(entities, config, context));
      }
    }

    // Write to database (single bulk write)
    await context.db.from('discovered_urls').upsert(results);

    return {
      output_data: { total: results.length, stats: { by_submodule, by_phase } },
      content_items_created: []
    };
  }
};
```

### Submodule Interface

Every submodule follows this contract:

```javascript
// modules/submodules/{type}/{name}.js
module.exports = {
  name: 'submodule-name',
  type: 'discovery',           // Which module type this belongs to
  version: '1.0.0',
  description: 'What this submodule does',
  cost: 'cheap',               // cheap | medium | expensive

  // Pure function - returns results, does NOT write to database
  async execute(entities, config, context) {
    const results = [];
    for (const entity of entities) {
      // Do single task (e.g., parse sitemap, search Google)
      const urls = await discoverUrls(entity);
      results.push(...urls.map(url => ({ entity_id: entity.id, url })));
    }
    return results;  // Parent module handles storage
  }
};
```

## Integration with Content Library

### How Operations Write Content

Every operation writes results to `content_items` through the ContentLibrary service:

```javascript
// Operation scrapes a URL → writes to content_items
const item = await context.contentLibrary.upsert({
  content_type: 'scraped_page',
  source_url: 'https://betsson.com/about',
  content: { html: '<html>...', text: 'Betsson is...' },
  content_format: 'html',
  tags: ['entity:company:betsson', 'DIR-029']
});
```

### Conflict Resolution

If the same URL is scraped again (by this project or another):
- The newer version wins (based on scraped_at timestamp)
- Version number increments for audit trail
- All projects referencing this content get the updated version

### Content Reuse Across Projects

```javascript
// News article operation checks if content already exists
const existing = await context.contentLibrary.findByTags(
  ['entity:company:betsson'],
  { content_type: 'scraped_page', status: 'active' }
);

if (existing.length > 0) {
  // Reuse existing content — no need to scrape again
  return { output_data: { reused: existing.length, scraped: 0 } };
} else {
  // Scrape fresh content
  const scraped = await scrapeUrls(input.urls);
  await context.contentLibrary.upsert(scraped);
}
```

## Real-Time Updates (WebSocket)

```javascript
// Worker emits events → Express broadcasts via WebSocket
worker.on('progress', (job, progress) => {
  wss.broadcast({
    type: 'stage_progress',
    runId: job.data.runId,
    stageIndex: job.data.stageIndex,
    progress
  });
});

worker.on('completed', (job, result) => {
  wss.broadcast({
    type: 'stage_completed',
    runId: job.data.runId,
    stageIndex: job.data.stageIndex,
    output: result.output_data
  });
});

worker.on('failed', (job, error) => {
  wss.broadcast({
    type: 'stage_failed',
    runId: job.data.runId,
    stageIndex: job.data.stageIndex,
    error: error.message
  });
});
```

## Error Handling & Retries

```javascript
// Retry config per stage (from pipeline_template)
const stageConfig = {
  "operation": "content-scrape",
  "config": { "engine": "cheerio", "timeout_ms": 30000 },
  "retry_count": 3,
  "retry_delay_ms": 5000
};

// Worker respects retry config
const worker = new Worker('pipeline-stages', processor, {
  connection,
  settings: {
    backoffStrategy: (attemptsMade) => {
      return Math.min(attemptsMade * 5000, 60000); // exponential up to 60s
    }
  }
});
```

## Maintenance Jobs

### Retention Cleanup (Daily)

```javascript
// jobs/retention.js — runs daily via cron or BullMQ repeatable job
async function purgeFilteredContent() {
  const result = await db.query(`
    UPDATE content_items
    SET content = NULL, purged_at = NOW()
    WHERE status LIKE 'filtered_%'
      AND created_at < NOW() - INTERVAL '7 days'
      AND content IS NOT NULL
  `);
  console.log(`Purged ${result.rowCount} filtered items`);
}

// Schedule as repeatable job
maintenanceQueue.add('retention-cleanup', {}, {
  repeat: { cron: '0 3 * * *' }  // Daily at 3 AM
});
```

## Scaling Considerations

### Horizontal Scaling
- Run multiple worker processes for parallel stage execution
- Each worker independently loads operations and processes jobs
- Redis handles job distribution automatically

### Resource Management
- Concurrency limit per worker (default: 5 concurrent jobs)
- Rate limiting for external APIs (configurable per operation)
- Memory-conscious: stream large content, don't load entirely into memory

### Monitoring
- Job counts: waiting, active, completed, failed (via BullMQ API)
- Stage durations: tracked in pipeline_stages table
- Content library size: content_items count by status
- Redis memory: monitor via redis-cli INFO memory

---

## Summary

The BullMQ architecture is intentionally simple:
1. **One queue** for all pipeline stages
2. **One generic worker** that dynamically loads modules
3. **Pipeline templates** define what to run (configuration, not code)
4. **Content library** is the shared data layer (scrape once, reuse everywhere)
5. **Modules** are pluggable with a standard interface
6. **Submodules** are pure functions loaded by modules based on config

**Adding a new capability**:
- New content type = new template + new module files
- New submodule = drop file in `modules/submodules/{type}/` → available immediately
- No infrastructure or worker code changes needed

---

*Document Owner: Claude Opus 4.5*
*Last Major Update: 2026-01-25 — Updated terminology (Module/Submodule naming convention)*
