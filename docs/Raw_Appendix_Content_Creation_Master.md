# Raw Appendix — Full Extraction from Content Creation Master Document

Content Creation Master document

Introduction

The goal of this workflow is to build a scalable, modular, and SEO-optimized pipeline for generating high-quality company profiles. Each step is designed to balance automation with human quality control, ensuring profiles are fact-checked, structured, and continuously enriched with new content sources.

Purpose

This is the single source of truth for the company-profile pipeline.

It mirrors the 13-step skeleton across four versions:

●  	MVP1a (PSE + Company)

●  	MVP1b (Company-only)

●  	MVP2 (expanded)

●  	Full Workflow

Aim:

Deliver 1,400+ evergreen company pages initially and later for new companies, even as a feature at registration.

Consolidate content (profiles, news, reviews, updates, media) directly on company pages, with canonical structures pointing outward.

Keep the system adaptable for future expansion into additional verticals, languages, and content types.

Purpose:

This workflow is not only a production line but also a knowledge architecture. By breaking the process into 13 steps and layering in database storage, QA gates, and distribution nodes, we can ensure repeatability, reduce hallucination, and maximize SEO authority.

Supabase as Workflow Backbone

We propose creating a Supabase database layer between each node, agent, or tool in the workflow. Instead of passing outputs directly from one step to the next, all data (content links, prompts, code, raw inputs, generated outputs, etc.) is stored in Supabase and retrieved by subsequent steps.

Advantages

Flexibility
 Nodes, agents, and tools can be swapped or updated with minimal impact on the overall workflow.

Branching
 New workflow branches can be created at any point — e.g., generating articles, boilerplates, or news pieces from existing links, raw data, or previously generated content.

Maintainability
 Updating specific sections becomes easier (e.g., changing scrapers, LLMs, or search agents) without requiring major workflow redesign.

Scalability
 The centralized database allows for better tracking, auditing, and reusability of intermediate steps for future development and expansion.

In short: storing everything in the database between steps makes the system more modular, adaptable, and future-proof.

Proposed Tech Stack / Tools & Nodes

Core Database & Storage

Supabase → relational DB for all intermediate and final artifacts (discovery links, raw content, cleaned content, LLM outputs, QA verdicts, final markdown/JSON/HTML/meta).

Supabase Storage / S3 → logos, media, large text archives.

Automation / Orchestration

n8n → workflow automation linking Sheets/Docs, Supabase, crawlers, LLMs, QA, publishing.

Function Nodes → cleaning, dedupe, schema enforcement.

Scraping / Data Collection

Fast/Easy/Expensive: Apify Article Extractor, Apify Playwright (JS/consent walls).

Low-Cost/Optimized: self-hosted Cheerio/Readability, RSS feeds, sitemap pulls, PSE discovery, direct APIs for YouTube/podcasts.

Content Generation & QA

LLM strategy:

8a/8b → mid-tier reliable model (not rock-bottom cheap).

8c → premium model (to ensure generation quality).

8d → optional media enrichment.

QA (Step 9): automated validation (SEO keyword sufficiency, meta compliance, citation coverage, hallucination checks, structure)

Media Creation (Step 8d)

Images: Stable Diffusion / DALL·E for branded/editorial visuals.

Video: Runway, Pika Labs, or Sora (future) for explainers, highlight reels.

Audio/Podcasts: ElevenLabs / Play.ht TTS; Descript for narration

External Tools / Integrations

Google Sheets → control panel, QA loops, reviewer dashboard.

Google Docs → editorial handoff with citations.

Netlify / CMS API → publishing final HTML + assets.

Slack/Email Notifications → optional reviewer/editor alerts.

Step 1 Trigger and upload

1a) Upload list of companies

Input: Google Sheet (or CSV) with company_name, homepage_url, categories_init.
Upload these lists, guidance docs and lists in supabase. For easy access and change.

Goal: Minimal, unambiguous seed list.
Notes:

Normalize company_slug (lowercase, hyphens).

Validate homepage_url (200 OK, strip tracking params).
n8n: Google Sheets → Function (slugify/validate) → Split In Batches.

1b) Upload reference docs (guardrails)

Purpose: Give the LLM durable rules that don’t change per company. These are loaded once, cached, and reused in Steps 8–9.

Pack contents:

MASTER_CATEGORIES (≈80)
Canonical name, 1–2-line definition, typical offerings.

Purchasability (SaaS/Service/Tool), adjacent categories.

Primary vs. secondary decision rules (standalone product, revenue/case-study/hiring signals, pricing page depth).

