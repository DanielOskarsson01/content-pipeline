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
    { name: 'max_urls_per_entity', type: 'number', default: 500, description: 'Max URLs to collect per entity' }
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
    const maxUrlsPerEntity = config.max_urls_per_entity || 500;
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
        logger.warn(`[sitemap] Entity ${entity.name || entity.entity_name} has no website, skipping`);
        continue;
      }

      try {
        // Normalize website to domain
        const domain = this._extractDomain(website);
        const sitemapResult = await this._fetchSitemap(domain, includeNested, maxUrlsPerEntity, logger);

        for (const item of sitemapResult.urls) {
          results.push({
            entity_id: entity.id,
            entity_name: entity.name || entity.entity_name,
            url: item.url,
            source_category: 'website',
            source_submodule: 'sitemap',
            metadata: {
              source: 'sitemap',
              sitemap_lastmod: item.lastmod || null
            }
          });
        }

        if (sitemapResult.error) {
          errors.push({
            entity_id: entity.id,
            entity_name: entity.name || entity.entity_name,
            error_code: sitemapResult.error.code,
            message: sitemapResult.error.message
          });
        }

        logger.info(`[sitemap] Found ${sitemapResult.urls.length} URLs for ${entity.name || entity.entity_name}`);
      } catch (e) {
        errors.push({
          entity_id: entity.id,
          entity_name: entity.name || entity.entity_name,
          error_code: 'SITEMAP_PARSE_ERROR',
          message: e.message
        });
        logger.error(`[sitemap] Error processing ${entity.name || entity.entity_name}: ${e.message}`);
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
      content = await this._fetch(sitemapUrl, 30000);
      if (content) {
        foundUrl = sitemapUrl;
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

        // Fetch nested sitemaps (limit to first 5 to avoid overwhelming)
        for (const sm of sitemaps.slice(0, 5)) {
          if (urls.length >= maxUrls) break;

          const loc = sm.loc;
          if (loc) {
            const subUrls = await this._fetchSingleSitemap(loc, maxUrls - urls.length, logger);
            urls.push(...subUrls);
          }
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
      let content = await this._fetch(url, 30000);
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

  _fetch(url, timeout = 30000) {
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, { timeout }, (res) => {
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
