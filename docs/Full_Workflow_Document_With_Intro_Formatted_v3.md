# Universal Content Pipeline — Master Workflow Document (Steps 0–11)

**Version**: 3.0 (Updated 2026-01-23)
**Previous**: v2 was company-profile-specific. v3 reframes for universal content platform.
**Architecture**: Tag-based content library with configurable pipeline templates.

---

## Purpose & Fit

This workflow defines the **generic 12-step pipeline (Steps 0–11)** for the Universal Content Intelligence Platform. It is content-type-agnostic — the same steps apply to company profiles, news articles, podcast pages, competitor analyses, and any future content type.

**Each content type** configures which operations run at each step via `pipeline_templates`. The steps themselves are universal.

The pipeline ensures:

- **Completeness**: no thin content, every item reaches QA
- **Content Reuse**: all scraped/generated content stored in the universal `content_items` table with tags
- **Traceability**: every decision logged in `pipeline_stages`
- **Evolution**: tags and content grow across projects, benefiting all future work

### Content Types (Configuration, Not Code)

Each content type is a `pipeline_template` that selects operations per step:

| Content Type | Template | Key Operations |
|---|---|---|
| Company Profile | `company_profile` | url-discovery, content-scrape, profile-generate |
| News Article | `news_article` | topic-discovery, source-validate, article-generate |
| Podcast Page | `podcast_page` | metadata-extract, transcript-generate, page-generate |
| Competitor Analysis | `competitor_analysis` | multi-entity-discover, compare-generate |

Adding a new content type = new template row + operation modules. No infrastructure changes.

---

## Workflow Philosophy

The design principle is **operations, not monoliths**.

- Every step runs an **operation module** (pluggable function with standard interface)
- Each operation reads from the **content library** (content_items + tags) and writes back
- Pipeline templates define the sequence — configuration, not code branches
- All content is tagged and reusable across projects

### Content Library Integration

Every operation interacts with the shared content library:

```
Operation reads → content_items (by tags) → processes → writes → content_items (with new tags)
```

This means:
- A company profile operation can reuse scraped pages from a previous news article project
- A news article operation can reference existing company profiles
- Nothing is scraped twice for the same URL (conflict resolution: latest wins)

### Loopbacks

- **Automated Router (Step 8)** handles failures, routing back to earlier steps
- **Manual Review (Step 11)** provides human oversight
- Nothing progresses without valid QA or explicit approval

---

## Architecture Overview

### Data Flow

```
Project Config → Pipeline Template → Operations (Steps 0-11) → content_items + tags
```

### Storage

All content writes to ONE table:

```sql
content_items (
  id, content_type, title, source_url, content JSONB,
  status, filter_reason, quality_score, version,
  tags via content_tags junction
)
```

### Orchestration

- **BullMQ**: Single `pipeline-stages` queue
- **Worker**: Dynamically loads operation per stage from template
- **Supabase**: Source of truth for all content and pipeline state

### Tools

- **BullMQ + Redis** — Job orchestration (replaces n8n from v2)
- **Supabase** — Content library, pipeline state, audit trail
- **LLMs (OpenAI, Claude)** — Analysis, generation, QA
- **Cheerio/Readability** — Default static parsers
- **Playwright** — JS-heavy fallback
- **Express.js** — API server
- **WebSocket** — Real-time updates

---

## Outputs & Canonicalization

Every approved content item is packaged into configurable output formats:

- **Markdown** — canonical text source
- **JSON** — structured fields
- **HTML** — schema.org ready
- **Meta** — title, description, keywords
- **Media refs** — logos, images, videos
- **Manifest** — artifact list + checksums

Output format is defined per content type in the pipeline_template.

---

## Validation Principles

- **Evidence-based**: every claim must cite a source
- **No hallucinations**: unsupported facts rejected in QA
- **Tag-based taxonomy**: content organized by 352+ tags across dimensions
- **Freshness flags, not gates**: old content flagged but never blocked
- **Loopbacks not failures**: weak content routed back for improvement
- **Human review is final**: Step 11 reviewer decides publish/reject

---

## The 12 Steps (Steps 0–11)

