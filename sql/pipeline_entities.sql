-- Pipeline Entities Table
-- Tracks the units being processed through the pipeline (e.g., companies).
-- Each pipeline run processes a batch of entities.

CREATE TABLE IF NOT EXISTS pipeline_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to the pipeline run
  run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,

  -- Entity identification
  name TEXT NOT NULL,                          -- e.g., 'Betsson Group'
  domain TEXT,                                 -- e.g., 'betsson.com'

  -- Input data
  seed_urls TEXT[] DEFAULT '{}',               -- Initial URLs to start from
  input_data JSONB DEFAULT '{}',               -- Additional entity-specific config

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',        -- Not yet started
    'processing',     -- Currently being processed
    'completed',      -- All steps finished
    'failed',         -- Processing failed
    'skipped'         -- Skipped (e.g., no data found)
  )),

  -- Quality tracking
  discovery_url_count INT DEFAULT 0,           -- URLs found during discovery
  content_item_count INT DEFAULT 0,            -- Content items created
  quality_score NUMERIC(3,2),                  -- 0.00 to 1.00

  -- Error tracking
  last_error TEXT,
  retry_count INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_entities_run ON pipeline_entities (run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_entities_status ON pipeline_entities (status);
CREATE INDEX IF NOT EXISTS idx_pipeline_entities_domain ON pipeline_entities (domain);

-- Index for finding entities by processing state
CREATE INDEX IF NOT EXISTS idx_pipeline_entities_pending ON pipeline_entities (run_id, status) WHERE status = 'pending';
