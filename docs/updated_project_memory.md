# Universal Content Pipeline - Project Memory

**Last Updated**: 2026-01-23
**Status**: Infrastructure Complete, Schema Finalized, Ready for Implementation
**Architecture**: Tag-based universal content library with cross-project reuse

## Project Overview

Universal Content Intelligence Platform for the iGaming industry (onlyigaming.com). The system processes ANY content type (news articles, company profiles, podcast pages, competitor analysis) through configurable, database-mediated workflows with a shared content library.

**Strategic Principle**: This is a general-purpose content intelligence and creation system — NOT a company profile tool. Company profiles are only the first configured use case.

## Current Tech Stack
- **Server**: Hetzner CX22 VPS (IP: 188.245.110.34, Ubuntu 24.04.3 LTS)
- **Database**: Supabase PostgreSQL (https://fevxvwqjhndetktujeuu.supabase.co)
- **Orchestration**: BullMQ with Redis 7.0.15
- **Backend**: Node.js 20.20.0 + Express.js (ready for implementation)
- **Frontend**: Web dashboard (ready for implementation)

## Architecture: Tag-Based Content Library

### Core Innovation
All content lives in ONE universal `content_items` table. Tags from a 352+ taxonomy organize content. Projects consume content through tag-based queries. Content is scraped once and reused across any number of projects.

### Database Schema (Finalized)

**Content Library**:
- `content_items` — Universal storage with content_type discriminator, source_url dedup, version column, tiered retention
- `platform_tags` — 352+ tag taxonomy (DIR, NEWS, GEO, PROD, TYPE, SYSTEM dimensions)
- `content_tags` — Junction with UUID FK, confidence scoring, source tracking

**Pipeline Execution**:
- `projects` — Batch/job definitions with project_type
- `pipeline_templates` — Stage definitions per project_type (configurable, not coded)
- `pipeline_runs` — Execution tracking
- `pipeline_stages` — Step-level results

### Key Design Decisions
1. **Content reuse**: Scrape once, tag, reuse across projects
2. **Freshness flags, not gates**: Old content is flagged but never blocked
3. **Conflict resolution**: Latest scrape wins + version column for audit
4. **Tiered retention**: Filtered content body nulled after 7 days, metadata persists
5. **Configuration over specialization**: Pipeline templates, not code branches

### BullMQ Architecture
- **One queue** (`pipeline-stages`) for all operations
- **One generic worker** that dynamically loads operation modules
- **Pipeline templates** define what to run per project_type
- **Operations** are pluggable modules with standard `execute(input, config, context)` interface

## Development Progress

### Completed
- Server infrastructure: Hetzner VPS, Redis, Node.js, dependencies
- Schema design: Finalized and stress-tested (critic agent scored, 3 fixes applied)
- Architecture documents: All updated to reflect universal platform
- POC: URL discovery (77 URLs across 6 companies) — infrastructure validation only

### Next Steps (Implementation)
1. Create 7 Supabase tables with indexes
2. Seed 352+ tags into platform_tags
3. Build Express API (projects, content, tags, templates, runs)
4. Build generic BullMQ worker with dynamic operation loading
5. Build web dashboard
6. Implement company_profile operations (first content type)
7. Implement news_article operations (business priority)

## Business Needs (Priority)
1. **News site**: Continuous content updates (HIGH)
2. **Podcast/media pages**: Build with content (HIGH)
3. **Company profiles**: Improve existing 1,400 (one use case)
4. **Registration self-service**: Frontend for new companies (MEDIUM)

## The 12-Step Generic Pipeline (Steps 0–11)
0. Project Setup
1. Input Specification
2. Discovery & Enrichment
3. Source Validation & Governance (FILTER STEP — marks filtered_step3)
4. Content Extraction
5. Filtering & Adaptive Crawling (FILTER STEP — marks filtered_step5)
6. Analysis, Classification & Creation
7. Validation & QA
8. Routing & Flow Control
9. Output Bundling
10. Distribution
11. Review & Triggers

## Environment Configuration
```bash
# Server
ssh -i ~/.ssh/hetzner_key root@188.245.110.34

# Redis
redis-cli -a Danne2025 ping

# Project path (new universal platform)
/opt/content-pipeline/

# Supabase
URL: https://fevxvwqjhndetktujeuu.supabase.co
```

## Historical Context

### Evolution
- **Original**: Company profile generator with hardcoded 11-step workflow
- **v2 (2024)**: Universal pipeline architecture concept (database-mediated, modular)
- **v3 (2026-01-23)**: Tag-based content library with cross-project reuse

### What Was Learned
- Company-specific code blocks platform extensibility
- Tags as organizing principle enables content reuse across content types
- One universal table with content_type discriminator is simpler than per-type tables
- Freshness should flag, not block (content is always reusable)
- Filtered content body should be purged (7 days) but metadata retained (forever)
- Pipeline templates (config) are superior to coded workflows

### Proven Components (from POC)
- URL discovery: sitemap parsing, navigation extraction, seed expansion
- Content scraping: Cheerio-based extraction
- Supabase integration: CRUD operations verified
- Redis/BullMQ: Job queuing verified

---

*Document Owner: Claude Opus 4.5*
*Last Major Update: 2026-01-23 — Rewritten for universal platform with tag-based content library*
