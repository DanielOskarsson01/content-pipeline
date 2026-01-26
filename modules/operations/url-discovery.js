/**
 * URL Discovery Operation
 *
 * Discovers URLs for a given entity using multiple methods:
 * sitemap parsing, navigation crawling, and seed URL expansion.
 * Results are stored in the content library as scraped_page placeholders.
 */

module.exports = {
  name: 'url-discovery',
  version: '1.0.0',
  type: 'discovery',

  configSchema: {
    type: 'object',
    properties: {
      methods: {
        type: 'array',
        items: { type: 'string', enum: ['sitemap', 'navigation', 'seed'] },
        description: 'Discovery methods to use (executed in order)'
      },
      max_urls: {
        type: 'number',
        minimum: 1,
        maximum: 1000,
        default: 100,
        description: 'Maximum URLs to discover per entity'
      },
      allowed_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Restrict discovery to these domains (optional)'
      },
      exclude_patterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'URL patterns to exclude (regex strings)'
      }
    },
    required: ['methods']
  },

  metadata: {
    description: 'Discovers URLs from sitemaps, navigation, and seed expansion for target entities',
    author: 'onlyigaming',
    tags: ['discovery', 'urls', 'sitemap', 'crawl'],
    inputType: '{ entities: [{ name, domain, seed_urls? }] }',
    outputType: '{ discovered_urls: [{ url, source_method, entity }] }',
    estimatedDuration: '30-60 seconds per entity'
  },

  async execute(input, config, context) {
    const { db, contentLibrary, logger } = context;
    const { entities } = input;
    const { methods, max_urls = 100, allowed_domains, exclude_patterns } = config;

    logger.info(`[url-discovery] Starting for ${entities.length} entities`, { methods, max_urls });

    const discovered = [];

    for (const entity of entities) {
      const entityUrls = [];

      for (const method of methods) {
        if (entityUrls.length >= max_urls) break;

        let urls = [];
        switch (method) {
          case 'sitemap':
            urls = await this._discoverFromSitemap(entity, context);
            break;
          case 'navigation':
            urls = await this._discoverFromNavigation(entity, context);
            break;
          case 'seed':
            urls = await this._expandSeedUrls(entity, context);
            break;
        }

        // Apply filters
        const filtered = this._filterUrls(urls, { allowed_domains, exclude_patterns, entity });
        entityUrls.push(...filtered);
      }

      // Deduplicate and cap
      const unique = [...new Map(entityUrls.map(u => [u.url, u])).values()].slice(0, max_urls);

      // Store as content_items placeholders
      for (const urlItem of unique) {
        await contentLibrary.store({
          content_type: 'scraped_page',
          source_url: urlItem.url,
          status: 'pending',
          metadata: {
            entity: entity.name,
            discovery_method: urlItem.source_method,
            discovered_at: new Date().toISOString()
          }
        });
      }

      discovered.push(...unique.map(u => ({ ...u, entity: entity.name })));
      logger.info(`[url-discovery] Found ${unique.length} URLs for ${entity.name}`);
    }

    return {
      success: true,
      data: {
        discovered_urls: discovered,
        total: discovered.length,
        by_entity: entities.map(e => ({
          entity: e.name,
          count: discovered.filter(d => d.entity === e.name).length
        }))
      }
    };
  },

  // Private methods

  async _discoverFromSitemap(entity, context) {
    // TODO: Implement sitemap.xml parsing
    // Fetch /sitemap.xml, parse XML, extract URLs
    return [];
  },

  async _discoverFromNavigation(entity, context) {
    // TODO: Implement navigation crawling
    // Load homepage, extract nav links, follow one level deep
    return [];
  },

  async _expandSeedUrls(entity, context) {
    // TODO: Implement seed URL expansion
    // Take seed_urls from entity config, discover linked pages
    return (entity.seed_urls || []).map(url => ({
      url,
      source_method: 'seed'
    }));
  },

  _filterUrls(urls, { allowed_domains, exclude_patterns, entity }) {
    return urls.filter(item => {
      try {
        const parsed = new URL(item.url);

        // Domain filter
        if (allowed_domains && allowed_domains.length > 0) {
          if (!allowed_domains.some(d => parsed.hostname.endsWith(d))) return false;
        }

        // Exclude patterns
        if (exclude_patterns) {
          for (const pattern of exclude_patterns) {
            if (new RegExp(pattern).test(item.url)) return false;
          }
        }

        return true;
      } catch {
        return false;
      }
    });
  }
};
