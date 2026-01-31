/**
 * Sitemap Discovery Submodule
 *
 * Parses sitemap.xml to find URLs for each entity's website.
 * Handles sitemap index files and regular sitemaps.
 *
 * Input Required: `website` column from entity data (from CSV)
 *
 * Options:
 * - sitemap_location: 'auto' | 'custom' (default: auto)
 * - include_nested: boolean (default: true)
 *
 * Error Codes:
 * - SITEMAP_NOT_FOUND: No sitemap at expected locations
 * - SITEMAP_PARSE_ERROR: Invalid XML or unexpected format
 * - SITEMAP_TIMEOUT: Request exceeded 30s
 * - NO_WEBSITE_URL: Entity missing `website` column
 */

const https = require('https');
const http = require('http');
const { parseStringPromise } = require('xml2js');
const { gunzipSync } = require('zlib');
const { fetchWithFallback } = require('../../../utils/browser');

module.exports = {
  id: 'sitemap',
  name: 'Sitemap',
  type: 'discovery',
  category: 'website',
  version: '2.0.0',
  description: 'Parse sitemap.xml to find URLs',
  cost: 'cheap',
  cost_tier: 'cheap',
  requiresExternalApi: false,

  inputs_required: [
    { name: 'website', type: 'url', label: 'Website URL', description: "Entity's website (from CSV)" }
  ],
  inputs_optional: [],

  options: [
    { name: 'sitemap_location', type: 'select', values: ['auto', 'custom'], default: 'auto', description: 'Auto-detect or specify URL' },
    { name: 'include_nested', type: 'boolean', values: [true, false], default: true, description: 'Follow sitemap index to child sitemaps' },
    { name: 'max_urls_per_entity', type: 'number', default: 10000, description: 'Max URLs to collect per entity' }
  ],

  output_type: 'urls',
  output_schema: {
    url: 'string',
    sitemap_lastmod: 'string|null'
  },

  error_codes: ['SITEMAP_NOT_FOUND', 'SITEMAP_PARSE_ERROR', 'SITEMAP_TIMEOUT', 'NO_WEBSITE_URL'],

  /**
   * Execute sitemap discovery for entities
   * @param {Array} entities - Entities with website field
   * @param {Object} config - Options (sitemap_location, include_nested, max_urls_per_entity)
   * @param {Object} context - { logger, db }
   * @returns {Array} URLs with metadata
   */
  async execute(entities, config = {}, context = {}) {
    const { logger = console } = context;
    const includeNested = config.include_nested !== false;
    const maxUrlsPerEntity = config.max_urls_per_entity || 10000;
    const concurrency = config.concurrency || 5; // Process 5 entities at a time
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
        const sitemapResult = await this._fetchSitemap(domain, includeNested, maxUrlsPerEntity, logger);

        const urls = sitemapResult.urls.map(item => ({
          entity_id: entity.id,
          entity_name: entityName,
          url: item.url,
          source_category: 'website',
          source_submodule: 'sitemap',
          metadata: { source: 'sitemap', sitemap_lastmod: item.lastmod || null }
        }));

        logger.info(`[sitemap] Found ${urls.length} URLs for ${entityName}`);

        return {
          urls,
          error: sitemapResult.error ? { entity_id: entity.id, entity_name: entityName, ...sitemapResult.error } : null
        };
      } catch (e) {
        logger.error(`[sitemap] Error processing ${entityName}: ${e.message}`);
        return {
          urls: [],
          error: { entity_id: entity.id, entity_name: entityName, error_code: 'SITEMAP_PARSE_ERROR', message: e.message }
        };
      }
    };

    // Process entities in parallel batches
    logger.info(`[sitemap] Processing ${entities.length} entities (concurrency: ${concurrency})`);

    for (let i = 0; i < entities.length; i += concurrency) {
      const batch = entities.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(processEntity));

      for (const result of batchResults) {
        results.push(...result.urls);
        if (result.error) errors.push(result.error);
      }

      logger.info(`[sitemap] Processed batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(entities.length / concurrency)}`);
    }

    // Attach errors to results for visibility
    if (errors.length > 0) {
      results._errors = errors;
    }

    return results;
  },

  _extractDomain(url) {
    try {
      // Handle URLs with or without protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      // If URL parsing fails, assume it's already a domain
      return url.replace(/^(https?:\/\/)?/, '').split('/')[0];
    }
  },

  async _fetchSitemap(domain, includeNested, maxUrls, logger) {
    const urls = [];
    let error = null;

    // Try multiple sitemap locations
    const sitemapLocations = [
      `https://${domain}/sitemap.xml`,
      `https://${domain}/sitemap_index.xml`,
      `https://${domain}/sitemap/sitemap.xml`
    ];

    let content = null;
    let foundUrl = null;

    for (const sitemapUrl of sitemapLocations) {
      content = await this._fetch(sitemapUrl, 15000, logger);
      if (content) {
        foundUrl = sitemapUrl;
        logger.info(`[sitemap] Found sitemap at ${sitemapUrl}`);
        break;
      }
    }

    if (!content) {
      return {
        urls: [],
        error: { code: 'SITEMAP_NOT_FOUND', message: `No sitemap found for ${domain}` }
      };
    }

    try {
      const parsed = await parseStringPromise(content, { explicitArray: false });

      // Check if this is a sitemap index
      if (parsed.sitemapindex?.sitemap && includeNested) {
        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
          ? parsed.sitemapindex.sitemap
          : [parsed.sitemapindex.sitemap];

        // Fetch all nested sitemaps IN PARALLEL (much faster)
        const sitemapLocs = sitemaps.map(sm => sm.loc).filter(Boolean);
        logger.info(`[sitemap] Found ${sitemapLocs.length} nested sitemaps, fetching in parallel...`);

        // Give each sitemap full limit - we'll cap total at the end
        const fetchPromises = sitemapLocs.map(loc =>
          this._fetchSingleSitemap(loc, maxUrls, logger)
            .catch(e => { logger.warn(`[sitemap] Failed to fetch ${loc}: ${e.message}`); return []; })
        );

        const allResults = await Promise.all(fetchPromises);
        for (const subUrls of allResults) {
          urls.push(...subUrls);
        }
        // Cap total URLs
        if (urls.length > maxUrls) {
          urls.length = maxUrls;
        }
      } else if (parsed.urlset?.url) {
        // Regular sitemap
        const entries = Array.isArray(parsed.urlset.url)
          ? parsed.urlset.url
          : [parsed.urlset.url];

        for (const entry of entries.slice(0, maxUrls)) {
          if (entry.loc) {
            urls.push({
              url: entry.loc,
              lastmod: entry.lastmod || null
            });
          }
        }
      }
    } catch (e) {
      error = { code: 'SITEMAP_PARSE_ERROR', message: `Failed to parse: ${e.message}` };
      logger.warn(`[sitemap] Failed to parse sitemap for ${domain}: ${e.message}`);
    }

    return { urls, error };
  },

  async _fetchSingleSitemap(url, maxUrls, logger) {
    const urls = [];

    try {
      let content = await this._fetch(url, 15000, logger);
      if (!content) return urls;

      // Handle gzipped sitemaps
      if (url.endsWith('.gz')) {
        try {
          const buffer = Buffer.from(content, 'binary');
          content = gunzipSync(buffer).toString('utf-8');
        } catch (e) {
          logger.warn(`[sitemap] Failed to decompress ${url}`);
          return urls;
        }
      }

      const parsed = await parseStringPromise(content, { explicitArray: false });

      if (parsed.urlset?.url) {
        const entries = Array.isArray(parsed.urlset.url)
          ? parsed.urlset.url
          : [parsed.urlset.url];

        for (const entry of entries.slice(0, maxUrls)) {
          if (entry.loc) {
            urls.push({
              url: entry.loc,
              lastmod: entry.lastmod || null
            });
          }
        }
      }
    } catch (e) {
      logger.warn(`[sitemap] Failed to fetch sub-sitemap ${url}: ${e.message}`);
    }

    return urls;
  },

  async _fetch(url, timeout = 15000, logger = console) {
    // First try simple HTTP fetch
    const content = await this._simpleFetch(url, timeout);

    if (content) {
      // Check if we got a valid XML response or if we're blocked
      const lowerContent = content.toLowerCase();
      const isBlocked =
        lowerContent.includes('captcha') ||
        lowerContent.includes('cloudflare') ||
        lowerContent.includes('please enable javascript') ||
        lowerContent.includes('browser check') ||
        lowerContent.includes('ddos protection') ||
        (content.length < 500 && !content.includes('<?xml') && !content.includes('<urlset') && !content.includes('<sitemapindex'));

      if (!isBlocked) {
        return content;
      }

      logger.info?.(`[sitemap] Simple fetch blocked for ${url}, trying browser...`);
    }

    // Fall back to browser fetch
    try {
      const result = await fetchWithFallback(url, {
        simpleTimeout: timeout,
        browserTimeout: 30000,
        logger
      });

      if (result.status === 200 && result.content) {
        logger.info?.(`[sitemap] Browser fetch succeeded for ${url}`);
        return result.content;
      }
    } catch (e) {
      logger.warn?.(`[sitemap] Browser fetch failed for ${url}: ${e.message}`);
    }

    return null;
  },

  _simpleFetch(url, timeout = 15000) {
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._simpleFetch(res.headers.location, timeout).then(resolve);
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