MASTER_TAGS (≤3 words)

Definition, when to use/not use, examples.

Tone & SEO Guide
Rules: clarity > hype, H2/H3 headings, short paragraphs, bullets, FAQs, meta lengths.

Format Spec
Overview 300–400 words; Category 150–300; Tag 80–300; FAQ 3–5; citations [#n]; strict JSON schema.

CATEGORY_KEYWORD_PACKS (keyword_packs.json) ✅ (new)

For each category:
head_terms (3–7 high-intent phrases).

mid_tail (10–20 modifiers with buyer/feature language).

long_tail_patterns (templates like “{category} for {jurisdiction} licensing”).

entities (protocols, standards, vendors, compliance bodies).
questions (5–10 buyer FAQs).

serp_features (comparisons, alternatives, pricing).

negatives (excluded words, e.g. B2C, bonuses).

priority (P1/P2/P3).

locales (optional, for multilingual).

Used in Step 8 to write profiles with SEO coverage and in Step 9 to validate keyword placement & density.

n8n implementatio:

Static files (master_categories.json, master_tags.json, tone_guide.json, format_spec.json, keyword_packs.json) in Drive/S3.

HTTP File node → cache as workflow data accessible to Step 8 and Step 9 nodes.

Step 2 SEARCH AND URL COLLECTIONS

RSS discovery: If a company site has /news|/press|/blog, capture RSS feed URL + latest items.

LinkedIn: LI_MODE=URL_ONLY — store the LinkedIn company URL using site:linkedin.com/company {brand}. Do not scrape in MVP; optional actor/API in Full.

Discovery provenance: persist found_via = rss | pse_news | pse_dir | seed | linkedin | social.

2a) Search PSE — News (Track A: Exact-fetch)

Scope: Curated igaming news whitelist only.
Action: Google Custom Search (PSE) for "Company" OR "AltName" → 10–30 URLs.
Tip: Don’t drop teasers yet in Full v1; label them for policy learning.
n8n: HTTP Request (Google CSE) → Function (collect title/url/snippet) → Append to discovery list.

2b) Search PSE — Directories (Track A: Exact-fetch)

Scope: Trusted directories only (stable fields).
Action: Same as 2a; 5–15 URLs per company.
n8n: Same node pattern; tag source_type=directory.

2c) Search from company URL (Track B: Exploratory)

Scope: Official site highest priority.
Seeds: /about, /company, /products|/solutions|/platform, /press|/news|/blog, /partners, /careers, /contact, /investors, /resources, /case-studies.
n8n: Function (build seed list from homepage) → push to Step 5c/5d.

2d) LinkedIn (metadata first)

MVP2/Full: site:linkedin.com/company/ search (light), or dedicated actor/API (Full).
Fields: headline, short “About”, location, size band.
n8n: HTTP Request (Google CSE) → optional LinkedIn actor/API.

2e) Other social/media discovery (YouTube/podcasts/social)

Goal: Capture assets for later enrichment.
Full: collect channel URLs + titles; fetch transcripts (YouTube CC/ASR) later in Step 5e.
n8n: HTTP Request (search) → Function (normalize).

Note: Step 4 runs in shadow mode until domain-level validator versions meet promotion thresholds; no hard rejections are applied prior to measured validation.

Step 3 SAVE URL IN DATABASE. SUPABSE

3) Save links (discovery_links)

Action: Save all discovered links in discovery_links table.

Fields:

company_id/slug

url

source_type (site | news | directory | media)

found_via (pse_news | pse_dir | seed | linkedin | social | rss)

ts (timestamp)

Optional lightweight metadata
 When available from search APIs (e.g., Google CSE, RSS feed, directory listing):

title (page title or snippet headline)

snippet (short abstract or beginning of article body, ≤250 chars)

pub_date (if easily available, e.g. RSS pubDate)

This metadata is cheap to capture and helps:

Early QA (detect duplicates/teasers without fetching full page).

Reviewer dashboards (more context before Step 5 scrape).

Step 4 validator training (patterns in headlines/snippets).

MVP1: Can be saved in spreadsheet instead of Supabase. MVP2/Full: Use Supabase as canonical storage.

Step 4  Pre-scrape Link Validation

Goal: Reduce scrape cost without deleting potentially valuable URLs prematurely. Validation must be learned from labeled data, versioned, and rolled out gradually.

4a. Labeled Baseline (one-time per source family, repeatable quarterly)

Full discovery pass (no rejects): For an initial cohort (e.g., 50–100 companies), collect all candidate URLs from Step 2 (PSE news/dirs, seeds, RSS). Store in discovery_links.

