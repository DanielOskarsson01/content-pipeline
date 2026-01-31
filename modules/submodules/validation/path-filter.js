/**
 * Path Filter Submodule
 *
 * Filters out URLs with unwanted paths:
 * - Login/logout pages
 * - Terms of service, privacy policy
 * - Cart, checkout pages
 * - Admin, dashboard pages
 * - File downloads (PDF, images, etc.)
 * - Pagination parameters
 * - Listing/index pages (blog, category, tag, archive) - contain teasers not content
 * - Social media links
 *
 * Uses configurable include/exclude patterns.
 */

module.exports = {
  name: 'path-filter',
  type: 'validation',
  version: '1.0.0',
  description: 'Filter out unwanted URL paths (login, terms, etc.)',
  cost: 'cheap',
  requiresExternalApi: false,

  // Default patterns to exclude
  defaultExcludePatterns: [
    // Auth pages
    /\/login\b/i,
    /\/logout\b/i,
    /\/signin\b/i,
    /\/signout\b/i,
    /\/sign-in\b/i,
    /\/sign-out\b/i,
    /\/register\b/i,
    /\/signup\b/i,
    /\/sign-up\b/i,
    /\/forgot-password/i,
    /\/reset-password/i,
    /\/auth\//i,

    // Legal pages (usually not useful for content)
    /\/terms/i,
    /\/privacy/i,
    /\/cookie/i,
    /\/gdpr/i,
    /\/legal/i,
    /\/disclaimer/i,

    // E-commerce
    /\/cart\b/i,
    /\/checkout\b/i,
    /\/basket\b/i,
    /\/wishlist\b/i,
    /\/order/i,

    // Admin/internal
    /\/admin\b/i,
    /\/dashboard\b/i,
    /\/wp-admin/i,
    /\/wp-login/i,
    /\/wp-content\/uploads/i,
    /\/cgi-bin/i,

    // Files (usually not scrapeable)
    /\.pdf$/i,
    /\.doc$/i,
    /\.docx$/i,
    /\.xls$/i,
    /\.xlsx$/i,
    /\.ppt$/i,
    /\.pptx$/i,
    /\.zip$/i,
    /\.rar$/i,
    /\.exe$/i,
    /\.dmg$/i,
    /\.jpg$/i,
    /\.jpeg$/i,
    /\.png$/i,
    /\.gif$/i,
    /\.svg$/i,
    /\.webp$/i,
    /\.mp3$/i,
    /\.mp4$/i,
    /\.wav$/i,
    /\.avi$/i,

    // Pagination (duplicative content)
    /[?&]page=\d+/i,
    /\/page\/\d+\/?$/i,

    // Search results (duplicative)
    /[?&]s=/i,
    /[?&]q=/i,
    /[?&]search=/i,
    /\/search\?/i,

    // Calendar/date archives
    /\/\d{4}\/\d{2}\/\d{2}\/?$/,  // /2024/01/15/
    /\/\d{4}\/\d{2}\/?$/,         // /2024/01/

    // Listing/index pages (contain teasers, not actual content)
    /\/blog\/?$/i,                 // /blog/ without article
    /\/news\/?$/i,                 // /news/ index
    /\/articles\/?$/i,             // /articles/ listing
    /\/posts\/?$/i,                // /posts/ listing
    /\/category\/[^/]+\/?$/i,      // /category/gaming/
    /\/tag\/[^/]+\/?$/i,           // /tag/slots/
    /\/tags\/[^/]+\/?$/i,          // /tags/casino/
    /\/archive\/?/i,               // /archive/ pages
    /\/author\/[^/]+\/?$/i,        // /author/john/ (listing)
    /\/topics?\/?$/i,              // /topic/ or /topics/
    /\/all-posts/i,                // /all-posts
    /\/latest\/?$/i,               // /latest/

    // WordPress-specific listing pages
    /\/wp\/\d{4}\//i,              // /wp/2024/ date archives
    /\/page\/\d+/i,                // /page/2 (pagination anywhere)

    // Social/external
    /facebook\.com/i,
    /twitter\.com/i,
    /linkedin\.com/i,
    /instagram\.com/i,
    /youtube\.com/i,
    /t\.co\//i,

    // Feeds
    /\/feed\/?$/i,
    /\/rss\/?$/i,
    /\.xml$/i,
    /\.rss$/i
  ],

  async execute(urls, config, context) {
    const { logger } = context;
    const {
      exclude_patterns = [],          // Additional patterns to exclude
      include_patterns = [],          // Override: if URL matches, keep it
      use_default_excludes = true,    // Whether to use defaultExcludePatterns
      same_domain_only = true         // Filter URLs not on entity's domain
    } = config;

    const valid = [];
    const invalid = [];

    // Build pattern lists
    const excludeList = use_default_excludes
      ? [...this.defaultExcludePatterns, ...exclude_patterns.map(p => new RegExp(p, 'i'))]
      : exclude_patterns.map(p => new RegExp(p, 'i'));

    const includeList = include_patterns.map(p => new RegExp(p, 'i'));

    for (const urlRecord of urls) {
      const filterResult = this.filterUrl(urlRecord, {
        excludeList,
        includeList,
        same_domain_only,
        entityDomain: this.extractDomain(urlRecord.entity_website || urlRecord.metadata?.website)
      });

      if (filterResult.keep) {
        valid.push(urlRecord);
      } else {
        invalid.push({
          ...urlRecord,
          reason: 'filtered_path',
          details: filterResult.reason
        });
        logger.info(`[path-filter] Filtered: ${urlRecord.url} - ${filterResult.reason}`);
      }
    }

    logger.info(`[path-filter] Processed ${urls.length} URLs: ${valid.length} kept, ${invalid.length} filtered`);

    return {
      valid,
      invalid,
      stats: {
        total: urls.length,
        valid_count: valid.length,
        invalid_count: invalid.length,
        filtered_count: invalid.length
      }
    };
  },

  filterUrl(urlRecord, options) {
    const { excludeList, includeList, same_domain_only, entityDomain } = options;
    const url = urlRecord.url;

    // Check include patterns first (override excludes)
    for (const pattern of includeList) {
      if (pattern.test(url)) {
        return { keep: true };
      }
    }

    // Check same domain
    if (same_domain_only && entityDomain) {
      const urlDomain = this.extractDomain(url);
      if (urlDomain && !this.isSameDomain(urlDomain, entityDomain)) {
        return { keep: false, reason: `Different domain: ${urlDomain} vs ${entityDomain}` };
      }
    }

    // Check exclude patterns
    for (const pattern of excludeList) {
      if (pattern.test(url)) {
        return { keep: false, reason: `Matched exclude pattern: ${pattern.toString()}` };
      }
    }

    return { keep: true };
  },

  extractDomain(url) {
    if (!url) return null;
    try {
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      return new URL(fullUrl).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return null;
    }
  },

  isSameDomain(domain1, domain2) {
    // Normalize both domains
    const d1 = domain1.toLowerCase().replace(/^www\./, '');
    const d2 = domain2.toLowerCase().replace(/^www\./, '');

    // Exact match or subdomain match
    return d1 === d2 || d1.endsWith(`.${d2}`) || d2.endsWith(`.${d1}`);
  }
};
