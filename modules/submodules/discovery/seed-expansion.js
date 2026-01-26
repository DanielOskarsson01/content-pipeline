/**
 * Seed Expansion Discovery Method
 *
 * Expands seed URLs by crawling them and extracting internal links.
 * Takes URLs from entity.seed_urls and discovers linked pages.
 * Cost: CHEAP - simple HTML parsing of provided seeds.
 */

const https = require('https');
const http = require('http');
const { JSDOM } = require('jsdom');

module.exports = {
  name: 'seed-expansion',
  version: '1.0.0',
  description: 'Expand seed URLs by extracting internal links from them',
  cost: 'cheap',
  requiresExternalApi: false,

  async execute(entities, config, context) {
    const { logger } = context;
    const results = [];
    const maxDepth = config.seed_expansion_depth || 1;
    const maxLinksPerSeed = config.max_links_per_seed || 50;

    for (const entity of entities) {
      const seedUrls = entity.seed_urls || [];
      if (seedUrls.length === 0) {
        // If no seeds, use domain homepage as seed
        if (entity.domain) {
          seedUrls.push(`https://${entity.domain}`);
        } else {
          continue;
        }
      }

      const discovered = new Set();

      for (const seedUrl of seedUrls) {
        // Add the seed itself
        discovered.add(seedUrl);

        // Extract links from seed
        const links = await this._extractLinks(seedUrl, entity.domain, logger);
        for (const link of links.slice(0, maxLinksPerSeed)) {
          discovered.add(link);
        }
      }

      for (const url of discovered) {
        results.push({
          entity_id: entity.id,
          url,
          metadata: { source: 'seed-expansion', depth: 1 }
        });
      }

      logger.info(`[seed-expansion] Found ${discovered.size} URLs for ${entity.name}`);
    }

    return results;
  },

  async _extractLinks(url, domain, logger) {
    const urls = new Set();

    try {
      const html = await this._fetch(url);
      if (!html) return [];

      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // Extract all links
      const links = doc.querySelectorAll('a[href]');
      for (const link of links) {
        const href = link.getAttribute('href');
        const resolved = this._resolveUrl(href, url, domain);
        if (resolved) urls.add(resolved);
      }

    } catch (e) {
      logger.warn(`[seed-expansion] Failed to extract links from ${url}: ${e.message}`);
    }

    return [...urls];
  },

  _resolveUrl(href, base, domain) {
    if (!href) return null;
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return null;

    try {
      const resolved = new URL(href, base);

      // Only same-domain URLs (or subdomain)
      if (domain && !resolved.hostname.endsWith(domain)) return null;

      // Skip common non-content paths
      const skipPaths = ['/login', '/logout', '/signup', '/register', '/cart', '/checkout', '/api/', '/cdn-cgi/'];
      if (skipPaths.some(p => resolved.pathname.startsWith(p))) return null;

      // Skip file extensions
      const skipExts = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.zip', '.css', '.js', '.xml'];
      if (skipExts.some(ext => resolved.pathname.toLowerCase().endsWith(ext))) return null;

      // Clean URL (remove tracking params)
      resolved.search = '';
      resolved.hash = '';

      return resolved.href;
    } catch {
      return null;
    }
  },

  _fetch(url) {
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;
      const timeout = 10000;

      const req = protocol.get(url, {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ContentPipelineBot/1.0)'
        }
      }, (res) => {
        // Follow redirects (up to 3)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(this._fetch(res.headers.location));
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
