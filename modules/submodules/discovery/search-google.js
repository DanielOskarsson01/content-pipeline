/**
 * Google Search Discovery Method
 *
 * Discovers URLs using Google Custom Search API.
 * Falls back for entities where cheap methods didn't find enough URLs.
 * Cost: EXPENSIVE - requires API credits.
 */

module.exports = {
  name: 'search-google',
  version: '1.0.0',
  description: 'Discover URLs via Google Custom Search API (site: search)',
  cost: 'expensive',
  requiresExternalApi: true,

  async execute(entities, config, context) {
    const { logger } = context;
    const results = [];

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!apiKey || !searchEngineId) {
      logger.warn('[search-google] API key or search engine ID not configured, skipping');
      return results;
    }

    const maxResultsPerEntity = config.search_max_results || 10;

    for (const entity of entities) {
      if (!entity.domain) {
        logger.warn(`[search-google] Entity ${entity.name} has no domain, skipping`);
        continue;
      }

      try {
        const urls = await this._searchSite(entity.domain, apiKey, searchEngineId, maxResultsPerEntity, logger);

        for (const url of urls) {
          results.push({
            entity_id: entity.id,
            url,
            metadata: { source: 'google-search' }
          });
        }

        logger.info(`[search-google] Found ${urls.length} URLs for ${entity.name}`);

        // Rate limiting - 1 request per second
        await new Promise(r => setTimeout(r, 1000));

      } catch (e) {
        logger.error(`[search-google] Failed for ${entity.name}: ${e.message}`);
      }
    }

    return results;
  },

  async _searchSite(domain, apiKey, searchEngineId, maxResults, logger) {
    const urls = [];
    const query = `site:${domain}`;

    try {
      const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
      searchUrl.searchParams.set('key', apiKey);
      searchUrl.searchParams.set('cx', searchEngineId);
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('num', Math.min(maxResults, 10).toString());

      const response = await fetch(searchUrl.toString());
      if (!response.ok) {
        logger.warn(`[search-google] API error: ${response.status}`);
        return urls;
      }

      const data = await response.json();

      if (data.items) {
        for (const item of data.items) {
          if (item.link) {
            urls.push(item.link);
          }
        }
      }

    } catch (e) {
      logger.error(`[search-google] Search failed for ${domain}: ${e.message}`);
    }

    return urls;
  }
};
