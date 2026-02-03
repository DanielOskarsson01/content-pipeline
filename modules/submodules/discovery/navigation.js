/**
 * Navigation Discovery Submodule
 *
 * Extract links from site navigation (header, footer, menus) for each entity's website.
 * Uses JSDOM for HTML parsing - no JS rendering.
 *
 * Input Required: `website` column from entity data (from CSV)
 *
 * Options:
 * - scan_areas: array of 'header', 'footer', 'sidebar' (default: ['header', 'footer'])
 * - follow_dropdowns: boolean (default: true)
 *
 * Error Codes:
 * - PAGE_LOAD_ERROR: Homepage returned 4xx/5xx or blocked
 * - NO_NAV_FOUND: Could not identify navigation elements
 * - NAV_TIMEOUT: Page load exceeded 30s
 * - NO_WEBSITE_URL: Entity missing `website` column
 */

const https = require('https');
const http = require('http');
const { JSDOM } = require('jsdom');

module.exports = {
  id: 'navigation',
  name: 'Navigation',
  type: 'discovery',
  category: 'website',
  version: '2.0.0',
  description: 'Extract links from site navigation (header, footer, menus)',
  cost: 'cheap',
  cost_tier: 'cheap',
  requiresExternalApi: false,

  inputs_required: [
    { name: 'website', type: 'url', label: 'Website URL', description: "Entity's website (from CSV)" }
  ],
  inputs_optional: [],

  options: [
    { name: 'scan_areas', type: 'multi-select', values: ['header', 'footer', 'sidebar'], default: ['header', 'footer'], description: 'Which nav areas to scan' },
    { name: 'follow_dropdowns', type: 'boolean', values: [true, false], default: true, description: 'Extract links inside dropdown menus' },
    { name: 'max_urls_per_entity', type: 'number', default: 10000, description: 'Max URLs to collect per entity' }
  ],

  output_type: 'urls',
  output_schema: {
    url: 'string',
    nav_location: 'string|null'
  },

  error_codes: ['PAGE_LOAD_ERROR', 'NO_NAV_FOUND', 'NAV_TIMEOUT', 'NO_WEBSITE_URL'],

  /**
   * Execute navigation discovery for entities
   * @param {Array} entities - Entities with website field
   * @param {Object} config - Options (scan_areas, follow_dropdowns, max_urls_per_entity)
   * @param {Object} context - { logger, db }
   * @returns {Array} URLs with metadata
   */
  async execute(entities, config = {}, context = {}) {
    const { logger = console } = context;
    const scanAreas = config.scan_areas || ['header', 'footer'];
    const maxUrlsPerEntity = config.max_urls_per_entity || 200;
    const concurrency = config.concurrency || 10; // Process 10 entities at a time
    const results = [];
    const errors = [];

    // Process entity and return its results
    const processEntity = async (entity) => {
      const website = entity.website || entity.metadata?.website || entity.domain;
      const entityName = entity.name || entity.entity_name;

      if (!website) {
        return {
          urls: [],
          error: { entity_id: entity.id, entity_name: entityName, error_code: 'NO_WEBSITE_URL', message: 'Entity missing website URL' }
        };
      }

      try {
        const domain = this._extractDomain(website);
        const navResult = await this._extractNavLinks(domain, scanAreas, maxUrlsPerEntity, logger);

        const urls = navResult.urls.map(item => ({
          entity_id: entity.id,
          entity_name: entityName,
          url: item.url,
          source_category: 'website',
          source_submodule: 'navigation',
          metadata: { source: 'navigation', nav_location: item.location || null }
        }));

        logger.info(`[navigation] Found ${urls.length} URLs for ${entityName}`);

        return {
          urls,
          error: navResult.error ? { entity_id: entity.id, entity_name: entityName, ...navResult.error } : null
        };
      } catch (e) {
        logger.error(`[navigation] Error processing ${entityName}: ${e.message}`);
        return {
          urls: [],
          error: { entity_id: entity.id, entity_name: entityName, error_code: 'PAGE_LOAD_ERROR', message: e.message }
        };
      }
    };

    // Process entities in parallel batches
    logger.info(`[navigation] Processing ${entities.length} entities (concurrency: ${concurrency})`);

    for (let i = 0; i < entities.length; i += concurrency) {
      const batch = entities.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(processEntity));

      for (const result of batchResults) {
        results.push(...result.urls);
        if (result.error) errors.push(result.error);
      }

      logger.info(`[navigation] Processed batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(entities.length / concurrency)}`);
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

  async _extractNavLinks(domain, scanAreas, maxUrls, logger) {
    const urls = [];
    const seenUrls = new Set();
    let error = null;
    const homepageUrl = `https://${domain}`;

    const html = await this._fetch(homepageUrl, 15000);
    if (!html) {
      return {
        urls: [],
        error: { code: 'PAGE_LOAD_ERROR', message: `Failed to load homepage for ${domain}` }
      };
    }

    try {
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // Build selectors based on scan_areas config
      const selectorsByArea = {
        header: ['header a', 'nav a', '[role="navigation"] a', '.navbar a', '.main-nav a', '#header a', '.header a'],
        footer: ['footer a', '#footer a', '.footer a', '.site-footer a'],
        sidebar: ['aside a', '.sidebar a', '#sidebar a', '[role="complementary"] a']
      };

      let foundLinks = false;

      for (const area of scanAreas) {
        const selectors = selectorsByArea[area] || [];
        for (const selector of selectors) {
          try {
            const links = doc.querySelectorAll(selector);
            for (const link of links) {
              if (urls.length >= maxUrls) break;

              const href = link.getAttribute('href');
              const resolved = this._resolveUrl(href, homepageUrl, domain);
              if (resolved && !seenUrls.has(resolved)) {
                seenUrls.add(resolved);
                urls.push({ url: resolved, location: area });
                foundLinks = true;
              }
            }
          } catch {
            // Selector might fail, continue with others
          }
        }
      }

      if (!foundLinks) {
        error = { code: 'NO_NAV_FOUND', message: 'Could not identify navigation elements' };
      }
    } catch (e) {
      error = { code: 'PAGE_LOAD_ERROR', message: `Failed to parse HTML: ${e.message}` };
      logger.warn(`[navigation] Failed to parse ${domain}: ${e.message}`);
    }

    return { urls, error };
  },

  _resolveUrl(href, base, domain) {
    if (!href) return null;
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;

    try {
      const resolved = new URL(href, base);

      // Only same-domain URLs
      if (!resolved.hostname.endsWith(domain) && !domain.endsWith(resolved.hostname)) return null;

      // Skip common non-content paths
      const skipPaths = ['/login', '/logout', '/signup', '/register', '/cart', '/checkout', '/search', '/api/', '/cdn-cgi/', '/wp-admin'];
      if (skipPaths.some(p => resolved.pathname.toLowerCase().startsWith(p))) return null;

      // Skip file extensions
      const skipExts = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.zip', '.css', '.js', '.xml'];
      if (skipExts.some(ext => resolved.pathname.toLowerCase().endsWith(ext))) return null;

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