### Step 0 — Project Setup

**Generic Purpose**: Create and configure the project before any pipeline work begins. Name the project, describe its goal, select a project type (which determines the pipeline template), and add tags for organization and discovery.

**Operation**: Creates a `projects` record with name, description, project_type, and initial tags. The project_type selects the appropriate `pipeline_template` that defines what operations run in subsequent steps.

#### Fields

| Field | Required | Description |
|-------|----------|-------------|
| Project Name | Yes | Human-readable identifier (e.g., "Betsson Company Research", "Nordic Market News Q1") |
| Description | No | What should this project produce? What's the goal? |
| Project Type | Yes | Selects pipeline template: company-profile, news-article, podcast, research, competitor-analysis, faq, custom |
| Tags | No | Organizational tags for discovery (e.g., igaming, nordic, betsson, Q1-2025) |

#### Behavior

- Creating a new project opens Step 0 as the first active step
- Project type determines which pipeline template is loaded
- Tags are stored in `content_tags` linked to the project for later filtering/discovery
- Once Step 0 is completed, Step 1 (Input Specification) becomes active

---

### Step 1 — Input Specification

**Generic Purpose**: Define what raw material is being fed into the pipeline, what content to produce, and narrow the context.

**Operation**: Validates input formats, establishes scope, creates project record.

#### Input Sources (what are you feeding the pipeline?)

| Input Type | Description | Examples |
|-----------|-------------|----------|
| URLs | One or many links to scrape | Homepage, article links, directory listings |
| Documents/Files | Uploaded files to parse | PDFs, Word docs, text files, spreadsheets |
| Images | Visual content to analyze or use | Logos, screenshots, infographics |
| Video/Audio | Media to transcribe or process | Podcast episodes, interviews, webinars |
| Manual Text | Pasted content directly | Notes, briefs, outlines |
| CSV/Batch | Structured list of entities or URLs | Company name + URL pairs, topic lists |

#### Output Intent (what do you want to produce?)

