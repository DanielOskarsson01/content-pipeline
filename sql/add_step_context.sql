-- Add step_context table for shared CSV data between submodules
-- Run this in Supabase SQL Editor
-- Created: 2026-01-29

-- ============================================
-- STEP_CONTEXT: Shared entity data within a step
-- ============================================
-- When a user uploads a CSV in one submodule, the parsed entities
-- are stored here so other submodules in the same step can access them.

CREATE TABLE IF NOT EXISTS step_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  entities JSONB NOT NULL,           -- [{entity_name, website, linkedin, youtube, ...}]
  source_submodule TEXT,             -- which submodule uploaded this data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, step_index)
);

-- Index for quick lookups by run
CREATE INDEX IF NOT EXISTS idx_step_context_run ON step_context(run_id);

-- ============================================
-- Trigger to update updated_at on changes
-- ============================================
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
-- Verification
-- ============================================
-- Run this to confirm the table was created:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'step_context';
