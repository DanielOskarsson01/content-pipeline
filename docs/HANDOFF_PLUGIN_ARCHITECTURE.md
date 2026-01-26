# Handoff: Plugin Architecture & Frontend Additions

**Date**: 2026-01-24
**From**: Architecture/Plugin session
**To**: Supabase schema implementation session

---

## What Changed

An architecture session added plugin extensibility, a frontend dashboard, and an AI provider adapter to the project. This affects your Supabase work in one specific way: **there is now an 8th table to create**.

---

## Action Required: Create `plugin_registry` Table

When creating the 7 core tables, also create `plugin_registry` as an 8th table. The full DDL is in:

**`sql/plugin_registry.sql`**

Summary:
```sql
CREATE TABLE plugin_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_name TEXT UNIQUE NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('discovery', 'validation', 'extraction', 'generation', 'filtering', 'output', 'integration', 'transform')),
  author TEXT NOT NULL DEFAULT 'onlyigaming',
  manifest JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- Index on `(type, status)`
- Trigger for auto-updating `updated_at`
- This table will be **empty in Phase 1** — it's a placeholder for Phase 2+ plugin management
- No FKs to other tables — it's self-contained

---

## Context: Why This Table Exists

The operation modules (`modules/operations/*.js`) each export a standardized interface with `name`, `version`, `type`, `configSchema`, and `metadata`. The `plugin_registry` table mirrors this structure in the database so that:

1. The dashboard can list available operations without filesystem access
2. Future plugin versioning/deprecation is tracked centrally
3. Third-party operations can be registered without deploying files to the server

---

## Other New Files (No Action Required from Supabase Session)

These were created but don't affect your schema work:

| File | What |
|------|------|
| `public/index.html` | Dashboard UI (Alpine.js + Tailwind) |
| `modules/operations/_template.js` | Operation module interface template |
| `modules/operations/url-discovery.js` | Example operation implementation |
| `utils/aiProvider.js` | AI adapter (OpenAI + Anthropic) |
| `.mcp.json` | Supabase MCP server config for Claude Code |

---

## Updated Table List (8 Total)

1. `content_items` — Universal content storage
2. `platform_tags` — 352+ tag taxonomy
3. `content_tags` — Junction table (content <-> tags)
4. `projects` — Batch/job definitions
5. `pipeline_templates` — Stage definitions per project type
6. `pipeline_runs` — Execution tracking
7. `pipeline_stages` — Step-level results
8. **`plugin_registry`** — Operation module registry (NEW)

---

*This file can be deleted after the Supabase session has read it.*
