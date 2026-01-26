-- Content-Pipeline MVP Schema
-- Run this in Supabase SQL Editor: https://fevxvwqjhndetktujeuu.supabase.co
-- Created: 2026-01-25

-- ============================================
-- 1. ENTITIES: Companies, topics, persons
-- ============================================
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- 'company', 'topic', 'person'
  name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. PROJECTS: Batch job definitions
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_type TEXT NOT NULL,  -- 'company_profile', 'news_article', 'podcast_page'
  config JSONB DEFAULT '{}',   -- batch_size, concurrency, timeouts
  status TEXT DEFAULT 'created',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_project_status CHECK (status IN ('created', 'running', 'completed', 'failed', 'paused'))
);

-- ============================================
-- 3. PIPELINE_RUNS: One execution of a project
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  entities_total INTEGER DEFAULT 0,
  entities_completed INTEGER DEFAULT 0,
  entities_failed INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_run_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused'))
);

-- ============================================
-- 4. RUN_ENTITIES: Snapshot of entities per run
-- ============================================
CREATE TABLE IF NOT EXISTS run_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id),
  entity_snapshot JSONB NOT NULL,  -- frozen copy at run start
  processing_order INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, entity_id),
  CONSTRAINT valid_entity_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'))
);

-- ============================================
-- 5. PIPELINE_STAGES: Per-entity, per-step outputs
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  run_entity_id UUID REFERENCES run_entities(id) ON DELETE CASCADE,
  stage_index INTEGER NOT NULL,  -- 0-11
  stage_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  output_data JSONB,
  error JSONB,

  -- Observability
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  worker_id TEXT,
  ai_tokens_used INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, run_entity_id, stage_index),
  CONSTRAINT valid_stage_index CHECK (stage_index BETWEEN 0 AND 11),
  CONSTRAINT valid_stage_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_stages_run_entity ON pipeline_stages(run_id, run_entity_id, stage_index);
CREATE INDEX IF NOT EXISTS idx_stages_status ON pipeline_stages(status) WHERE status = 'failed';

-- ============================================
-- 6. GENERATED_CONTENT: Final outputs
-- ============================================
CREATE TABLE IF NOT EXISTS generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_entity_id UUID REFERENCES run_entities(id),
  output_type TEXT NOT NULL,  -- 'company_profile', 'news_article', 'podcast_summary'
  title TEXT,
  data JSONB NOT NULL,
  tags TEXT[],  -- interpreted by News-Section
  quality_score DECIMAL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT valid_output_type CHECK (output_type IN ('company_profile', 'news_article', 'podcast_summary'))
);

CREATE INDEX IF NOT EXISTS idx_content_type ON generated_content(output_type);
CREATE INDEX IF NOT EXISTS idx_content_published ON generated_content(published_at) WHERE published_at IS NULL;

-- ============================================
-- 7. DISCOVERED_URLS: Step 2 bulk output
-- ============================================
CREATE TABLE IF NOT EXISTS discovered_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_entity_id UUID REFERENCES run_entities(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  discovery_method TEXT,  -- 'sitemap', 'navigation', 'seed_expansion', 'search'
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- 'pending', 'scraped', 'filtered', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_urls_entity ON discovered_urls(run_entity_id, status);

-- ============================================
-- 8. SCRAPED_PAGES: Step 4 bulk output
-- ============================================
CREATE TABLE IF NOT EXISTS scraped_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_entity_id UUID REFERENCES run_entities(id) ON DELETE CASCADE,
  discovered_url_id UUID REFERENCES discovered_urls(id),
  url TEXT NOT NULL,
  content_type TEXT,  -- 'html', 'json', 'text'
  raw_content TEXT,
  extracted_data JSONB,
  word_count INTEGER,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pages_entity ON scraped_pages(run_entity_id);

-- ============================================
-- Verification Query
-- ============================================
-- Run this to confirm all tables were created:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('entities', 'projects', 'pipeline_runs', 'run_entities',
--                    'pipeline_stages', 'generated_content', 'discovered_urls', 'scraped_pages');
