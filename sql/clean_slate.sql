-- Content-Pipeline: Clean Slate Migration
-- DELETES all old tables, creates new schema fresh
-- Run in Supabase SQL Editor
-- Created: 2026-01-25

-- ============================================
-- STEP 1: Drop old tables (CASCADE removes dependencies)
-- ============================================

-- Old universal schema tables
DROP TABLE IF EXISTS content_tags CASCADE;
DROP TABLE IF EXISTS content_items CASCADE;
DROP TABLE IF EXISTS platform_tags CASCADE;

-- Old pipeline tables
DROP TABLE IF EXISTS pipeline_stages CASCADE;
DROP TABLE IF EXISTS pipeline_runs CASCADE;
DROP TABLE IF EXISTS projects CASCADE;

-- Old intermediate tables
DROP TABLE IF EXISTS discovered_urls CASCADE;
DROP TABLE IF EXISTS scraped_pages CASCADE;
DROP TABLE IF EXISTS generated_content CASCADE;

-- Old entity tables
DROP TABLE IF EXISTS run_entities CASCADE;
DROP TABLE IF EXISTS entities CASCADE;

-- Old POC tables (if you want to remove these too, uncomment):
-- DROP TABLE IF EXISTS companies CASCADE;
-- DROP TABLE IF EXISTS discovery_links CASCADE;
-- DROP TABLE IF EXISTS content_raw CASCADE;
-- DROP TABLE IF EXISTS content_json_draft CASCADE;

-- ============================================
-- STEP 2: Create new tables
-- ============================================

-- 1. ENTITIES
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROJECTS
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'created',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_project_status CHECK (status IN ('created', 'running', 'completed', 'failed', 'paused'))
);

-- 3. PIPELINE_RUNS
CREATE TABLE pipeline_runs (
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

-- 4. RUN_ENTITIES
CREATE TABLE run_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id),
  entity_snapshot JSONB NOT NULL,
  processing_order INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, entity_id),
  CONSTRAINT valid_entity_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'))
);

-- 5. PIPELINE_STAGES
CREATE TABLE pipeline_stages (
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
  UNIQUE(run_id, run_entity_id, stage_index),
  CONSTRAINT valid_stage_index CHECK (stage_index BETWEEN 0 AND 11),
  CONSTRAINT valid_stage_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'))
);

CREATE INDEX idx_stages_run_entity ON pipeline_stages(run_id, run_entity_id, stage_index);
CREATE INDEX idx_stages_status ON pipeline_stages(status) WHERE status = 'failed';

-- 6. GENERATED_CONTENT
CREATE TABLE generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_entity_id UUID REFERENCES run_entities(id),
  output_type TEXT NOT NULL,
  title TEXT,
  data JSONB NOT NULL,
  tags TEXT[],
  quality_score DECIMAL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT valid_output_type CHECK (output_type IN ('company_profile', 'news_article', 'podcast_summary'))
);

CREATE INDEX idx_content_type ON generated_content(output_type);
CREATE INDEX idx_content_published ON generated_content(published_at) WHERE published_at IS NULL;

-- 7. DISCOVERED_URLS
CREATE TABLE discovered_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_entity_id UUID REFERENCES run_entities(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  discovery_method TEXT,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_urls_entity ON discovered_urls(run_entity_id, status);

-- 8. SCRAPED_PAGES
CREATE TABLE scraped_pages (
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

CREATE INDEX idx_pages_entity ON scraped_pages(run_entity_id);

-- ============================================
-- STEP 3: Verify
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('entities', 'projects', 'pipeline_runs', 'run_entities',
                   'pipeline_stages', 'generated_content', 'discovered_urls', 'scraped_pages')
ORDER BY table_name;

-- Expected result: 8 rows
