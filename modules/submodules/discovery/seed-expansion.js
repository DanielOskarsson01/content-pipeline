/**
 * Seed Expansion Discovery Submodule
 *
 * Start from seed URLs (base domain + common paths) and find internal links on those pages.
 * Depth is fixed at 1 for MVP (links on seed page only).
 *
 * Input Required: `website` column from entity data (from CSV)
 *
 * Options:
 * - same_domain_only: boolean (default: true) - Only keep links on same domain
 * - use_common_seeds: boolean (default: false) - Append common paths to base domains
 *
 * Common Seeds (when use_common_seeds is true):
 * /about, /about-us, /company, /products, /solutions, /services,
 * /press, /news, /media, /blog, /insights, /resources, /careers, /jobs, /contact
 *
 * Error Codes:
 * - PAGE_LOAD_ERROR: Seed URL returned 4xx/5xx
 * - NO_LINKS_FOUND: Page has no internal links
 * - SEED_TIMEOUT: Page load exceeded 30s
 * - NO_WEBSITE_URL: Entity missing `website` column
 */

const https = require('https');
const http = require('http');
const { JSDOM } = require('jsdom');

// Common seed paths to append to base domain
const COMMON_SEEDS = [
  '/about',
  '/about-us',
  '/company',
  '/products',
  '/solutions',
  '/services',
  '/press',
  '/news',
  '/media',
  '/blog',
  '/insights',
  '/resources',
  '/careers',
  '/jobs',
  '/contact',
  '/contact-us'
];

