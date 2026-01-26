/**
 * Navigation Discovery Method
 *
 * Discovers URLs by crawling the homepage and extracting navigation links.
 * Follows nav/header/footer links one level deep.
 * Cost: CHEAP - simple HTML parsing, no JS rendering.
 */

const https = require('https');
const http = require('http');
const { JSDOM } = require('jsdom');

module.exports = {
  name: 'navigation',
  version: '1.0.0',
  description: 'Extract URLs from site navigation (header, footer, menus)',
  cost: 'cheap',
  requiresExternalApi: false,

  async execute(entities, config, context) {
    const { logger } = context;
    const results = [];

    for (const entity of entities) {
      if (!entity.domain) {
        logger.warn(`[navigation] Entity ${entity.name} has no domain, skipping`);
        continue;
      }

      const urls = await this._extractNavLinks(entity.domain, logger);

      for (const url of urls) {
        results.push({
          entity_id: entity.id,
          url,
          metadata: { source: 'navigation', depth: 1 }
        });
      }

      logger.info(`[navigation] Found ${urls.length} URLs for ${entity.name}`);
    }

    return results;
  },

  async _extractNavLinks(domain, logger) {
    const urls = new Set();
    const homepageUrl = `https://${domain}`;

    try {
      const html = await this._fetch(homepageUrl);
      if (!html) return [];

      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // Selectors for navigation elements
      const navSelectors = [
        'nav a',
        'header a',
        'footer a',
        '[role="navigation"] a',
        '.nav a',
        '.navbar a',
        '.menu a',
        '.main-menu a',
        '#nav a',
        '#menu a'
      ];

      for (const selector of navSelectors) {
        const links = doc.querySelectorAll(selector);
        for (const link of links) {
          const href = link.getAttribute('href');
          const resolved = this._resolveUrl(href, homepageUrl, domain);
          if (resolved) urls.add(resolved);
        }
      }

    } catch (e) {
      logger.warn(`[navigation] Failed to crawl ${domain}: ${e.message}`);
    }

    return [...urls];
  },

  _resolveUrl(href, base, domain) {
    if (!href) return null;
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return null;

    try {
      const resolved = new URL(href, base);

      // Only same-domain URLs
      if (!resolved.hostname.endsWith(domain)) return null;

      // Skip common non-content paths
      const skipPaths = ['/login', '/logout', '/signup', '/register', '/cart', '/checkout', '/search', '/api/'];
      if (skipPaths.some(p => resolved.pathname.startsWith(p))) return null;

      // Skip file extensions
      const skipExts = ['.pdf', '.jpg', '.png', '.gif', '.zip', '.css', '.js'];
      if (skipExts.some(ext => resolved.pathname.endsWith(ext))) return null;

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
        // Follow redirects
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
