/**
 * Operation Module Template
 *
 * All pipeline operations follow this interface. The generic BullMQ worker
 * dynamically loads modules based on pipeline_templates configuration.
 *
 * Usage:
 *   Copy this template and implement the execute() function.
 *   The worker validates config against configSchema before execution.
 */

module.exports = {
  // Required: unique operation identifier (matches pipeline_templates.operation)
  name: 'operation-name',

  // Required: semantic version for tracking compatibility
  version: '1.0.0',

  // Required: operation category for grouping and UI display
  type: 'discovery', // 'discovery' | 'validation' | 'extraction' | 'generation' | 'filtering' | 'output'

  // Required: JSON Schema for config validation (validated before execute() is called)
  configSchema: {
    type: 'object',
    properties: {
      // Define expected configuration properties here
      // example: { type: 'string', description: 'Example config property' }
    },
    required: []
  },

  // Required: descriptive metadata for registry and UI
  metadata: {
    description: 'Brief description of what this operation does',
    author: 'onlyigaming',
    tags: [],  // e.g., ['discovery', 'urls', 'sitemap']
    inputType: 'object',    // Expected input shape description
    outputType: 'object',   // Output shape description
    estimatedDuration: null  // e.g., '30-60 seconds per entity' (informational only)
  },

  /**
   * Execute the operation.
   *
   * @param {object} input - Input data from previous stage or project config
   * @param {object} config - Stage-specific configuration (validated against configSchema)
   * @param {object} context - Shared services
   * @param {object} context.db - Supabase client
   * @param {object} context.contentLibrary - Content library service (query, store, tag)
   * @param {object} context.tagService - Tag taxonomy service (resolve, assign, query)
   * @param {object} context.logger - Structured logger (info, warn, error)
   * @param {object} context.aiProvider - AI provider adapter (generate, embed)
   * @returns {object} Result object passed to next stage
   */
  async execute(input, config, context) {
    const { db, contentLibrary, logger } = context;

    logger.info(`[${this.name}] Starting execution`, { input_keys: Object.keys(input) });

    // Implementation here

    return {
      success: true,
      data: {}
    };
  }
};
