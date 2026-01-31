-- Add per-result approval tracking for submodule outputs
-- Run this in Supabase SQL Editor: https://fevxvwqjhndetktujeuu.supabase.co
-- Created: 2026-01-31
--
-- This migration adds:
-- 1. submodule_result_approvals table for per-result approval tracking
-- 2. rejected_count column to submodule_runs

-- ============================================
-- 1. SUBMODULE_RESULT_APPROVALS: Per-result approval tracking
-- ============================================
CREATE TABLE IF NOT EXISTS submodule_result_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  submodule_run_id UUID NOT NULL REFERENCES submodule_runs(id) ON DELETE CASCADE,

  -- Result identification
  result_index INTEGER NOT NULL,           -- Position in submodule_runs.results array
  result_url TEXT,                         -- Denormalized for quick display (nullable for non-URL results)
  result_entity_id UUID,                   -- Entity this result belongs to
  result_entity_name TEXT,                 -- Denormalized entity name

  -- Approval state
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,                   -- Only populated if status='rejected'

  -- Audit
  decided_at TIMESTAMPTZ,                  -- When approval/rejection was made
  decided_by TEXT,                         -- User/system that made decision (future: user_id)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(submodule_run_id, result_index)   -- One approval record per result
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sra_submodule_run ON submodule_result_approvals(submodule_run_id);
CREATE INDEX IF NOT EXISTS idx_sra_status ON submodule_result_approvals(status);
CREATE INDEX IF NOT EXISTS idx_sra_entity ON submodule_result_approvals(result_entity_id);

-- ============================================
-- 2. ADD rejected_count TO submodule_runs
-- ============================================
ALTER TABLE submodule_runs ADD COLUMN IF NOT EXISTS rejected_count INTEGER DEFAULT 0;

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this after to confirm the table was created:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'submodule_result_approvals';
-- Should return 1 row

-- Check columns exist:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'submodule_runs'
  AND column_name = 'rejected_count';
-- Should return 1 row
