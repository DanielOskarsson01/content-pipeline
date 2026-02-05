/**
 * Dedupe Submodule
 *
 * Removes duplicate URLs from the discovered URLs list.
 * Duplicates can occur when:
 * - Same URL discovered by multiple submodules (sitemap + navigation)
 * - Same URL discovered for multiple entities (if allowed)
 *
 * Strategy: Keep first occurrence, mark subsequent as duplicates.
 * Within same entity: always dedupe
 * Across entities: configurable (default: keep for each entity)
 */

module.exports = {
  id: 'dedupe',
  name: 'Dedupe',
  type: 'validation',
  category: 'dedup',
  version: '1.0.0',
  description: 'Remove duplicate URLs within each entity',
  cost: 'cheap',
  requiresExternalApi: false,

  options: [
    { name: 'dedupe_across_entities', type: 'boolean', values: [true, false], default: false, description: 'Dedupe URLs across all entities (not just within each)' },
    { name: 'prefer_discovery_method', type: 'select', values: ['sitemap', 'navigation', 'seed-expansion', null], default: null, description: 'Prefer URLs from this discovery method when deduping' },
  ],

  async execute(urls, config, context) {
    const { logger } = context;
    const {
      dedupe_across_entities = false, // If true, URL can only belong to one entity
      prefer_discovery_method = null  // If set, prefer this method when deduping (e.g., 'sitemap')
    } = config;

    const valid = [];
    const invalid = [];

    // Track seen URLs
    // Key: dedupe_across_entities ? url : `${run_entity_id}:${url}`
    const seen = new Map();

    // Sort by discovery method preference if specified
    let sortedUrls = [...urls];
    if (prefer_discovery_method) {
      sortedUrls.sort((a, b) => {
        const aPreferred = a.discovery_method === prefer_discovery_method ? 0 : 1;
        const bPreferred = b.discovery_method === prefer_discovery_method ? 0 : 1;
        return aPreferred - bPreferred;
      });
    }

    for (const urlRecord of sortedUrls) {
      const normalizedUrl = this.normalizeUrl(urlRecord.url);
      const key = dedupe_across_entities
        ? normalizedUrl
        : `${urlRecord.run_entity_id}:${normalizedUrl}`;

      if (seen.has(key)) {
        const original = seen.get(key);
        invalid.push({
          ...urlRecord,
          reason: 'duplicate',
          details: `Duplicate of URL discovered via ${original.discovery_method}`
        });
        logger.info(`[dedupe] Duplicate: ${urlRecord.url} (original via ${original.discovery_method})`);
      } else {
        seen.set(key, urlRecord);
        valid.push(urlRecord);
      }
    }

    logger.info(`[dedupe] Processed ${urls.length} URLs: ${valid.length} unique, ${invalid.length} duplicates`);

    return {
      valid,
      invalid,
      stats: {
        total: urls.length,
        valid_count: valid.length,
        invalid_count: invalid.length,
        duplicate_count: invalid.length
      }
    };
  },

  /**
   * Normalize URL for comparison
   * - Lowercase hostname
   * - Remove trailing slash
   * - Remove common tracking params
   * - Sort query params
   */
  normalizeUrl(url) {
    try {
      const parsed = new URL(url);

      // Lowercase hostname
      parsed.hostname = parsed.hostname.toLowerCase();

      // Remove trailing slash from pathname (except root)
      if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      // Remove common tracking params
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid'];
      trackingParams.forEach(param => parsed.searchParams.delete(param));

      // Sort remaining params for consistent comparison
      parsed.searchParams.sort();

      return parsed.toString();
    } catch {
      // If URL parsing fails, return as-is
      return url.toLowerCase();
    }
  }
};
