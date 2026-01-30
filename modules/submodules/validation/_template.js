/**
 * Validation Submodule Template
 *
 * All validation submodules follow this interface. Submodules are pure functions
 * that take URLs and return validated/filtered URLs. They should NOT write
 * to the database - the parent module handles bulk storage.
 *
 * Interface:
 *   execute(urls, config, context) => Promise<ValidationResult>
 *
 * ValidationResult shape:
 *   {
 *     valid: Array<ValidatedUrl>,    // URLs that passed validation
 *     invalid: Array<InvalidUrl>,    // URLs that failed with reasons
 *     stats: object                  // Summary statistics
 *   }
 *
 * ValidatedUrl shape:
 *   {
 *     id: string,                    // Original URL record ID
 *     run_entity_id: string,         // Which entity this URL belongs to
 *     url: string,                   // The URL
 *     entity_name: string,           // Entity name for display
 *     metadata: object               // Any extra data
 *   }
 *
 * InvalidUrl shape:
 *   {
 *     ...ValidatedUrl,
 *     reason: string,                // Why it was filtered (e.g., 'duplicate', 'invalid_format')
 *     details: string                // Human-readable explanation
 *   }
 */

module.exports = {
  // Required: Submodule identifier (matches filename without .js)
  name: 'submodule-name',

  // Required: Which module this submodule belongs to
  type: 'validation',

  // Required: Semantic version
  version: '1.0.0',

  // Required: Human-readable description for UI
  description: 'What this submodule does',

  // Optional: Estimated cost level (cheap, medium, expensive)
  cost: 'cheap',

  // Optional: Whether this submodule requires external API calls
  requiresExternalApi: false,

  /**
   * Execute the validation submodule.
   *
   * @param {Array} urls - URLs to validate
   *   Each URL has: { id, run_entity_id, url, entity_name, discovery_method, metadata? }
   * @param {object} config - Stage configuration
   * @param {object} context - Shared services (db, logger, etc.)
   * @returns {Promise<ValidationResult>} Validation results
   */
  async execute(urls, config, context) {
    const { logger } = context;
    const valid = [];
    const invalid = [];

    for (const urlRecord of urls) {
      logger.info(`[${this.name}] Validating: ${urlRecord.url}`);

      // Implementation here - validate the URL
      // If valid: push to valid[]
      // If invalid: push to invalid[] with reason

      // Example:
      // valid.push(urlRecord);
      // OR
      // invalid.push({ ...urlRecord, reason: 'invalid_format', details: 'Missing protocol' });
    }

    return {
      valid,
      invalid,
      stats: {
        total: urls.length,
        valid_count: valid.length,
        invalid_count: invalid.length
      }
    };
  }
};