Manual labeling: Reviewers label each URL as one of:

article_page (keep)

list_or_teaser (index, pagination, category, tag, author list)

non_content (privacy, terms, login/signup, search pages, 404)

duplicate_candidate (same teaser/text as another)

Guidelines doc: Write explicit examples per label for 5–10 domains to reduce ambiguity; gather two labels per URL for a sample to measure inter-annotator agreement (Cohen’s κ target ≥0.70).

4b. Learn a Validator (rules + model, domain-aware)

We build a hybrid validator from the labeled batch:

Light rules (regex/path): e.g., /page\d+, /category/, /tag/, ?s=, /search, /privacy, /terms, /login, /signup.
 Note: These rules are proposed by the labeled set, not hard-coded in advance.

DOM/content signals: presence of <article>, <h1>, text length (≥80–120 visible chars), number of links vs. paragraphs, repeated teaser patterns.

Company-signal score (0–3): brand tokens in title/H1/intro; learned thresholds per domain group.

Shallow ML classifier (optional): logistic regression or gradient boosting on features above (path parts, token counts, DOM hints). Store model version.

Output a scored decision per URL with fields:

decision: allow | allow_hint | reject

score: 0–1

reason: ["path_rule_hit","low_text","list_layout","no_h1",...]

validator_version: v0.1

domain_policy: <domain or group>

4c. Shadow Mode → Enforce Mode (measured rollout)

Shadow mode (default for v0.x): Do not block anything. Log decision/score/reason next to each URL and continue to Step 5 for all URLs.

Compute metrics against human labels on a holdout set:

Precision(reject), Recall(reject) for list_or_teaser + non_content

False reject rate on article_page

Downstream impact: % pages kept after Step 7, LLM pass rate in Step 9

Promote to enforce mode per domain only if:

Precision(reject) ≥ 0.95 AND False reject rate on article_page ≤ 2% for that domain or domain group, across ≥200 samples.

Maintain validator_version in Supabase to audit what logic produced each decision.

4d. Runtime (once a validator is promoted)

At runtime:

Apply domain policy (regex + thresholds + optional model) tagged with validator_version.

Emit one of:

allow: send to Step 5

allow_hint: send to Step 5 with needs_playwright or likely_list hints (used for cost routing)

reject: only in enforce mode; otherwise shadow-reject (logged but allowed)

Always log: decision, score, reason[], validator_version, domain_policy.

4e. Special Handling Flags

Consent/JS detection: If typical consent elements or missing DOM content after a light fetch → set needs_playwright=true (cost-aware).

Duplicate candidates: If teaser/body hash matches another URL → mark duplicate_candidate=true (final dedupe happens in Step 7).

Low-resource companies: If the company has <8 unique evergreen pages (tracked after Step 7), downgrade aggressive freshness/list rules to avoid over-filtering.

n8n implementation:
 HTTP Request (HEAD/small GET) → Function (feature extraction) → Domain Policy node (rules+model; shadow by default) → log to Supabase (prevalidation_decisions) → branch to Step 5 (always in shadow; in enforce only allow/allow_hint proceed).

.

Step 5 Content collection

5a) News — Exact fetch (Article Extractor)

Tool: Apify article-extractor-smart .
Output: news_raw with url, title, articleBody, date/author if detected.
n8n: HTTP (Apify Run) → Poll result → Download dataset.

5b) Directories — Exact fetch (Article Extractor)

Tool: Same actor; post-parse into normalized fields when feasible.
Output: directory_raw.
n8n: Same pattern as 5a.

5c) Company site — Cheerio/static (primary, fast)

