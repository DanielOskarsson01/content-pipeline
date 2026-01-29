-- MVP1b Complete Schema Migration
-- Run this ONCE in Supabase SQL Editor: https://fevxvwqjhndetktujeuu.supabase.co
-- Created: 2026-01-29
--
-- This file combines all required tables for MVP1b testing.
-- Run this if starting fresh or to ensure all tables exist.

-- ============================================
-- 1. ENTITIES: Companies, topics, persons
-- ============================================
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
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
  project_type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'created',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop and recreate constraint to include all statuses
ALTER TABLE projects DROP CONSTRAINT IF EXISTS valid_project_status;
ALTER TABLE projects ADD CONSTRAINT valid_project_status
  CHECK (status IN ('created', 'running', 'completed', 'failed', 'paused'));

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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS valid_run_status;
ALTER TABLE pipeline_runs ADD CONSTRAINT valid_run_status
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused', 'awaiting_approval'));

-- ============================================
-- 4. RUN_ENTITIES: Snapshot of entities per run
-- ============================================
CREATE TABLE IF NOT EXISTS run_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id),
  entity_snapshot JSONB NOT NULL,
  processing_order INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, entity_id)
);

ALTER TABLE run_entities DROP CONSTRAINT IF EXISTS valid_entity_status;
ALTER TABLE run_entities ADD CONSTRAINT valid_entity_status
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval'));

-- ============================================
-- 5. PIPELINE_STAGES: Per-entity, per-step outputs
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  run_entity_id UUID REFERENCES run_entities(id) ON DELETE CASCADE,
  stage_index INTEGER NOT NULL,
  stage_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  output_data JSONB,
  error JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  worker_id TEXT,
  ai_tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, run_entity_id, stage_index)
);

ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS valid_stage_index;
ALTER TABLE pipeline_stages ADD CONSTRAINT valid_stage_index CHECK (stage_index BETWEEN 0 AND 11);

ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS valid_stage_status;
ALTER TABLE pipeline_stages ADD CONSTRAINT valid_stage_status
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval', 'approved'));

CREATE INDEX IF NOT EXISTS idx_stages_run_entity ON pipeline_stages(run_id, run_entity_id, stage_index);
CREATE INDEX IF NOT EXISTS idx_stages_status ON pipeline_stages(status) WHERE status = 'failed';

-- ============================================
-- 6. GENERATED_CONTENT: Final outputs
-- ============================================
CREATE TABLE IF NOT EXISTS generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_entity_id UUID REFERENCES run_entities(id),
  output_type TEXT NOT NULL,
  title TEXT,
  data JSONB NOT NULL,
  tags TEXT[],
  quality_score DECIMAL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

ALTER TABLE generated_content DROP CONSTRAINT IF EXISTS valid_output_type;
ALTER TABLE generated_content ADD CONSTRAINT valid_output_type
  CHECK (output_type IN ('company_profile', 'news_article', 'podcast_summary'));

CREATE INDEX IF NOT EXISTS idx_content_type ON generated_content(output_type);
CREATE INDEX IF NOT EXISTS idx_content_published ON generated_content(published_at) WHERE published_at IS NULL;

-- ============================================
-- 7. DISCOVERED_URLS: Step 1 Discovery output
-- ============================================
CREATE TABLE IF NOT EXISTS discovered_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_entity_id UUID REFERENCES run_entities(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  discovery_method TEXT,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_urls_entity ON discovered_urls(run_entity_id, status);

-- Add unique constraint to prevent duplicate URLs per entity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discovered_urls_entity_url_unique'
  ) THEN
    ALTER TABLE discovered_urls ADD CONSTRAINT discovered_urls_entity_url_unique
      UNIQUE (run_entity_id, url);
  END IF;
END $$;

-- ============================================
-- 8. SCRAPED_PAGES: Step 3 Scraping output
-- ============================================
CREATE TABLE IF NOT EXISTS scraped_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_entity_id UUID REFERENCES run_entities(id) ON DELETE CASCADE,
  discovered_url_id UUID REFERENCES discovered_urls(id),
  url TEXT NOT NULL,
  content_type TEXT,
  raw_content TEXT,
  extracted_data JSONB,
  word_count INTEGER,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pages_entity ON scraped_pages(run_entity_id);

-- ============================================
-- 9. SUBMODULE_RUNS: Individual submodule executions
-- ============================================
CREATE TABLE IF NOT EXISTS submodule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  submodule_type TEXT NOT NULL,
  submodule_name TEXT NOT NULL,
  run_entity_ids UUID[] NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  result_count INTEGER DEFAULT 0,
  results JSONB,
  logs JSONB,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_count INTEGER,
  rejected_at TIMESTAMPTZ
);

ALTER TABLE submodule_runs DROP CONSTRAINT IF EXISTS valid_submodule_status;
ALTER TABLE submodule_runs ADD CONSTRAINT valid_submodule_status
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_submodule_runs_run ON submodule_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_submodule_runs_type_name ON submodule_runs(submodule_type, submodule_name);
CREATE INDEX IF NOT EXISTS idx_submodule_runs_status ON submodule_runs(status) WHERE status IN ('completed', 'approved');

-- ============================================
-- 10. STEP_CONTEXT: Shared CSV data between submodules
-- ============================================
CREATE TABLE IF NOT EXISTS step_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  entities JSONB NOT NULL,
  source_submodule TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_step_context_run ON step_context(run_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_step_context_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS step_context_updated_at ON step_context;
CREATE TRIGGER step_context_updated_at
  BEFORE UPDATE ON step_context
  FOR EACH ROW
  EXECUTE FUNCTION update_step_context_timestamp();

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this after to confirm all 10 tables were created:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'entities', 'projects', 'pipeline_runs', 'run_entities',
    'pipeline_stages', 'generated_content', 'discovered_urls',
    'scraped_pages', 'submodule_runs', 'step_context'
  )
ORDER BY table_name;
-- Should return 10 rows
