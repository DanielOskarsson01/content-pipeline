-- Discovered URLs Table
-- Tracks URLs found during the discovery phase, linked to entities.
-- Used by config-driven discovery modules before content extraction.

CREATE TABLE IF NOT EXISTS discovered_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to the entity this URL belongs to
  entity_id UUID NOT NULL REFERENCES pipeline_entities(id) ON DELETE CASCADE,

  -- The discovered URL
  url TEXT NOT NULL,

  -- Discovery metadata
  discovery_submodule TEXT NOT NULL,           -- e.g., 'sitemap', 'navigation', 'search-google'
  discovery_phase TEXT,                        -- e.g., 'cheap_parallel', 'fallback_search'

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',        -- Discovered, not yet scraped
    'queued',         -- In scraping queue
    'scraped',        -- Successfully scraped
    'failed',         -- Scraping failed
    'skipped',        -- Filtered out during processing
    'duplicate'       -- Duplicate content detected
  )),

  -- Optional metadata (depth, title, priority, etc.)
  metadata JSONB DEFAULT '{}',

  -- Scraping results (populated after scraping)
  content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,  -- Link to extracted content
  error_message TEXT,                           -- If status = 'failed'

  -- Timestamps
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scraped_at TIMESTAMPTZ,

  -- Unique constraint: one URL per entity
  UNIQUE(entity_id, url)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_discovered_urls_entity ON discovered_urls (entity_id);
CREATE INDEX IF NOT EXISTS idx_discovered_urls_status ON discovered_urls (status);
CREATE INDEX IF NOT EXISTS idx_discovered_urls_submodule ON discovered_urls (discovery_submodule);

-- Index for finding pending URLs to scrape
CREATE INDEX IF NOT EXISTS idx_discovered_urls_pending ON discovered_urls (entity_id, status) WHERE status = 'pending';
