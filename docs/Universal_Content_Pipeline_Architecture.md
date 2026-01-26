# Universal Content Pipeline - Architecture & Implementation Guide

**Project Status**: Infrastructure Complete, Schema Finalized, Ready for Implementation
**Last Updated**: 2026-01-25
**Document Version**: 3.1

## Executive Summary

This document outlines the complete architecture for a **Universal Content Intelligence Platform** — a tag-based content library with configurable pipeline execution. All content (scraped pages, entities, generated articles, transcripts) lives in ONE universal table, organized by a 352+ tag taxonomy, and is reusable across projects.

**Key Innovation**: Scrape once, tag, reuse everywhere. A scraped page about a company can serve as source material for a company profile, a news article, a competitor analysis, or a personal bio — all through tag-based discovery.

**Current Status**:
- Infrastructure deployed (Hetzner VPS, Redis, Node.js)
- Schema finalized and stress-tested
- Next: Create Supabase tables, build Express API, BullMQ workers

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Database Schema](#database-schema)
3. [Architecture Design](#architecture-design)
4. [Pipeline Execution](#pipeline-execution)
5. [Content Library Operations](#content-library-operations)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Technical Specifications](#technical-specifications)
8. [Operational Guide](#operational-guide)

---

## System Overview

### Vision
Build a content intelligence platform where:
- ALL content lives in one universal table (content_items)
- Tags from a 352+ taxonomy organize content across dimensions
- Pipeline templates define workflows per content type (configuration, not code)
- Content is scraped once and reused across any number of projects
- Filtered content retains metadata but purges body after 7 days

### Core Principles

1. **Content-Type Agnostic**: No component may hardcode assumptions about companies, news, or any fixed structure
2. **Tag-Based Organization**: 352+ tags across dimensions (DIR, NEWS, GEO, PROD, TYPE, SYSTEM) organize all content
3. **Configuration Over Specialization**: Differences between content types handled via pipeline_templates, not code branches
4. **Persist Everything**: Inputs, outputs, decisions, and status stored at every step
5. **Content Reuse**: Scrape once, tag, query by tags from any project
6. **Human-in-the-Loop**: Review, rejection, and overrides supported at any stage

### Business Needs (Priority Order)

1. **News site**: New content + continuous updates (HIGH PRIORITY)
2. **Podcast/media pages**: Built with content (HIGH PRIORITY)
3. **Company profiles**: Improve existing 1,400 profiles (one use case)
4. **Registration self-service**: Frontend for new company profiles

---

## Database Schema

### Content Library Tables

```sql
-- content_items: THE universal library
-- All scraped pages, entities, generated articles, transcripts live here
CREATE TABLE content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
    -- 'scraped_page', 'entity', 'generated_article', 'transcript', 'summary'
  title TEXT,
  source_url TEXT,  -- unique where not null (dedup key)
  content JSONB,  -- nullable (nulled after retention purge)
  content_format TEXT,  -- 'html', 'markdown', 'json', 'text'
  status TEXT NOT NULL DEFAULT 'active',
    -- 'active', 'filtered_step3', 'filtered_step5', 'superseded', 'archived'
  filter_reason TEXT,  -- 'duplicate', 'too_short', 'untrusted_source', 'irrelevant'
  quality_score DECIMAL,
  word_count INTEGER,
  language TEXT DEFAULT 'en',
  scraped_at TIMESTAMPTZ,
  source_project_id UUID,  -- FK to projects (which project created this)
  source_stage_id UUID,  -- FK to pipeline_stages (which stage created this)
  version INTEGER DEFAULT 1,  -- conflict resolution (latest scrape wins)
  purged_at TIMESTAMPTZ,  -- when body was removed by retention job
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index for deduplication by source_url
CREATE UNIQUE INDEX idx_content_items_source_url
  ON content_items(source_url) WHERE source_url IS NOT NULL;

-- Performance indexes
CREATE INDEX idx_content_items_type ON content_items(content_type);
CREATE INDEX idx_content_items_status ON content_items(status);
CREATE INDEX idx_content_items_scraped_at ON content_items(scraped_at);
```

```sql
-- platform_tags: 352+ tag taxonomy + system tags
-- Dimensions: DIR (directory categories), NEWS (news topics), GEO (geography),
--             PROD (products), TYPE (content types), SYSTEM (internal)
CREATE TABLE platform_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_code TEXT UNIQUE NOT NULL,  -- 'DIR-029', 'NEWS-015', 'SYSTEM:entity:company'
  dimension TEXT NOT NULL,  -- 'DIR', 'NEWS', 'GEO', 'PROD', 'TYPE', 'SYSTEM'
  name TEXT NOT NULL,
  description TEXT,
  parent_group TEXT,  -- grouping within dimension
  status TEXT DEFAULT 'active',  -- 'active', 'deprecated', 'retired'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_platform_tags_dimension ON platform_tags(dimension);
```

```sql
-- content_tags: junction table with UUID FK
-- Links content_items to platform_tags with confidence scoring
CREATE TABLE content_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES platform_tags(id),  -- UUID FK, not text!
  confidence DECIMAL DEFAULT 1.0,  -- 0.0 to 1.0
  source TEXT DEFAULT 'manual',  -- 'manual', 'auto_llm', 'auto_rule'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id, tag_id)
);

CREATE INDEX idx_content_tags_tag_id ON content_tags(tag_id);
CREATE INDEX idx_content_tags_content_id ON content_tags(content_id);
```

### Pipeline Execution Tables

```sql
-- projects: batch/job definition
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_type TEXT NOT NULL,  -- 'company_profile', 'news_article', 'podcast_page'
  config JSONB DEFAULT '{}',  -- project-specific configuration
  status TEXT DEFAULT 'created',  -- 'created', 'running', 'completed', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- pipeline_templates: stage definitions per project type
-- Each project_type has one active template defining its pipeline stages
CREATE TABLE pipeline_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type TEXT NOT NULL,
  name TEXT NOT NULL,
  stages JSONB NOT NULL,
    -- Ordered array: [{name, operation, config, retry_count, timeout_ms}]
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- pipeline_runs: execution tracking per project
CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES pipeline_templates(id),
  status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'paused'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error JSONB
);

-- pipeline_stages: step-level results per run
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_index INTEGER NOT NULL,
  operation_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'skipped'
  input_data JSONB,
  output_data JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error JSONB
);
```

### Key Schema Behaviors

#### Conflict Resolution (Concurrent Scraping)
```sql
-- When the same URL is scraped again, keep the newer version
INSERT INTO content_items (content_type, source_url, content, scraped_at, ...)
ON CONFLICT (source_url)
DO UPDATE SET
  content = EXCLUDED.content,
  scraped_at = EXCLUDED.scraped_at,
  version = content_items.version + 1,
  updated_at = NOW()
WHERE EXCLUDED.scraped_at > content_items.scraped_at;
```

#### Tiered Retention (Daily Cleanup Job)
```sql
-- Filtered content keeps metadata but loses body after 7 days
UPDATE content_items
SET content = NULL, purged_at = NOW()
WHERE status LIKE 'filtered_%'
  AND created_at < NOW() - INTERVAL '7 days'
  AND content IS NOT NULL;
```

#### Freshness Flags (Not Gates)
- >14 days since scraped_at → flag as stale_news (via tag or computed)
- >3 months since scraped_at → flag as stale_company
- Content is NEVER blocked from reuse based on age alone

#### Filter Steps (Steps 3 & 5)
- Step 3 (Source Validation): marks items `status = 'filtered_step3'` with `filter_reason`
- Step 5 (Filtering & Dedup): marks items `status = 'filtered_step5'` with `filter_reason`
- Reasons: 'duplicate', 'too_short', 'untrusted_source', 'irrelevant', 'wrong_language'

---

## Naming Convention

| Term | Definition | Location |
|------|------------|----------|
| **Step** | One of 12 pipeline stages (0-11) | UI, templates |
| **Module** | Operation code that executes a step | `modules/operations/` |
| **Phase** | Configured group of submodules within a module | `config.phases[]` |
| **Submodule** | Single-task unit within a module | `modules/submodules/{type}/` |

**Example**: Step 2 (Discovery) uses the `discovery` module. The module runs phases like "cheap_parallel" containing submodules like `sitemap`, `navigation`, `seed-expansion`.

---

## Architecture Design

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Web Dashboard                         │
│  (Project CRUD, Content Library Browser, Pipeline       │
│   Monitor, Template Config, Phase Editor)               │
└────────────────┬────────────────────────────────────────┘
                 │ HTTP/WebSocket
┌────────────────▼────────────────────────────────────────┐
│                 Express.js API Server                    │
│  /api/projects, /api/content, /api/tags,               │
│  /api/templates, /api/runs, /ws                        │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│              Generic Pipeline Orchestrator               │
│  Reads pipeline_template → Creates pipeline_run →      │
│  Queues stages as BullMQ jobs                          │
└──┬──────────────────────────────────────────────────┬───┘
   │                                                  │
┌──▼──────────────────┐                    ┌─────────▼───┐
│   BullMQ / Redis    │                    │   Supabase  │
│  (Job Queuing)      │◄──────────────────►│ (PostgreSQL)│
└──┬──────────────────┘                    └─────────────┘
   │
┌──▼──────────────────────────────────────────────────────┐
│                     Modules (Dynamic)                    │
│  Loaded based on pipeline_template config              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ discovery    │ │ extraction   │ │ generation   │   │
│  │ (module)     │ │ (module)     │ │ (module)     │   │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘   │
│         │                │                │            │
│    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐      │
│    │submodule│      │submodule│      │submodule│      │
│    │sitemap  │      │cheerio  │      │gpt-4    │      │
│    │search   │      │playwright│     │claude   │      │
│    │rss-feed │      │diffbot  │      │template │      │
│    └─────────┘      └─────────┘      └─────────┘      │
└──────────────────────────────────────────────────────────┘
```

### Module Interface

Every module follows the same interface:

```javascript
// modules/operations/{module-name}.js
module.exports = {
  name: 'discovery',
  type: 'discovery',  // discovery, validation, extraction, generation, qa, packaging
  configSchema: { /* JSON Schema for config validation */ },

  async execute(input, config, context) {
    // input: from previous stage's output_data (or project config for first stage)
    // config: from pipeline_template stage config (includes phases/submodules)
    // context: { db, contentLibrary, tagService, logger }

    // Execute submodules based on config.phases
    for (const phase of config.phases) {
      for (const submoduleName of phase.submodules) {
        const submodule = require(`../submodules/${this.type}/${submoduleName}`);
        results.push(...await submodule.execute(entities, config, context));
      }
    }

    // Single bulk write to database
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
  name: 'sitemap',
  type: 'discovery',           // Which module type this belongs to
  version: '1.0.0',
  description: 'Parse sitemap.xml to discover URLs',
  cost: 'cheap',               // cheap | medium | expensive

  // Pure function - returns results, does NOT write to database
  async execute(entities, config, context) {
    const results = [];
    for (const entity of entities) {
      const urls = await parseSitemap(entity.domain);
      results.push(...urls.map(url => ({ entity_id: entity.id, url })));
    }
    return results;  // Parent module handles storage
  }
};
```

### Content Library Service

Central service for all content_items operations:

```javascript
class ContentLibrary {
  // Query content by tags (AND logic)
  async findByTags(tagCodes, options = {}) { }

  // Query content by type and status
  async findByType(contentType, status = 'active') { }

  // Upsert with conflict resolution (latest wins)
  async upsert(items) { }

  // Apply tags to content items
  async tagItems(contentIds, tagCodes, source = 'auto_rule') { }

  // Mark items as filtered (steps 3 & 5)
  async markFiltered(contentIds, step, reason) { }

  // Check freshness (returns flags, never blocks)
  async checkFreshness(contentId) { }
}
```

---

## Pipeline Execution

### The 12-Step Generic Pipeline (Steps 0–11)

0. **Project Setup** — Name the project, describe its goal, select project type (determines pipeline template), add organizational tags
1. **Input Specification** — Define raw material (URLs, docs, images, video, text, CSV), output intent (article, profile, summary, etc.), and context (geography, language, freshness)
2. **Discovery & Enrichment** — Conditional: expand/enrich inputs from Step 1, or skip if fully specified
3. **Source Validation & Governance** — Trust, policy, relevance checks (FILTER STEP)
4. **Content Extraction** — Reusable extraction for text, media, structured data
5. **Filtering & Adaptive Crawling** — Deduplication, language, adaptive depth (FILTER STEP)
6. **Analysis, Classification & Creation** — Classification, SEO logic, content generation
7. **Validation & QA** — Fact checks, hallucination detection, structural validation
8. **Routing & Flow Control** — Conditional routing, retries, loops
9. **Output Bundling** — HTML, JSON, metadata bundles (output-agnostic)
10. **Distribution** — CMS, APIs, exports
11. **Review & Triggers** — Human approval, rejection, retriggers

### Pipeline Template Example (Company Profile)

```json
{
  "project_type": "company_profile",
  "name": "Standard Company Profile Pipeline",
  "stages": [
    {
      "name": "url_discovery",
      "operation": "url-discovery",
      "config": { "methods": ["sitemap", "navigation", "seed"], "max_urls": 50 }
    },
    {
      "name": "source_validation",
      "operation": "source-validation",
      "config": { "min_domain_authority": 10, "allowed_content_types": ["text/html"] }
    },
    {
      "name": "content_scraping",
      "operation": "content-scrape",
      "config": { "engine": "cheerio", "fallback": "playwright", "timeout_ms": 30000 }
    },
    {
      "name": "content_filtering",
      "operation": "content-filter",
      "config": { "min_word_count": 100, "dedup_threshold": 0.85 }
    },
    {
      "name": "profile_generation",
      "operation": "profile-generate",
      "config": { "model": "gpt-4", "max_tokens": 4000, "temperature": 0.3 }
    },
    {
      "name": "quality_assurance",
      "operation": "qa-validation",
      "config": { "min_score": 0.9, "checks": ["facts", "structure", "seo"] }
    },
    {
      "name": "output_packaging",
      "operation": "output-package",
      "config": { "formats": ["markdown", "json", "html"] }
    }
  ]
}
```

### Content Reuse in Practice

When a news article pipeline runs:
1. `topic-discovery` identifies relevant companies
2. `content-extract` checks content_items for existing scraped pages about those companies
3. If pages exist (from previous company profile pipeline), they're reused directly
4. If pages don't exist, new scraping is triggered
5. New scraped content is tagged and available for future projects

---

## Content Library Operations

### Tag Dimensions

| Dimension | Purpose | Examples |
|-----------|---------|----------|
| DIR | Directory categories | DIR-029 (Payment Gateways), DIR-015 (Slots) |
| NEWS | News topics | NEWS-015 (Regulatory), NEWS-008 (M&A) |
| GEO | Geography | GEO-EU, GEO-UK, GEO-US |
| PROD | Products | PROD-SPORTS, PROD-CASINO |
| TYPE | Content types | TYPE-PROFILE, TYPE-ARTICLE |
| SYSTEM | Internal tags | entity:company:betsson, source:sitemap |

### Querying the Content Library

```javascript
// Find all active scraped pages about payment gateways
const pages = await contentLibrary.findByTags(['DIR-029'], {
  content_type: 'scraped_page',
  status: 'active'
});

// Find all content about Betsson (any type)
const betsson = await contentLibrary.findByTags(['entity:company:betsson']);

// Find stale company content (still usable, just flagged)
const stale = await contentLibrary.findByType('scraped_page', 'active', {
  scraped_before: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 3 months
});
```

---

## Implementation Roadmap

### Phase 1: Platform Foundation (Next)
1. Create all 7 Supabase tables with indexes
2. Seed 352+ tags into platform_tags
3. Build Express API (projects, content, tags, templates, runs)
4. Build generic BullMQ worker with dynamic operation loading
5. Build web dashboard

### Phase 2: Company Profiles (Proves Platform)
1. Create company_profile pipeline_template
2. Implement 7 operations (discovery → packaging)
3. End-to-end test with 6 companies

### Phase 3: News Articles (Business Need)
1. Create news_article pipeline_template
2. Implement news operations
3. Verify cross-project content reuse

### Phase 4: Podcast Pages (Business Need)
1. Create podcast_page pipeline_template
2. Implement podcast operations

---

## Technical Specifications

### Server Infrastructure
- **Provider**: Hetzner Cloud VPS (CX22: 2 vCPU, 4GB RAM, 40GB disk)
- **IP**: 188.245.110.34
- **OS**: Ubuntu 24.04.3 LTS
- **SSH**: `ssh -i ~/.ssh/hetzner_key root@188.245.110.34`

### Technology Stack
- **Runtime**: Node.js 20.20.0 (npm 10.8.2)
- **API**: Express.js with CORS, WebSocket
- **Queue**: BullMQ with Redis 7.0.15
- **Database**: Supabase PostgreSQL
- **Frontend**: HTML + Tailwind CSS + vanilla JS

### Project Structure (New)
```
/opt/content-pipeline/
├── .env                        # Environment configuration
├── package.json                # Dependencies
├── server.js                   # Express API + WebSocket
├── ecosystem.config.js         # PM2 config (api + worker)
├── services/
│   ├── db.js                   # Supabase client
│   ├── contentLibrary.js       # Content library service
│   ├── tagService.js           # Tag operations
│   └── orchestrator.js         # Pipeline run lifecycle
├── modules/
│   ├── operations/             # MODULES (one per step)
│   │   ├── _template.js        # Module interface template
│   │   └── discovery.js        # Discovery module (Step 2)
│   └── submodules/             # SUBMODULES (grouped by module type)
│       └── discovery/
│           ├── _template.js    # Submodule interface template
│           ├── sitemap.js      # Sitemap parsing (cheap)
│           ├── navigation.js   # Navigation links (cheap)
│           ├── seed-expansion.js # Seed URL expansion (cheap)
│           └── search-google.js  # Google Search API (expensive)
├── workers/
│   └── stageWorker.js          # BullMQ consumer (loads modules dynamically)
├── routes/
│   ├── projects.js             # Project CRUD
│   ├── content.js              # Content library API
│   ├── tags.js                 # Tag management
│   ├── templates.js            # Pipeline template CRUD
│   └── runs.js                 # Pipeline run status
├── sql/
│   ├── pipeline_entities.sql   # Entity tracking per run
│   └── discovered_urls.sql     # URLs discovered per entity
├── public/
│   └── index.html              # Web dashboard (with Phase Editor)
└── jobs/
    └── retention.js            # Daily cleanup (purge filtered content body)
```

### Environment Configuration
```bash
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=Danne2025

SUPABASE_URL=https://fevxvwqjhndetktujeuu.supabase.co
SUPABASE_SERVICE_KEY=[configured]

OPENAI_API_KEY=[optional]
ANTHROPIC_API_KEY=[optional]
```

### API Endpoints

```
# Project Management
POST   /api/projects                    # Create project (any type)
GET    /api/projects                    # List (filter: project_type, status)
GET    /api/projects/:id                # Details + run history
POST   /api/projects/:id/start          # Trigger pipeline run
DELETE /api/projects/:id                # Delete project

# Content Library
GET    /api/content                     # Query by tags, type, status
GET    /api/content/:id                 # Single item with tags
POST   /api/content                     # Manual content insert

# Tag Management
GET    /api/tags                        # List all (filter: dimension, status)
GET    /api/tags/:dimension             # Tags in dimension

# Pipeline Templates
GET    /api/templates                   # List templates
POST   /api/templates                   # Create/update template
GET    /api/templates/:project_type     # Active template for type

# Pipeline Runs
GET    /api/runs/:id                    # Run status
GET    /api/runs/:id/stages             # Stage-level progress

# Real-time
WS     /ws                             # WebSocket (pipeline events)

# System
GET    /health                          # Health check
```

---

## Operational Guide

### Starting the System
```bash
ssh -i ~/.ssh/hetzner_key root@188.245.110.34
cd /opt/content-pipeline
node server.js    # Express API + WebSocket
node worker.js    # BullMQ worker (separate process)
```

### Adding a New Content Type
1. Create a pipeline_template in the database (via API or SQL)
2. Create module files in `/modules/operations/`
3. Create submodule files in `/modules/submodules/{type}/`
4. Restart worker (picks up new modules)
5. New content type available in dashboard

### Adding a New Submodule
1. Create file in `/modules/submodules/{type}/{name}.js`
2. Follow the submodule interface (name, type, version, execute)
3. No restart needed — available immediately in Phase Editor

### Daily Maintenance
- Retention job runs automatically (purges filtered content body after 7 days)
- Monitor Redis memory usage
- Check Supabase storage for JSONB growth

### Monitoring
- **Health**: http://188.245.110.34:3000/health
- **Dashboard**: http://188.245.110.34:3000/
- **BullMQ**: Job counts via /api/runs

---

## Cost Analysis

### Infrastructure (Monthly)
| Service | Cost |
|---------|------|
| Hetzner CX22 | ~$6 |
| Supabase (Free/Pro) | $0-25 |
| **Total** | **$6-31** |

### Content Storage Costs
- Active content: ~1KB-50KB per item (JSONB)
- Filtered content: metadata only after 7 days (~200 bytes per row)
- With 10,000 active items: ~50-500MB
- With tiered retention: growth is bounded

### API Costs (Per 100 Operations)
| Service | Cost | Usage |
|---------|------|-------|
| OpenAI GPT-4 | $30 | Generation |
| Anthropic Claude | $15 | Alternative |
| OpenAI GPT-3.5 | $2 | Drafts |
| **Per Profile** | **$0.50-2.00** | Depending on quality |

---

## Document Version History

- **v3.1** (Current): Module/Submodule naming convention, phase-based config
- **v3.0**: Tag-based content library, universal schema, pipeline templates
- **v2.0**: Universal architecture with operation modules (outdated schema)
- **v1.0**: Initial BullMQ architecture proposal

---

**END OF DOCUMENT**

*This document provides the complete architecture for the Universal Content Intelligence Platform. The tag-based content library enables cross-project reuse while pipeline templates provide content-type-specific workflows without code changes.*
