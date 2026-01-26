/**
 * Discovery Submodule Template
 *
 * All discovery submodules follow this interface. Submodules are pure functions
 * that take entities and return discovered URLs. They should NOT write
 * to the database - the parent module handles bulk storage.
 *
 * Interface:
 *   execute(entities, config, context) => Promise<DiscoveredUrl[]>
 *
 * DiscoveredUrl shape:
 *   {
 *     entity_id: string,     // Which entity this URL belongs to
 *     url: string,           // The discovered URL
 *     metadata: object       // Optional extra data (depth, title, etc.)
 *   }
 *
 * Note: The 'submodule' field is added automatically by the module executor.
 */

module.exports = {
  // Required: Submodule identifier (matches filename without .js)
  name: 'submodule-name',

  // Required: Which module this submodule belongs to
  type: 'discovery',

  // Required: Semantic version
  version: '1.0.0',

  // Required: Human-readable description for UI
  description: 'What this submodule does',

  // Optional: Estimated cost level (cheap, medium, expensive)
  cost: 'cheap',

  // Optional: Whether this submodule requires external API calls
  requiresExternalApi: false,

  /**
   * Execute the discovery submodule.
   *
   * @param {Array} entities - Entities to discover URLs for
   *   Each entity has: { id, name, domain, seed_urls? }
   * @param {object} config - Stage configuration (shared across all submodules)
   * @param {object} context - Shared services (db, logger, etc.)
   *   Note: Avoid writing to db here - just return URLs
   * @returns {Promise<Array>} Discovered URLs
   *   Each URL: { entity_id, url, metadata? }
   */
  async execute(entities, config, context) {
    const { logger } = context;
    const results = [];

    for (const entity of entities) {
      logger.info(`[${this.name}] Processing entity: ${entity.name}`);

      // Implementation here - discover URLs for this entity

      // Example result:
      // results.push({
      //   entity_id: entity.id,
      //   url: 'https://example.com/page',
      //   metadata: { depth: 0, title: 'Page Title' }
      // });
    }

    return results;
  }
};
