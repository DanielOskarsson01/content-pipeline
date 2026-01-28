-- Add submodule_runs table for tracking individual submodule executions
-- Run this in Supabase SQL Editor
-- Created: 2026-01-27

-- ============================================
-- 1. SUBMODULE_RUNS: Individual submodule executions
-- ============================================
CREATE TABLE IF NOT EXISTS submodule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  submodule_type TEXT NOT NULL,        -- 'discovery', 'validation', 'extraction', etc.
  submodule_name TEXT NOT NULL,        -- 'sitemap', 'navigation', 'seed-expansion', etc.
  run_entity_ids UUID[] NOT NULL,      -- Which run_entities this was executed for
  config JSONB DEFAULT '{}',           -- Config used for this execution

  -- Execution status
  status TEXT DEFAULT 'pending',       -- 'pending', 'running', 'completed', 'failed', 'approved', 'rejected'
  result_count INTEGER DEFAULT 0,
  results JSONB,                       -- Array of results (URLs, validations, etc.)
  logs JSONB,                          -- Execution logs
  error TEXT,

  -- Timing
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Approval tracking
  approved_at TIMESTAMPTZ,
  approved_count INTEGER,
  rejected_at TIMESTAMPTZ,

  CONSTRAINT valid_submodule_status CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'approved', 'rejected')
  )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_submodule_runs_run ON submodule_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_submodule_runs_type_name ON submodule_runs(submodule_type, submodule_name);
CREATE INDEX IF NOT EXISTS idx_submodule_runs_status ON submodule_runs(status) WHERE status IN ('completed', 'approved');

-- ============================================
-- 2. Update existing constraints to include new statuses
-- ============================================

-- Update pipeline_runs status constraint to include 'awaiting_approval'
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS valid_run_status;
ALTER TABLE pipeline_runs ADD CONSTRAINT valid_run_status
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused', 'awaiting_approval'));

-- Update run_entities status constraint to include 'awaiting_approval'
ALTER TABLE run_entities DROP CONSTRAINT IF EXISTS valid_entity_status;
ALTER TABLE run_entities ADD CONSTRAINT valid_entity_status
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval'));

-- Update pipeline_stages status constraint to include 'awaiting_approval' and 'approved'
ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS valid_stage_status;
ALTER TABLE pipeline_stages ADD CONSTRAINT valid_stage_status
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval', 'approved'));

-- ============================================
-- 3. Add unique constraint for discovered_urls
-- ============================================
-- Prevent duplicate URLs per run_entity
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
-- Verification
-- ============================================
-- Run this to confirm the table was created:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'submodule_runs';
