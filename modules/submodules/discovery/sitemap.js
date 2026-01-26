/**
 * Sitemap Discovery Method
 *
 * Discovers URLs by parsing sitemap.xml files.
 * Handles sitemap index files (sitemapindex) and regular sitemaps.
 * Cost: CHEAP - single HTTP request per entity (or few for index).
 */

const https = require('https');
const http = require('http');
const { parseStringPromise } = require('xml2js');
const { gunzipSync } = require('zlib');

module.exports = {
  name: 'sitemap',
  version: '1.0.0',
  description: 'Parse sitemap.xml to discover URLs',
  cost: 'cheap',
  requiresExternalApi: false,

  async execute(entities, config, context) {
    const { logger } = context;
    const results = [];

    for (const entity of entities) {
      if (!entity.domain) {
        logger.warn(`[sitemap] Entity ${entity.name} has no domain, skipping`);
        continue;
      }

      const sitemapUrls = await this._fetchSitemap(entity.domain, logger);

      for (const url of sitemapUrls) {
        results.push({
          entity_id: entity.id,
          url,
          metadata: { source: 'sitemap' }
        });
      }

      logger.info(`[sitemap] Found ${sitemapUrls.length} URLs for ${entity.name}`);
    }

    return results;
  },

  async _fetchSitemap(domain, logger) {
    const urls = [];
    const sitemapUrl = `https://${domain}/sitemap.xml`;

    try {
      const content = await this._fetch(sitemapUrl);
      if (!content) return urls;

      const parsed = await parseStringPromise(content, { explicitArray: false });

      // Check if this is a sitemap index
      if (parsed.sitemapindex?.sitemap) {
        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
          ? parsed.sitemapindex.sitemap
          : [parsed.sitemapindex.sitemap];

        // Fetch first 3 sitemaps from index (avoid overwhelming)
        for (const sm of sitemaps.slice(0, 3)) {
          const loc = sm.loc;
          if (loc) {
            const subUrls = await this._fetchSingleSitemap(loc, logger);
            urls.push(...subUrls);
          }
        }
      } else if (parsed.urlset?.url) {
        // Regular sitemap
        const entries = Array.isArray(parsed.urlset.url)
          ? parsed.urlset.url
          : [parsed.urlset.url];

        for (const entry of entries) {
          if (entry.loc) urls.push(entry.loc);
        }
      }
    } catch (e) {
      logger.warn(`[sitemap] Failed to parse sitemap for ${domain}: ${e.message}`);
    }

    return urls;
  },

  async _fetchSingleSitemap(url, logger) {
    const urls = [];

    try {
      let content = await this._fetch(url);
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

        for (const entry of entries) {
          if (entry.loc) urls.push(entry.loc);
        }
      }
    } catch (e) {
      logger.warn(`[sitemap] Failed to fetch sub-sitemap ${url}: ${e.message}`);
    }

    return urls;
  },

  _fetch(url) {
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;
      const timeout = 10000;

      const req = protocol.get(url, { timeout }, (res) => {
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