Tool: Apify website-content-crawler with "crawlerType":"cheerio".
Include globs: *about*|*company*|*products*|*solutions*|*platform*|*press*|*news*|*blog*|*partners*|*careers*|*contact*|*investor*|*resources*|*case*|*.pdf*
Exclude globs: *privacy*|*terms*|*login*|*signup*|*/category/*|*/tag/*|*/page/*|*?s=*|*/search/*
Depth: 1–2 (Full can use 2–3 selectively).
When to use: default; static DOM render is enough.
Output: site_raw (+ fetch_mode=cheerio).
n8n: HTTP (Apify Run: Cheerio config) → Poll → Download dataset.

5d) Company site — Playwright/JS (fallback, heavier)

Tool: Apify website-content-crawler with "crawlerType":"playwright", "useChrome":true.
When to use: consent walls, JS-rendered content, stubborn DOM.
Optimizations: block images/fonts, add common consent selectors (#onetrust-accept-btn-handler, button:contains("Accept")).
Output: site_raw (+ fetch_mode=playwright, blocked_reason if any).
n8n: HTTP (Apify Run: Playwright config) → Poll → Download dataset.

You now have two distinct scraper nodes (5c Cheerio, 5d Playwright) you can develop/tune separately and route to via logic from Step 4 and a domain policy.

5e) Media (Full)

YouTube/Vimeo/Podcast: fetch transcripts (CC/ASR), show notes.
Output: media_raw with transcript, timestamps.
n8n: YouTube Transcript API / ASR service → Merge with discovery link.

Fast/Easy/Expensive path:

5a–5b: Apify Article Extractor for news + directories.

5c: Apify Cheerio crawler (static pages).

5d: Apify Playwright crawler (JS/consent walls, capped).

Low-Cost/Optimized path:

Cheerio/Readability self-hosted (default).

Playwright via Browserless (fallback, per-domain cap).

RSS feeds: first pass for blogs/news.

YouTube/podcasts: transcripts via direct/free APIs.

Step 6 Save raw content

Tables: content_raw with content_type (site_raw|news_raw|directory_raw|media_raw), fetch_mode, parent_url, depth, discovered_via, blocked_reason.
n8n: Supabase Upsert (preferred) or write JSONL/CSV per company.

Save in supabase. Per company. Separate section.

Step 7 Filtering non-content.

7) Filtering (post-scrape, quality)

Purpose: Clean up raw scraped content before handing it to the LLM. This is the

second quality gate (the first was Step 4, pre-scrape validation).

Rules:

Drop <100 words.

Deduplicate exact + near duplicate.

Strip boilerplate (menus, cookie banners, disclaimers).

Tag critical intents: About; Products/Solutions; Press (top 3 recent); Partners; Careers; Contact.

Adaptive Page Cap

Base cap = 12 pages.

Expand up to 25 if signals justify:

Strong company-signal strength (+1–3).

Freshness (≤180 days): +1 only if already ≥8 unique evergreen pages.

If <8 evergreen pages exist: keep older unique/company-specific articles (freshness deprioritized).

High uniqueness vs other kept pages (+1–3).

Critical intents present (+1–4).

Prefer Cheerio pages on ties; keep Playwright pages within cap.

Tracking & Feedback

For each discarded item, log:

company_id, url, content_type (site_raw | news_raw | directory_raw | media_raw)

discard_reason (short_text, duplicate, boilerplate, low_signal, other)

validator_version (from Step 4 if applicable).

Store in content_removed table in Supabase.

Weekly: aggregate removal counts by domain + content_type → feed into Step 4 rule/model updates.

Data Hygiene

Delete irrelevant raw content (content_raw) once logged into content_removed, to keep Supabase lean.

Retain only content_clean + removal logs.

STEP 8 — LLM Content Creation & Analyzing .

Purpose & Fit: Transform filtered content into structured, SEO-ready company profiles. Step 8 is split into four sub-steps to reduce retries, improve quality, and allow cost-control.

MVP: Run all sub-steps on a single versatile LLM (Claude 3.5 Sonnet / GPT-4o).

At Scale: If QA thresholds are breached (JSON failures, SEO/tone issues, high editor time), route 8a to an analysis-optimized model and 8b/8c to a writing-optimized model.

8a. Analysis & Classification

Input:

content_clean

MASTER_CATEGORIES (with descriptions)

MASTER_TAGS

CATEGORY_KEYWORD_PACKS (head/mid/long-tail, entities, negatives, FAQs per category)

Tasks:

Assign Primary & Secondary categories.

Propose Suggested Additional Categories if SOURCES match a category description not yet assigned.

Include rationale, citations, and confidence score (0–1).

Always set needs_manual_review:true.

Generate Tags (≤3 words), flag new ones as suggested_new.

Back every claim with a source reference.

For each category assigned (including suggested):

Select keywords_used from the Keyword Pack:

1–3 head terms, 2–5 mid-tail, and entities present in SOURCES.

For each category (including suggested), select keywords_used from the Keyword Pack (1–3 head, 2–5 mid-tail, entities present in SOURCES).

Output: Strict JSON with primary_categories, secondary_categories, suggested_additional_categories, and tags and keywords_used.

PRompt:

You are a classification agent. Analyze the SOURCES and classify the company into categories and tags.

Rules:

1. Primary = core business model / main revenue driver.

2. Secondary = add-ons, integrations, or less-specialized offerings.

3. Suggested additional categories = if SOURCES show evidence for categories not yet assigned.

- Include: name, tier (Primary|Secondary), reason, sources, confidence 0–1, needs_manual_review:true

4. Tags = ≤3 words. Use MASTER_TAGS first. If missing, suggest new tags (status: suggested_new).

5. Every category and tag must cite at least one source ID.

6. For each category, also select keywords from CATEGORY_KEYWORD_PACKS:

- head_terms: 1–3

- mid_tail: 2–5

- entities: any that appear in SOURCES

- Store them under "keywords_used".

7. Output strict JSON only. Do not include prose.

Schema:

{

"primary_categories": [],

"secondary_categories": [],

"suggested_additional_categories": [

{"name":"", "tier":"", "reason":"", "sources":[""], "confidence":0.0, "needs_manual_review":true, "keywords_used": {"head_terms":[],"mid_tail":[],"entities":[]}}

],

"tags": [

{"label":"", "status":"existing|suggested_new", "reason":"", "sources":[""], "confidence":0.0}

]

}

Decoding:

Temp 0.0–0.2, enforce JSON schema.

Retry once if invalid JSON.

8b. Tone & Language Optimization

Input:

Draft snippets +

tone/SEO guide. +

keywords_used from 8a

Task: Apply SEO style, buyer-oriented tone, clarity, and heading hierarchy.

Output: Clean revised text blocks only (no JSON).

Scale: If >8% tone/SEO QA fails, move to writer-optimized LLM.

Prompt (system)
You are a tone and SEO editor. Improve the text for clarity, structure, and SEO.

Rules:

1. Maintain factual accuracy — do not invent or remove citations.

2. Apply B2B, benefit-first, authoritative tone.

3. Use concise sentences, subheadings, and bullets where helpful.

4. Place head_terms in headlines or first paragraphs, mid_tail terms in subheads or body, and entities where SOURCES support them.

5. Avoid negatives from the Keyword Pack.

6. Return only revised text blocks — no JSON.

Decoding:

Temp 0.3–0.5.

Pass through block by block.

Output: Clean revised text blocks only (no JSON).

Must integrate keywords_used naturally (head terms in headlines/first paragraph; mid-tail in subheads/body; entities only if supported by SOURCES).

8c. Content Creation & Formatting

Input:

JSON from 8a +

refined snippets from 8b +

SOURCES.+

Keyword Packs.

Tasks: Build the full modular profile, ensuring SEO keywords are present as specified.

Global Overview must include ≥1 head term in headline/first paragraph.

Category sections must contain ≥1 head term in headline, mid-tail in subheads/body, entities cited if used.

Suggested categories: prepend review banner, mark in JSON as suggested.

FAQ: seed from Keyword Pack questions when relevant.

Outputs:

Markdown with inline [ #citations ]

JSON with all structured fields + suggested category flags + keywords_used

Prompt:

You are a company profile generator. Using SOURCES, 8a JSON, 8b snippets, and CATEGORY_KEYWORD_PACKS, create a full modular profile.

Rules:

A. Global Company Overview

- Headline: {Company Name} – {USP/positioning in iGaming}

- Overview: 300–400 words (history, HQ, markets, credibility, offerings).

- Place at least one head_term in the headline or first paragraph.

B. Category Sections

- Write 150–300 words per category (Primary, Secondary, Suggested).

- Headline: "{Category} Solutions by {Company}" — must contain a head_term.

- Use mid_tail terms in subheads and body.

- Entities only if supported by SOURCES (must be cited).

- Suggested categories: prepend Markdown banner:

> Status: Suggested category — pending editorial review

- JSON: mark is_suggested:true, needs_manual_review:true, include confidence, keywords_used.

C. Tags

- Label ≤3 words, description 80–300 words.

- Integrate relevant keywords naturally.

- Allow suggested_new tags (flagged in JSON).

D. Credentials & Recognition

- Licenses, awards, certifications, partnerships. Group by type. Cite sources.

E. Logo

- Include logo file reference if available.

F. Sales & Contact Information

- HQ, addresses, general email/phone, regional contacts if present.

- Format as structured list.

G. Meta & FAQ

- Meta Title ≤60 chars, Meta Description 150–160 chars — include a head_term.

- FAQ: 3–5 buyer-intent Q&As. Use `questions` from the Keyword Pack when relevant.

OUTPUT:

1. Markdown profile with inline [#citations].

2. Strict JSON reflecting all sections with fields:

- overview, categories[], tags[], credentials, contact, meta, faq[], sources

- For suggested categories: is_suggested:true, needs_manual_review:true, confidence, keywords_used

Decoding:

Temp 0.4–0.7.

Validate JSON against schema.

Retry once if section missing or meta length invalid.

8d. Media Enrichment

Input:

Approved structured text from 8c

SOURCES (logos, images, transcripts, branding assets)

Keyword Packs (for SEO-driven titles and scripts)

Tasks:

Image Generation: Create company visuals, branded illustrations, or editorial images for profiles and news.

Video Creation: Generate short explainer videos, brand highlight reels, or summaries of company profiles.

Podcast / Audio Creation: Convert text content into narrated audio (TTS) for distribution as podcasts or embedded on company pages.

Outputs:

media_assets:

images (URLs, descriptions, alt-text for SEO)

videos (URLs, transcripts, thumbnails)

audio/podcasts (URLs, metadata, duration, transcript)

Rules:

Use Supabase storage for all generated media assets.

Generate metadata: alt-text for images, captions for video, transcripts for audio.

Keep tone consistent with Step 8b (authoritative, B2B, benefit-first).

Ensure SEO integration: filenames, descriptions, and captions must include target keywords where natural.

Run only after Step 9 pass. Default OFF; enable for Top-N profiles.

9) AI SEO & Fact Check (automated)

Purpose & Fit: To validate the LLM outputs from Step 8 before they are accepted. Step 9 acts as an automated quality gate — it does not create new content, only checks compliance and accuracy. Failures trigger loops (Step 10).

What it Checks

Keyword sufficiency: density and placement (headline, first paragraph, meta).

Meta compliance: Title ≤60 chars; Description 150–160 chars.

Citation coverage: every factual claim in JSON must cite a valid source.

Hallucination detection: claims must match text in SOURCES; unsupported content is flagged.

Tone & structure: verify all sections from Step 8 are present and match formatting rules.

Outcomes

✅ Pass → profile is accepted and moved forward.
 ❌ Fail → loop routing (Step 10):

Facts wrong / missing citations → back to Step 2 (discovery/scraping) or Step 8a (analysis).

Tone/SEO weak → back to Step 8b (tone).

Formatting issues → back to Step 8c (final content).

Insufficient SOURCES → flag in spreadsheet for manual review (no retry).

Version Ladder

MVP1a / MVP1b → Step 9 skipped.

MVP2 → minimal QA: meta length + citation presence.

Full Workflow → full QA checks: keywords, meta, citations, hallucinations, tone/structure.

Diagnostics Logging

Log metrics to Supabase for error attribution:

Discovery depth; % rejected at Step 4.

Scrape mode mix (Cheerio vs Playwright), failures/timeouts.

Clean yield (words_kept, pages_kept, uniqueness score).

8a JSON validity (pass/fail, retries).

8b delta (% text changed).

8c QA (meta ok, citations ok, hallucination flags, keyword placement ok).

Tokens & time per sub-step.

This makes it possible to isolate whether errors are due to search, filtering, scraping, or generation.

10) Potential Changes (loop logic)

Purpose & Fit:
Step 10 is the routing and approval gate after Step 9 (QA). It decides whether a profile is accepted, retried through earlier steps, or flagged for manual review. Only once Step 10 approves content is it finalized into all output formats (Markdown, JSON, HTML, Meta, Logo). This ensures that only fact-checked, SEO-compliant, and complete profiles move forward to publishing.

MVP Versions

MVP1a / MVP1b

Step 10 was skipped.

Loops handled manually via spreadsheet.

MVP2

Step 10 acted as a manual checkpoint only.

Reviewer flagged in spreadsheet:

“Loop → Search” (back to Step 2 Discovery)

“Loop → LLM” (back to Step 7/8 Content)

No automation; human-in-the-loop decision.

Full Workflow (Automated)

In the full pipeline, Step 10 is an automated router that reads the Step 9 QA verdict and directs outputs accordingly:

Facts wrong / unsupported claims → Loop back to Step 2 (Discovery) for better sources.

Tone or SEO issues → Loop back to Step 8 (LLM triad) (8b for tone/SEO, 8c for formatting).

Formatting/structure errors → Loop back to Step 8c.

Insufficient data (too few valid sources) → Flag in spreadsheet for manual review (no auto-retry).

Pass → Profile is approved and finalized.

Approved Outputs

When a profile passes QA and routing, Step 10 generates and saves all final deliverables:

Markdown

Full profile text with inline [ #citations ].

Stored in Supabase (outputs.markdown) and archived in Drive/S3.

Exported to Google Docs (Step 11a).

JSON

Structured data for the profile, including:

overview

categories[] (with keywords_used, suggested flags, etc.)

tags[]

credentials (licenses, awards, certifications, partnerships)

hq and addresses[]

employees (if discovered in SOURCES)

contact (emails, phone numbers, regional contacts)

meta (title, description)

faq[]

sources[]

Stored in Supabase (outputs.json) for structured queries and API use.

HTML

Generated from Markdown + JSON using a Markdown-to-HTML parser (e.g. markdown-it, remark) plus an HTML template injection step.

Includes:

<head> with:

<title> = meta_title (≤60 chars).

<meta name="description"> = meta_description (150–160 chars).

<link rel="canonical"> = company profile URL.

OpenGraph tags: <meta property="og:title">, <meta property="og:description">, <meta property="og:image">.

<script type="application/ld+json"> block with Schema.org data:

@type: Organization → name, url, logo, headquarters, contact.

@type: Product (optional, for key offerings).

@type: FAQPage → FAQ Q&A pairs from JSON.

<body> structured as follows:

Hero section: Company logo + headline (Company Name – USP).

Overview: Text from overview.

Categories:

Primary categories expanded by default.

Secondary/Suggested collapsed with teaser (headline + 2 sentences + “Read more”).

Suggested categories carry banner: “Suggested category — pending editorial review.”

Tags: List of tags with descriptions.

Credentials: Grouped lists of licenses, awards, certifications, partnerships.

Contact: HQ, addresses, employees (if available), emails, phones, regional contacts.

FAQ: Accordion layout; mapped to .

Stored in Supabase (outputs.html) and uploaded to the site (Netlify/CMS).

Meta

Title and description extracted from JSON and stored in dedicated columns (meta_title, meta_description) for SEO checks.

Logo

Company logo (png/jpg) scraped or uploaded in Step 2/5.

Stored in object storage (S3 or Supabase bucket).

Linked in JSON and referenced in HTML.

Tools / Nodes

Supabase Insert/Update nodes → store Markdown, JSON, HTML, Meta.

n8n Function node → run Markdown-to-HTML conversion and inject structured datapoints (HQ, employees, contact, licenses, awards, etc.) into the template.

Supabase Storage / S3 node → upload logo asset.

Google Docs node → render Markdown into Docs for Step 11a.

Google Sheets node → update control panel with status, loop flags, suggested categories/tags, SEO QA metrics.

Handoffs

Step 11a → Publish to Google Docs (editorial copy).

Step 11b → Update Spreadsheet (control panel, QA tracking, manual review flags).

Site / CMS → HTML + assets are now ready for direct upload.

11) Approved Output

Purpose & Fit:
Expose approved outputs to humans for editorial review and ops tracking.

Artifacts:

Markdown

JSON

HTML render

Logo URL

11a)  Google Docs

Convert Markdown → Doc, preserve structure + [ #citations ]

Keep suggested category banners

Add header block: company name, date, profile version, QA status

Share to editorial list (comment-only default)

11b Spreadsheet

Upsert row with:

Core: company_name, domain, version, date_generated

Status: qa_pass, qa_route

SEO: kw_head_ok, kw_mid_ok, negatives_found, keywords_missing

Citations: citation_coverage_ok

Suggested: counts, conf_avg, needs_manual_review

Editorial: decision, notes, assignee, due_date

Links: doc_url, html_preview_url, supabase_id, logo_url

Filters: review-needed, qa_failed, assignee view

n8n:

Google Drive/Supabase storage for artifacts

Google Docs node → doc_url

Google Sheets node → control panel row update

(Optional: notifications)

Yes—exactly. Keep both:

Step 12 = Distribution (one node): pushes the already-created artifacts out (Docs, Sheet and/or Dashboard API). No decisions here.

Step 13 = Review & Trigger (one node): receives a human decision (Approve/Launch vs Loop) and routes the pipeline (publish to site & Supabase, or loop back to Step 2/8).

Below is copy-ready text for your master doc. I’ve marked CHANGES ADDED where it differs from your current wording.

STEP 12 — Distribution (External Handoff)

Purpose & Fit: Make the approved artifacts from Step 10 visible to humans and/or an external dashboard. This step makes no decisions.

Inputs (from Step 10):

outputs.markdown, outputs.json, outputs.html, meta_title, meta_description, logo_url

QA flags (e.g., needs_manual_review, suggested_cat_count, etc.)

Actions (automation only):

Create Google Doc from Markdown (preserve headings, bullets, [#citations]).

Upsert Control Panel Sheet row with links & QA flags.

Optionally POST payload to an external dashboard API.

Outputs:

doc_url (if Docs used)

sheet_row_url (if Sheets used)

external_case_id (if dashboard used)

Tools / Nodes:

Google Docs node → returns doc_url

Google Sheets node → upsert row

HTTP Request node → optional dashboard post

Contract (if posting to dashboard) — payload example:

{

"job_id": "…",

"company_id": "…",

"version": "v1",

"artifacts": {

"markdown_url": "…",

"json_url": "…",

"html_url": "…",

"meta_title": "…",

"meta_description": "…",

"logo_url": "…"

},

"flags": {

"qa_pass": true,

"needs_manual_review": true,

"suggested_cat_count": 2,

"suggested_cat_conf_avg": 0.72

},

"links": {

"doc_url": "…",

"sheet_row_url": "…"

},

"callback": {

"approve_webhook": "https://…/approve",

"loop_webhook": "https://…/loop"

}

}

Boundary: Step 12 does not publish or loop. It only distributes and records link(s)/case id(s).

STEP 13 — Review & Trigger (Loop or Launch)

Purpose & Fit: Human reviewers read/comment outside the pipeline (Doc/Sheet/Dashboard). Their decision triggers either a loop back or a launch to the site backend.

Triggers (choose one path you use now):

Google Sheets “on edit” of decision cells, or

Dashboard buttons calling webhooks (/approve or /loop).

Inputs:

doc_url, sheet_row_url or external_case_id (from Step 12)

Decision: Approve & Launch or Loop (with route: loop_search, loop_8b, loop_8c)

Actions:

Human reviewers decide: Approve & Launch or Loop.

Approve → set is_live=true in Supabase, call Publish job (HTML + assets) to CMS.

Loop → update Supabase status to loop_search, loop_8b, or loop_8c.

Loop

Supabase: set status to chosen step:

loop_search → 2_DISCOVERY

loop_8b → 8B_TONE

loop_8c → 8C_WRITE

Store editor_note and notify assignee

Outputs:

If Approved: live page in site backend; is_live=true in Supabase

If Loop: pipeline status updated; audit entry saved

Tools / Nodes:

Webhook nodes (/approve and /loop) or Google Sheets trigger → Function → Supabase Update → (optional) Slack/Email notify

Publish job (HTTP Request or custom node) hitting your site backend with outputs.html + assets

Webhook nodes or Sheets triggers → Supabase update

Slack/Email notify (optional)

Publish job → site backend with outputs.html + assets

Webhook payloads (recommended):
 POST /approve

{ "company_id": "…", "job_id": "…", "actor": "editor@email", "note": "OK to launch" }

POST /loop

{ "company_id": "…", "job_id": "…", "route": "loop_8b", "actor": "…", "note": "Strengthen SEO headings" }

Boundary: Step 13 only executes a human decision: publish or loop. It does not render Docs/Sheet or create artifacts (that’s Step 12 / Step 10).

Simple state flow (for devs)

10_APPROVED → 12_DISTRIBUTE → 13_TRIGGER → (LAUNCH | LOOP)

LAUNCH → publish; mark DONE

LOOP → set status to 2_DISCOVERY | 8B_TONE | 8C_WRITE and resume pipeline

Appendix A — Teaser/Duplicate Pattern Learning Protocol

Sampling

Select N companies across sizes; cap K URLs/company (e.g., N=75, K=40 ⇒ 3,000 URLs).

Stratify by source: pse_news, pse_dir, seed, rss, social.

Labeling

Two annotators on a random 20% for agreement; κ ≥ 0.70 target.

Store label, notes, example_screenshot (optional) in Supabase.

Feature extraction

Path tokens, query params, numeric “page” patterns.

DOM: <h1> existence, <article> presence, paragraph/link counts, visible text length.

Text: Jaccard similarity of intro/teaser across URLs for duplicate detection.

Modeling

Start with rules from error analysis.

Add a small classifier (logistic regression/GBM) to combine signals; 5-fold CV; domain-grouped validation.

Evaluation

Report: Precision/Recall for reject, false reject rate on article_page, and downstream metrics: Step-7 keeper rate, Step-9 pass rate.

Promotion criteria

Per-domain promotion to enforce when thresholds met for sample ≥200, and stability confirmed over two weekly runs.

Operations

Keep shadow mode for new domains.

Version rules (validator_version) and maintain a changelog in Supabase.

Quarterly refresh or when Step-9 signals drift (e.g., rising “insufficient sources”