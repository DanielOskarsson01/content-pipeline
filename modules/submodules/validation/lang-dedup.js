/**
 * Language Deduplication Submodule
 *
 * Removes duplicate URLs that are translations of the same content.
 * Keeps one canonical URL per content piece based on language preference.
 *
 * Logic:
 * - Group URLs by slug (path without language code)
 * - If same slug exists in multiple languages → keep preferred language
 * - If slug exists in only one language → keep it (regional exclusive)
 *
 * Example:
 *   /en/news/article-slug/  → KEEP (canonical)
 *   /de/news/article-slug/  → FILTER (translation)
 *   /de/news/german-only/   → KEEP (regional exclusive)
 */

// Default language preference order
const DEFAULT_LANGUAGE_PREFERENCE = [
  'en', 'de', 'sv', 'es', 'pt', 'fr', 'it', 'nl', 'pl', 'ja', 'ko', 'zh', 'ru'
];

// Common language code patterns in URLs
const LANG_PATTERNS = [
  // Path prefix: /en/, /de/, /en-us/, /pt-br/
  /^\/([a-z]{2}(?:-[a-z]{2})?)\//i,
  // Subdomain would be handled separately (en.domain.com)
];

module.exports = {
  id: 'lang-dedup',
  name: 'Language Dedup',
  type: 'validation',
  category: 'dedup',
  version: '1.0.0',
  description: 'Remove duplicate language variants, keep preferred language',
  cost: 'cheap',
  requiresExternalApi: false,

  options: [
    {
      name: 'language_preference',
      type: 'array',
      default: DEFAULT_LANGUAGE_PREFERENCE,
      description: 'Ordered list of preferred languages (first = highest priority)'
    },
    {
      name: 'fallback',
      type: 'select',
      values: ['first_found', 'alphabetical'],
      default: 'first_found',
      description: 'How to select canonical if no preferred language found'
    }
  ],

  async execute(urls, config, context) {
    const { logger } = context;
    const languagePreference = config.language_preference || DEFAULT_LANGUAGE_PREFERENCE;
    const fallback = config.fallback || 'first_found';

    const valid = [];
    const invalid = [];

    // Group URLs by entity, then by slug
    // Map: entity_id -> Map<slug, URL[]>
    const entityGroups = new Map();

    for (const urlRecord of urls) {
      const entityId = urlRecord.run_entity_id;
      const { language, slug } = this.extractLanguageAndSlug(urlRecord.url);

      if (!entityGroups.has(entityId)) {
        entityGroups.set(entityId, new Map());
      }

      const slugGroups = entityGroups.get(entityId);
      if (!slugGroups.has(slug)) {
        slugGroups.set(slug, []);
      }

      slugGroups.get(slug).push({
        ...urlRecord,
        _extracted_language: language,
        _extracted_slug: slug
      });
    }

    // Process each entity's slug groups
    for (const [entityId, slugGroups] of entityGroups) {
      for (const [slug, urlGroup] of slugGroups) {
        if (urlGroup.length === 1) {
          // Only one URL for this slug - keep it (could be regional exclusive or just single language)
          valid.push(urlGroup[0]);
        } else {
          // Multiple languages for same slug - select canonical
          const canonical = this.selectCanonical(urlGroup, languagePreference, fallback);

          for (const urlRecord of urlGroup) {
            if (urlRecord === canonical) {
              valid.push(urlRecord);
            } else {
              invalid.push({
                ...urlRecord,
                reason: 'language_duplicate',
                details: `Translation of ${canonical.url} (${canonical._extracted_language || 'unknown'})`
              });
            }
          }

          if (urlGroup.length > 1) {
            logger.info(`[lang-dedup] Slug "${slug}": kept ${canonical._extracted_language || 'unknown'}, filtered ${urlGroup.length - 1} translations`);
          }
        }
      }
    }

    const stats = {
      total: urls.length,
      valid_count: valid.length,
      invalid_count: invalid.length,
      groups_processed: Array.from(entityGroups.values()).reduce((sum, m) => sum + m.size, 0),
      translations_filtered: invalid.length
    };

    logger.info(`[lang-dedup] Processed ${urls.length} URLs: ${valid.length} kept, ${invalid.length} filtered as translations`);

    return { valid, invalid, stats };
  },

  /**
   * Extract language code and normalized slug from URL
   */
  extractLanguageAndSlug(url) {
    try {
      const parsed = new URL(url);
      let pathname = parsed.pathname;

      // Try to extract language from path
      for (const pattern of LANG_PATTERNS) {
        const match = pathname.match(pattern);
        if (match) {
          const language = match[1].toLowerCase().split('-')[0]; // Normalize en-us → en
          const slug = pathname.replace(pattern, '/'); // Remove language prefix
          return { language, slug: this.normalizeSlug(slug) };
        }
      }

      // No language code found in path
      return { language: null, slug: this.normalizeSlug(pathname) };
    } catch {
      return { language: null, slug: url };
    }
  },

  /**
   * Normalize slug for comparison
   */
  normalizeSlug(slug) {
    return slug
      .toLowerCase()
      .replace(/\/+$/, '')  // Remove trailing slashes
      .replace(/^\/+/, '/'); // Ensure single leading slash
  },

  /**
   * Select canonical URL from a group of language variants
   */
  selectCanonical(urlGroup, languagePreference, fallback) {
    // Try each preferred language in order
    for (const lang of languagePreference) {
      const match = urlGroup.find(u => u._extracted_language === lang);
      if (match) return match;
    }

    // No preferred language found - use fallback
    if (fallback === 'alphabetical') {
      // Sort by language code alphabetically
      const sorted = [...urlGroup].sort((a, b) => {
        const langA = a._extracted_language || 'zzz';
        const langB = b._extracted_language || 'zzz';
        return langA.localeCompare(langB);
      });
      return sorted[0];
    }

    // Default: first found
    return urlGroup[0];
  }
};
