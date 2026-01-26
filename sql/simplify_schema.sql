-- Simplify Schema: Templates + Projects hierarchy
-- Run this in Supabase SQL editor

-- 1. Create templates table (reusable pipeline configurations)
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  stages JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add template_id and input_data to projects
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates(id),
ADD COLUMN IF NOT EXISTS input_data JSONB DEFAULT '[]';

-- 3. Rename run_entities to run_items for clarity (optional - can keep as-is)
-- We'll keep run_entities but treat it as "run_items" conceptually

-- 4. Create a default "Company Profile" template
INSERT INTO templates (name, description, stages) VALUES (
  'Company Profile',
  'Full 11-step pipeline for comprehensive company profiles',
  '[
    {"name": "Input", "operation": "input-parser"},
    {"name": "Discovery", "operation": "discovery"},
    {"name": "Validation", "operation": "source-validation"},
    {"name": "Extraction", "operation": "content-extraction"},
    {"name": "Filtering", "operation": "content-filtering"},
    {"name": "Enrichment", "operation": "data-enrichment"},
    {"name": "Generation", "operation": "content-generation"},
    {"name": "QA", "operation": "qa-validation"},
    {"name": "Formatting", "operation": "output-formatting"},
    {"name": "Review", "operation": "human-review"},
    {"name": "Publishing", "operation": "publishing"}
  ]'::jsonb
) ON CONFLICT DO NOTHING;

-- 5. Add index for faster template lookups
CREATE INDEX IF NOT EXISTS idx_projects_template_id ON projects(template_id);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(is_active);

-- 6. Enable RLS (Row Level Security) for templates
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (can restrict later)
CREATE POLICY "Allow all access to templates" ON templates
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE templates IS 'Reusable pipeline configurations (e.g., Company Profile, News Digest)';
COMMENT ON COLUMN projects.template_id IS 'Reference to the template this project uses';
COMMENT ON COLUMN projects.input_data IS 'Input items for this project (URLs, company names, etc.)';