This is the **content type intent** — what the pipeline should generate. Not the output format (HTML/JSON/MD — that's Step 9).

- Article / News piece
- Company profile
- Summary / Digest
- FAQ content
- Podcast page / Show notes
- Competitor analysis
- Research report
- Custom (user-defined)

#### Context Narrowing

- **Geography**: Where is this content relevant? (Global, Europe, Nordic, UK, US, Asia Pacific, etc.)
- **Language**: What language should the output be in? (English, Swedish, German, etc.)
- **Freshness**: How recent should sources be? (Any, last 30 days, last 90 days, last year)

#### Key Design Decisions

- **No forced project types**: The pipeline is universal — output intent is a hint for template selection, not a hard constraint
- **Input validation is format-only**: Valid URL syntax, readable file formats, parseable CSV. Reachability/trust checks are Step 3's job
- **Reference docs (tone guides, format specs, keyword packs) belong in Templates / Step 6 config** — they are generation instructions, not inputs
- **Input type metadata stored**: `input_type` field in projects table enables downstream operations to branch appropriately

**Writes to**: `projects` table with config JSONB containing input sources, output intent, and context narrowing parameters

---

### Step 2 — Discovery & Enrichment

**Generic Purpose**: Content-agnostic discovery, enrichment, or expansion of inputs from Step 1. This step is **conditional** — its behavior depends on what was provided in Step 1.

**Operations write discovered items to**: `content_items` (content_type: 'discovered_url' or 'metadata', status: 'pending')

**Tags applied**: entity:{type}:{name}, source:{method}, relevant dimension tags

#### Conditional Behavior Based on Input Type

| Step 1 Input | Step 2 Action |
|-------------|---------------|
| URLs (fully specified) | Optional expansion: discover related pages via sitemap, navigation, seeds |
| Entity names (CSV batch) | Active discovery: find URLs via search, directories, sitemaps |
| Documents/files | Extract entities/topics, optionally discover supplementary sources |
| Images | Extract metadata (EXIF, OCR text), identify entities |
| Video/audio | Extract metadata, identify speakers/topics for supplementary discovery |
| Manual text | Parse for entities/URLs, optionally discover related sources |

#### Discovery Operations (selected by template):
- **url-discovery-sitemap**: Parse sitemap.xml for related pages
- **url-discovery-navigation**: Extract homepage navigation links
- **url-discovery-seeds**: Expand known page patterns (/about, /products, /press, etc.)
- **url-discovery-search**: Google CSE or search API for mentions (optional)
- **url-discovery-directories**: Discover directory listings (optional)
- **url-discovery-rss**: Probe for RSS feeds (optional)
- **topic-discovery**: RSS feeds, Google News, industry sources
- **metadata-extract**: Parse RSS feed, Spotify API, Apple Podcasts

#### Key Design Decision
If Step 1 already provides complete URLs and no enrichment is needed, this step can be **skipped** — the URLs pass directly to Step 3 for validation.

**Content Reuse**: Before scraping, operations check content_items for existing content with matching tags. If fresh content exists, skip scraping.

---

### Step 3 — Source Validation & Governance (FILTER STEP)

**Generic Purpose**: Trust, policy, and relevance checks before extraction.

**Filter behavior**: Items failing validation are marked `status = 'filtered_step3'` with `filter_reason`.

**Body purged after 7 days** (tiered retention). Metadata row persists forever.

#### Operations:
- **source-validation**: HTTP status check, content-type verification, domain authority
- **relevance-scoring**: Does the source relate to the entity/topic?
- **policy-check**: Blocked domains, rate limits, robots.txt compliance

#### Filter Reasons:
- `untrusted_source` — domain not in whitelist / low authority
- `irrelevant` — content doesn't relate to entity/topic
- `blocked` — HTTP error, robots.txt denied, rate limited
- `non_content` — privacy page, login, terms, 404

---

### Step 4 — Content Extraction

**Generic Purpose**: Reusable extraction for text, media, and structured data.

**Operations write to**: `content_items` (content_type: 'scraped_page', content: {html, text, structured})

**Tags applied**: Inherited from Step 2 discovery + content-specific tags

#### Operations:
- **content-scrape-cheerio**: Static HTML parsing (default, cheapest)
- **content-scrape-playwright**: JS-heavy / consent-gated sites (fallback)
- **transcript-generate**: Whisper API for audio/video (podcasts)
- **structured-extract**: Directory listings, metadata tables

#### Content Library Integration:
- Check `content_items` by `source_url` before scraping
- If exists and fresh → skip (reuse existing)
- If exists but stale → re-scrape, version increments
- If not exists → scrape and insert with tags

---

### Step 5 — Filtering & Adaptive Crawling (FILTER STEP)

**Generic Purpose**: Deduplication, quality filtering, adaptive depth.

**Filter behavior**: Items failing are marked `status = 'filtered_step5'` with `filter_reason`.

**Body purged after 7 days**. Metadata persists.

#### Operations:
- **content-filter-junk**: Remove boilerplate, too-short content (<100 words)
- **content-filter-dedup**: MinHash/SimHash deduplication (>0.9 similarity)
- **content-filter-cap**: Adaptive page capping per entity (prevent over-representation)
- **content-filter-language**: Detect and filter wrong-language content

#### Filter Reasons:
- `too_short` — body < 100 words
- `duplicate` — similarity > 0.9 with existing item
- `over_cap` — entity already has enough sources
- `wrong_language` — not in target language
- `boilerplate` — cookie banners, navigation-only content

#### Output:
- Clean, deduplicated, capped set of content_items ready for generation
- Assembled as SOURCES array in stage output_data JSONB

---

### Step 6 — Analysis, Classification & Creation

**Generic Purpose**: Classification, SEO logic, and content generation via LLM.

**Operations write to**: `content_items` (content_type: 'generated_article' or 'generated_profile')

#### Company Profile Operations:
- **analysis-classify**: Map to MASTER_CATEGORIES + MASTER_TAGS, detect suggested categories/tags
- **seo-plan**: Target keywords, H2/H3 outline, meta title/description, FAQs
- **profile-generate**: Full draft (overview, category sections, tag sections, credentials, FAQs)

#### News Article Operations:
- **article-analyze**: Key facts, quotes, angles from sources
- **article-generate**: Full article draft with headline, body, summary

#### Podcast Operations:
- **summary-generate**: Episode summary, key takeaways, guest info
- **page-generate**: Landing page with episode list, summaries, links

**Tags applied**: content-type:profile / content-type:article / content-type:podcast-page + topic tags

---

### Step 7 — Validation & QA

**Generic Purpose**: Fact checks, hallucination detection, structural validation.

#### Operations:
- **qa-structural**: JSON schema validation, section presence, word counts
- **qa-factcheck**: Verify claims against source content_items
- **qa-seo**: Meta lengths, keyword coverage, heading hierarchy, tone
- **qa-consolidate**: Weighted scoring → pass / needs_revision / fail

#### QA Thresholds (per content type, from template config):
- Company profiles: 90% overall pass
- News articles: 80% fact-check, 90% SEO
- Podcast pages: 85% completeness

**Output**: `quality_score` written to content_items, verdict in stage output_data

---

### Step 8 — Routing & Flow Control

**Generic Purpose**: Conditional routing, retries, and loops.

#### Routing Rules:
- `pass` → proceed to Step 9 (Output Bundling)
- `fail: sources_thin` → loop back to Step 2 (more discovery)
- `fail: tone_seo` → loop back to Step 6 (regenerate with fixes)
- `fail: structure` → loop back to Step 6 (reformat)
- `fail: max_retries` → mark project as failed, alert

#### Retry Logic:
- Max 2 loops per failure type
- Configurable per template stage

---

### Step 9 — Output Bundling

**Generic Purpose**: Package approved content into output-agnostic formats.

#### Operations:
- **output-package**: Generate configured formats (Markdown, JSON, HTML, Meta, Manifest)
- Format list defined in template config per content type
- Schema.org markup for HTML output
- Checksums for manifest

**Writes to**: `content_items` (content_type: 'packaged_output', content: {markdown, json, html, meta, manifest})

---

### Step 10 — Distribution

**Generic Purpose**: Push to CMS, APIs, exports.

#### Operations:
- **distribute-cms**: Push to WordPress/CMS API
- **distribute-sheets**: Update Google Sheets tracker
- **distribute-api**: Send to partner APIs
- **distribute-file**: Export to filesystem / cloud storage

#### Audit:
- All distribution outcomes logged in stage output_data
- Success/failure per destination

---

### Step 11 — Review & Triggers

**Generic Purpose**: Human approval, rejection, retriggers.

#### Operations:
- **human-review-queue**: Present content for manual review
- **human-review-decide**: Capture approve/reject/loop decision
- **human-trigger-loop**: Route rejected content back to appropriate step

#### Review States:
- `approved` → published
- `rejected` → archived with reason
- `loop` → routed back to specified step with reviewer notes

---

## Content Type Examples

### Company Profile Pipeline Template

```json
{
  "project_type": "company_profile",
  "stages": [
    {"name": "input", "operation": "batch-kickoff", "config": {"source": "csv"}},
    {"name": "discovery", "operation": "url-discovery", "config": {"methods": ["sitemap", "navigation", "seed"]}},
    {"name": "validation", "operation": "source-validation", "config": {"min_authority": 10}},
    {"name": "extraction", "operation": "content-scrape", "config": {"engine": "cheerio", "fallback": "playwright"}},
    {"name": "filtering", "operation": "content-filter", "config": {"min_words": 100, "dedup_threshold": 0.85}},
    {"name": "generation", "operation": "profile-generate", "config": {"model": "gpt-4", "reference_docs": true}},
    {"name": "qa", "operation": "qa-validation", "config": {"min_score": 0.9}},
    {"name": "routing", "operation": "auto-router", "config": {"max_loops": 2}},
    {"name": "packaging", "operation": "output-package", "config": {"formats": ["markdown", "json", "html"]}}
  ]
}
```

### News Article Pipeline Template

```json
{
  "project_type": "news_article",
  "stages": [
    {"name": "input", "operation": "topic-kickoff", "config": {"category": "payment_gateways"}},
    {"name": "discovery", "operation": "topic-discovery", "config": {"sources": ["rss", "google_news"]}},
    {"name": "validation", "operation": "source-validation", "config": {"min_authority": 30}},
    {"name": "extraction", "operation": "content-scrape", "config": {"engine": "cheerio"}},
    {"name": "filtering", "operation": "content-filter", "config": {"min_words": 200, "max_age_days": 14}},
    {"name": "generation", "operation": "article-generate", "config": {"model": "gpt-4", "tone": "authoritative"}},
    {"name": "qa", "operation": "qa-validation", "config": {"min_score": 0.8, "checks": ["facts", "seo"]}},
    {"name": "packaging", "operation": "output-package", "config": {"formats": ["html", "json"]}}
  ]
}
```

---

## Reference Documents (Template / Step 6 Configuration)

These guardrail documents are **generation instructions** — they belong to pipeline_templates or Step 6 configuration, NOT to Step 1 input. They are loaded when generation operations execute.

| Document | Purpose | Used By |
|---|---|---|
| MASTER_CATEGORIES (~80) | Category taxonomy with slugs, definitions, rules | Step 6, 7 |
| MASTER_TAGS (352+) | Tag taxonomy loaded into platform_tags | Step 6, 7 |
| TONE & SEO GUIDE | Style rules, heading hierarchy, word counts | Step 6, 7 |
| FORMAT SPEC | Section lengths, citation rules, JSON schema | Step 6, 7 |
| KEYWORD_PACKS | Per-category keyword sets for SEO | Step 6, 7 |

These are stored as tagged content_items (content_type: 'reference_doc') in the content library, versioned and queryable. Templates reference them by tag codes in their Step 6 config.

---

## Tiered Retention Policy

| Content Status | Body Retained | Metadata Retained | When Purged |
|---|---|---|---|
| active | Forever | Forever | Never |
| filtered_step3 | 7 days | Forever | Daily cleanup job |
| filtered_step5 | 7 days | Forever | Daily cleanup job |
| superseded | Forever | Forever | Never (old version) |
| archived | Forever | Forever | Never |

Daily cleanup:
```sql
UPDATE content_items SET content = NULL, purged_at = NOW()
WHERE status LIKE 'filtered_%'
AND created_at < NOW() - INTERVAL '7 days'
AND content IS NOT NULL;
```

---

## Freshness Flags

| Content Type | Stale After | Flag | Blocked? |
|---|---|---|---|
| News sources | 14 days | stale_news | NO — still usable |
| Company pages | 3 months | stale_company | NO — still usable |
| Transcripts | 6 months | stale_media | NO — still usable |

Freshness is a **flag for operators**, not a gate. Content is NEVER blocked from reuse.

---

## Conflict Resolution

When the same URL is scraped by multiple projects or re-scraped:

```sql
INSERT INTO content_items (...) ON CONFLICT (source_url)
DO UPDATE SET content = EXCLUDED.content, scraped_at = EXCLUDED.scraped_at,
version = content_items.version + 1, updated_at = NOW()
WHERE EXCLUDED.scraped_at > content_items.scraped_at;
```

- Latest scrape always wins
- Version column increments for audit
- All projects benefit from updated content

---

## Migration from v2

| v2 Concept | v3 Equivalent |
|---|---|
| n8n orchestrator | BullMQ + Express API |
| company-specific tables (content_raw, content_filtered, etc.) | Single content_items table with status column |
| Per-step Supabase tables | content_items + pipeline_stages |
| Hardcoded company workflow | pipeline_templates (configurable per type) |
| workflow_events log | pipeline_stages + pipeline_runs |
| qa_fail_log | quality_score + stage error JSONB |
| content_filtered, content_dedup, content_capped | status: filtered_step5, filter_reason column |

---

## Document Version History

- **v3.0** (2026-01-23): Universal platform, tag-based content library, pipeline templates
- **v2.0** (2025): Company-profile-specific, n8n orchestration, per-step tables
- **v1.0** (2024): Initial workflow concept

---

*Document Owner: Claude Opus 4.5*
*This document supersedes "Full_Workflow_Document_With_Intro_Formatted v2.docx"*
*The .docx version is preserved for historical reference only.*