module.exports = {
  id: 'seed-expansion',
  name: 'Seed Expansion',
  type: 'discovery',
  category: 'website',
  version: '2.0.0',
  description: 'Expand seed URLs by extracting internal links',
  cost: 'cheap',
  cost_tier: 'cheap',
  requiresExternalApi: false,

  inputs_required: [
    { name: 'website', type: 'url', label: 'Website URL', description: "Entity's website (from CSV)" }
  ],
  inputs_optional: [
    { name: 'seed_urls', type: 'url[]', label: 'Custom Seed URLs', description: 'Additional URLs to start from' }
  ],

  options: [
    { name: 'same_domain_only', type: 'boolean', values: [true, false], default: true, description: 'Only keep links on same domain' },
    { name: 'use_common_seeds', type: 'boolean', values: [true, false], default: false, description: 'Append common paths to base domains' },
    { name: 'max_urls_per_entity', type: 'number', default: 300, description: 'Max URLs to collect per entity' },
    { name: 'max_urls_per_seed', type: 'number', default: 50, description: 'Max URLs to collect per seed page' }
  ],

  output_type: 'urls',
  output_schema: {
    url: 'string',
    seed_url: 'string|null'
  },

  error_codes: ['PAGE_LOAD_ERROR', 'NO_LINKS_FOUND', 'SEED_TIMEOUT', 'NO_WEBSITE_URL'],

  /**
   * Execute seed expansion discovery for entities
   * @param {Array} entities - Entities with website field
   * @param {Object} config - Options
   * @param {Object} context - { logger, db }
   * @returns {Array} URLs with metadata
   */
  async execute(entities, config = {}, context = {}) {
    const { logger = console } = context;
    const sameDomainOnly = config.same_domain_only !== false;
    const useCommonSeeds = config.use_common_seeds === true;
    const maxUrlsPerEntity = config.max_urls_per_entity || 300;
    const maxUrlsPerSeed = config.max_urls_per_seed || 50;
    const results = [];
    const errors = [];

    for (const entity of entities) {
      // Get website URL from entity (supports both old and new formats)
      const website = entity.website || entity.metadata?.website || entity.domain;

      if (!website) {
        errors.push({
          entity_id: entity.id,
          entity_name: entity.name || entity.entity_name,
          error_code: 'NO_WEBSITE_URL',
          message: 'Entity missing website URL'
        });
        logger.warn(`[seed-expansion] Entity ${entity.name || entity.entity_name} has no website, skipping`);
        continue;
      }

      try {
        const domain = this._extractDomain(website);
        const baseUrl = website.startsWith('http') ? website : `https://${website}`;

        // Build seed URLs list
        let seedUrls = entity.seed_urls || [];

        // Always include the homepage
        seedUrls.unshift(baseUrl.replace(/\/$/, ''));

        // Add common seeds if enabled
        if (useCommonSeeds) {
          const commonSeedUrls = COMMON_SEEDS.map(path => {
            const base = baseUrl.replace(/\/$/, '');
            return base + path;
          });
          seedUrls = [...seedUrls, ...commonSeedUrls];
        }

        // Dedupe seed URLs
        seedUrls = [...new Set(seedUrls)];

        const discovered = new Map(); // url -> seed_url that found it
        let entityErrors = [];

        for (const seedUrl of seedUrls) {
          if (discovered.size >= maxUrlsPerEntity) break;

          const seedResult = await this._extractLinks(seedUrl, domain, sameDomainOnly, maxUrlsPerSeed, logger);

          // Add the seed itself if it loaded successfully
          if (!seedResult.error || seedResult.urls.length > 0) {
            if (!discovered.has(seedUrl)) {
              discovered.set(seedUrl, seedUrl);
            }
          }

          // Add discovered links
          for (const url of seedResult.urls) {
            if (discovered.size >= maxUrlsPerEntity) break;
            if (!discovered.has(url)) {
              discovered.set(url, seedUrl);
            }
          }

          // Collect errors but continue with other seeds
          if (seedResult.error) {
            entityErrors.push({
              seed_url: seedUrl,
              error_code: seedResult.error.code,
              message: seedResult.error.message
            });
          }
        }

        // Convert to results
        for (const [url, seedUrl] of discovered) {
          results.push({
            entity_id: entity.id,
            entity_name: entity.name || entity.entity_name,
            url,
            source_category: 'website',
            source_submodule: 'seed-expansion',
            metadata: {
              source: 'seed-expansion',
              seed_url: seedUrl
            }
          });
        }

        // If all seeds failed, report error
        if (entityErrors.length > 0 && discovered.size === 0) {
          errors.push({
            entity_id: entity.id,
            entity_name: entity.name || entity.entity_name,
            error_code: 'PAGE_LOAD_ERROR',
            message: `All ${entityErrors.length} seeds failed`,
            details: entityErrors
          });
        }

        logger.info(`[seed-expansion] Found ${discovered.size} URLs for ${entity.name || entity.entity_name}`);
      } catch (e) {
        errors.push({
          entity_id: entity.id,
          entity_name: entity.name || entity.entity_name,
          error_code: 'PAGE_LOAD_ERROR',
          message: e.message
        });
        logger.error(`[seed-expansion] Error processing ${entity.name || entity.entity_name}: ${e.message}`);
      }
    }

    // Attach errors to results for visibility
    if (errors.length > 0) {
      results._errors = errors;
    }

    return results;
  },

  _extractDomain(url) {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url.replace(/^(https?:\/\/)?/, '').split('/')[0];
    }
  },

  async _extractLinks(seedUrl, domain, sameDomainOnly, maxUrls, logger) {
    const urls = [];
    let error = null;

    try {
      const html = await this._fetch(seedUrl, 30000);
      if (!html) {
        return {
          urls: [],
          error: { code: 'PAGE_LOAD_ERROR', message: `Failed to load ${seedUrl}` }
        };
      }

      const dom = new JSDOM(html);
      const doc = dom.window.document;
      const seenUrls = new Set();

      // Extract all links
      const links = doc.querySelectorAll('a[href]');
      for (const link of links) {
        if (urls.length >= maxUrls) break;

        const href = link.getAttribute('href');
        const resolved = this._resolveUrl(href, seedUrl, domain, sameDomainOnly);
        if (resolved && !seenUrls.has(resolved)) {
          seenUrls.add(resolved);
          urls.push(resolved);
        }
      }

      if (urls.length === 0) {
        error = { code: 'NO_LINKS_FOUND', message: 'Page has no internal links' };
      }
    } catch (e) {
      error = { code: 'PAGE_LOAD_ERROR', message: e.message };
      logger.warn(`[seed-expansion] Failed to extract links from ${seedUrl}: ${e.message}`);
    }

    return { urls, error };
  },

  _resolveUrl(href, base, domain, sameDomainOnly) {
    if (!href) return null;
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;

    try {
      const resolved = new URL(href, base);

      // Only same-domain URLs if enabled
      if (sameDomainOnly) {
        if (!resolved.hostname.endsWith(domain) && !domain.endsWith(resolved.hostname)) {
          return null;
        }
      }

      // Skip common non-content paths
      const skipPaths = ['/login', '/logout', '/signup', '/register', '/cart', '/checkout', '/api/', '/cdn-cgi/', '/wp-admin', '/wp-login'];
      if (skipPaths.some(p => resolved.pathname.toLowerCase().startsWith(p))) return null;

      // Skip file extensions
      const skipExts = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.zip', '.css', '.js', '.xml', '.json'];
      if (skipExts.some(ext => resolved.pathname.toLowerCase().endsWith(ext))) return null;

      // Clean URL (remove tracking params and hash)
      resolved.hash = '';

      return resolved.href;
    } catch {
      return null;
    }
  },

  _fetch(url, timeout = 30000) {
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ContentPipelineBot/2.0; +https://onlyigaming.com/bot)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._fetch(res.headers.location, timeout).then(resolve);
          return;
        }

        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', () => resolve(null));
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }
};
