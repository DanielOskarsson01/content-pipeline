-- Plugin Registry Table
-- Tracks registered operation modules, their versions, and configurations.
-- Populated in Phase 2+ when plugin management is needed.
-- For Phase 1, operations are loaded from the filesystem (modules/operations/).

CREATE TABLE IF NOT EXISTS plugin_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Plugin identity
  plugin_name TEXT UNIQUE NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('discovery', 'validation', 'extraction', 'generation', 'filtering', 'output', 'integration', 'transform')),

  -- Authorship
  author TEXT NOT NULL DEFAULT 'onlyigaming',

  -- Full manifest (configSchema, metadata, dependencies)
  manifest JSONB NOT NULL DEFAULT '{}',

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'disabled')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by type and status
CREATE INDEX IF NOT EXISTS idx_plugin_registry_type_status ON plugin_registry (type, status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_plugin_registry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plugin_registry_updated_at
  BEFORE UPDATE ON plugin_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_plugin_registry_timestamp();

-- Example insert (for reference, not executed):
-- INSERT INTO plugin_registry (plugin_name, version, type, manifest) VALUES (
--   'url-discovery',
--   '1.0.0',
--   'discovery',
--   '{
--     "description": "Discovers URLs from sitemaps, navigation, and seed expansion",
--     "tags": ["discovery", "urls", "sitemap", "crawl"],
--     "configSchema": { "type": "object", "properties": { "methods": { "type": "array" } }, "required": ["methods"] },
--     "inputType": "{ entities: [{ name, domain, seed_urls? }] }",
--     "outputType": "{ discovered_urls: [{ url, source_method, entity }] }",
--     "estimatedDuration": "30-60 seconds per entity"
--   }'
-- );
