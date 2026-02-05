/**
 * URL Format Submodule
 *
 * Validates URL structure and format:
 * - Valid URL syntax
 * - Allowed protocols (http, https)
 * - Valid domain format
 * - Reasonable URL length
 * - No malformed characters
 */

module.exports = {
  id: 'url-format',
  name: 'URL Format',
  type: 'validation',
  category: 'filtering',
  version: '1.0.0',
  description: 'Validate URL format and structure',
  cost: 'cheap',
  requiresExternalApi: false,

  options: [
    { name: 'max_url_length', type: 'number', default: 2048, description: 'Maximum URL length allowed' },
    { name: 'require_tld', type: 'boolean', values: [true, false], default: true, description: 'Require top-level domain' },
  ],

  async execute(urls, config, context) {
    const { logger } = context;
    const {
      allowed_protocols = ['http:', 'https:'],
      max_url_length = 2048,
      require_tld = true
    } = config;

    const valid = [];
    const invalid = [];

    for (const urlRecord of urls) {
      const validation = this.validateUrl(urlRecord.url, {
        allowed_protocols,
        max_url_length,
        require_tld
      });

      if (validation.valid) {
        valid.push(urlRecord);
      } else {
        invalid.push({
          ...urlRecord,
          reason: 'invalid_format',
          details: validation.error
        });
        logger.info(`[url-format] Invalid: ${urlRecord.url} - ${validation.error}`);
      }
    }

    logger.info(`[url-format] Validated ${urls.length} URLs: ${valid.length} valid, ${invalid.length} invalid`);

    return {
      valid,
      invalid,
      stats: {
        total: urls.length,
        valid_count: valid.length,
        invalid_count: invalid.length
      }
    };
  },

  validateUrl(url, options) {
    const { allowed_protocols, max_url_length, require_tld } = options;

    // Check if URL is a string
    if (typeof url !== 'string' || url.trim() === '') {
      return { valid: false, error: 'URL is empty or not a string' };
    }

    // Check URL length
    if (url.length > max_url_length) {
      return { valid: false, error: `URL exceeds max length of ${max_url_length}` };
    }

    // Try to parse URL
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { valid: false, error: 'Invalid URL syntax' };
    }

    // Check protocol
    if (!allowed_protocols.includes(parsed.protocol)) {
      return { valid: false, error: `Protocol ${parsed.protocol} not allowed` };
    }

    // Check hostname exists
    if (!parsed.hostname) {
      return { valid: false, error: 'Missing hostname' };
    }

    // Check for TLD if required
    if (require_tld && !parsed.hostname.includes('.')) {
      return { valid: false, error: 'Hostname missing TLD' };
    }

    // Check for IP addresses (optionally block)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(parsed.hostname)) {
      // Allow IP addresses but log them
      // Could make this configurable to block
    }

    // Check for malformed characters
    const malformedChars = /[\x00-\x1f\x7f]/;
    if (malformedChars.test(url)) {
      return { valid: false, error: 'URL contains control characters' };
    }

    // Check for double slashes in path (except protocol)
    if (parsed.pathname.includes('//')) {
      return { valid: false, error: 'Path contains double slashes' };
    }

    return { valid: true };
  }
};
