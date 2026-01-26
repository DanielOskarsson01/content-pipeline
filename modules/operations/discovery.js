/**
 * Discovery Module (Config-Driven Cascade)
 *
 * This module executes discovery submodules for a SINGLE entity.
 * The entity comes from context.entitySnapshot (frozen at run start).
 *
 * Architecture:
 * - BullMQ calls this module once per entity
 * - This module runs multiple submodules in-memory based on config phases
 * - Single database write at the end (bulk insert discovered URLs)
 * - Submodules are pure functions: (entities, config, context) => results[]
 *
 * Note: Submodules still receive an array format for compatibility,
 * but we pass a single-element array [entitySnapshot].
 */

const path = require('path');

module.exports = {
  name: 'discovery',
  version: '3.0.0',
  type: 'discovery',

  configSchema: {
    type: 'object',
    properties: {
      min_urls_per_entity: {
        type: 'number',
        minimum: 1,
        default: 10,
        description: 'Target minimum URLs before stopping cascade'
      },
      max_urls_per_entity: {
        type: 'number',
        minimum: 1,
        maximum: 500,
        default: 100,
        description: 'Hard cap on URLs'
      },
      phases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Phase identifier for logging' },
            condition: {
              type: 'string',
              enum: ['all', 'below_threshold'],
              description: 'When to run: all or only if below min_urls'
            },
            parallel: {
              type: 'boolean',
              default: false,
              description: 'Run methods in parallel (true) or sequential (false)'
            },
            submodules: {
              type: 'array',
              items: { type: 'string' },
              description: 'Submodule names to execute (loaded from submodules/discovery/)'
            }
          },
          required: ['name', 'condition', 'submodules']
        },
        description: 'Ordered phases defining cascade execution'
      },
      global_filters: {
        type: 'object',
        properties: {
          allowed_domains: { type: 'array', items: { type: 'string' } },
          exclude_patterns: { type: 'array', items: { type: 'string' } }
        },
        description: 'Filters applied to all discovered URLs'
      }
    },
    required: ['phases']
  },

  metadata: {
    description: 'Config-driven URL discovery with cascading phases',
    author: 'onlyigaming',
    tags: ['discovery', 'urls', 'cascade', 'config-driven'],
    inputType: 'Previous stage output (entity comes from context.entitySnapshot)',
    outputType: '{ total_urls, stats }',
    estimatedDuration: 'Varies by enabled methods'
  },

  // Submodule cache to avoid repeated requires
  _submoduleCache: {},

  async execute(input, config, context) {
    const { db, runEntityId, entitySnapshot, logger, publishProgress } = context;

    // Validate we have entity context
    if (!runEntityId || !entitySnapshot) {
      throw new Error('Discovery module requires runEntityId and entitySnapshot in context');
    }

    const {
      min_urls_per_entity = 10,
      max_urls_per_entity = 100,
      phases = [],
      global_filters = {}
    } = config;

    const entityName = entitySnapshot.name || runEntityId.slice(0, 8);
    logger.info(`Starting discovery for "${entityName}"`, {
      phases: phases.map(p => p.name),
      min_urls: min_urls_per_entity,
      max_urls: max_urls_per_entity
    });

    // Build entity object for submodules (they expect array format)
    const entity = {
      id: entitySnapshot.id,
      name: entitySnapshot.name,
      metadata: entitySnapshot.metadata || {},
      // Extract common fields from metadata
      domain: entitySnapshot.metadata?.domain || entitySnapshot.metadata?.website,
      seed_urls: entitySnapshot.metadata?.seed_urls || []
    };

    // Track discovered URLs in-memory
    const discoveredUrls = [];

    // Stats tracking
    const stats = {
      by_submodule: {},
      by_phase: {}
    };

    // Execute phases in order
    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
      const phase = phases[phaseIndex];
      logger.info(`Phase ${phaseIndex + 1}/${phases.length}: ${phase.name}`);

      // Check condition
      if (phase.condition === 'below_threshold' && discoveredUrls.length >= min_urls_per_entity) {
        logger.info(`Skipping phase ${phase.name}: already have ${discoveredUrls.length} URLs`);
        continue;
      }

      // Execute submodules (pass entity as single-element array for compatibility)
      const phaseResults = phase.parallel
        ? await this._runSubmodulesParallel(phase.submodules, [entity], config, context)
        : await this._runSubmodulesSequential(phase.submodules, [entity], config, context);

      // Merge results
      let addedThisPhase = 0;
      for (const result of phaseResults) {
        // Filter and deduplicate
        const filtered = this._filterUrl(result, global_filters);
        if (filtered && !discoveredUrls.some(u => u.url === result.url)) {
          // Cap per entity
          if (discoveredUrls.length < max_urls_per_entity) {
            discoveredUrls.push({
              url: result.url,
              submodule: result.submodule,
              phase: phase.name,
              metadata: result.metadata || {}
            });
            addedThisPhase++;

            // Update stats
            stats.by_submodule[result.submodule] = (stats.by_submodule[result.submodule] || 0) + 1;
          }
        }
      }

      stats.by_phase[phase.name] = addedThisPhase;
      logger.info(`Phase ${phase.name}: +${addedThisPhase} URLs (total: ${discoveredUrls.length})`);

      // Report progress
      if (publishProgress) {
        await publishProgress(
          Math.round(((phaseIndex + 1) / phases.length) * 100),
          `Phase ${phase.name}: ${discoveredUrls.length} URLs`
        );
      }
    }

    // Single bulk database write using run_entity_id
    if (discoveredUrls.length > 0) {
      const urlRecords = discoveredUrls.map(url => ({
        run_entity_id: runEntityId,
        url: url.url,
        discovery_method: url.submodule,
        priority: 0,
        status: 'pending',
        created_at: new Date().toISOString()
      }));

      const { error } = await db
        .from('discovered_urls')
        .insert(urlRecords);

      if (error) {
        logger.error('Failed to store URLs', { error: error.message });
        throw error;
      }
    }

    logger.info(`Complete: ${discoveredUrls.length} URLs stored`, { stats });

    return {
      success: true,
      output_data: {
        entity_name: entityName,
        total_urls: discoveredUrls.length,
        stats
      }
    };
  },

  async _runSubmodulesParallel(submoduleNames, entities, config, context) {
    const results = await Promise.all(
      submoduleNames.map(name => this._executeSubmodule(name, entities, config, context))
    );
    return results.flat();
  },

  async _runSubmodulesSequential(submoduleNames, entities, config, context) {
    const results = [];
    for (const name of submoduleNames) {
      const submoduleResults = await this._executeSubmodule(name, entities, config, context);
      results.push(...submoduleResults);
    }
    return results;
  },

  async _executeSubmodule(submoduleName, entities, config, context) {
    const { logger } = context;

    // Load submodule
    if (!this._submoduleCache[submoduleName]) {
      const submodulePath = path.resolve(__dirname, '..', 'submodules', 'discovery', `${submoduleName}.js`);
      try {
        this._submoduleCache[submoduleName] = require(submodulePath);
      } catch (e) {
        logger.warn(`Submodule not found: ${submoduleName}`, { path: submodulePath });
        return [];
      }
    }

    const submodule = this._submoduleCache[submoduleName];

    try {
      logger.info(`Executing submodule: ${submoduleName}`);
      const results = await submodule.execute(entities, config, context);
      logger.info(`Submodule ${submoduleName}: ${results.length} URLs`);
      return results.map(r => ({ ...r, submodule: submoduleName }));
    } catch (e) {
      logger.error(`Submodule ${submoduleName} failed`, { error: e.message });
      return []; // Don't fail entire module if one submodule fails
    }
  },

  _filterUrl(urlItem, filters) {
    if (!urlItem?.url) return null;

    try {
      const parsed = new URL(urlItem.url);

      // Domain filter
      if (filters.allowed_domains?.length > 0) {
        if (!filters.allowed_domains.some(d => parsed.hostname.endsWith(d))) {
          return null;
        }
      }

      // Exclude patterns
      if (filters.exclude_patterns) {
        for (const pattern of filters.exclude_patterns) {
          if (new RegExp(pattern).test(urlItem.url)) {
            return null;
          }
        }
      }

      return urlItem;
    } catch {
      return null; // Invalid URL
    }
  }
};
