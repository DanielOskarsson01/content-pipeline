/**
 * Category Configuration
 *
 * Backend source of truth for category display properties.
 * Submodule files declare their `category` field (e.g., 'website').
 * This config provides UI metadata (label, icon, description).
 *
 * Adding a new category:
 * 1. Add entry here with label, icon, description, step, order
 * 2. Create submodule files with that category
 * 3. Restart backend - new category appears in UI
 */

module.exports = {
  // ===========================================
  // Step 1: Discovery Categories
  // ===========================================
  website: {
    label: 'Website',
    icon: '🌐',
    description: 'Find URLs from company websites',
    step: 1,
    order: 1,
  },
  search: {
    label: 'Search',
    icon: '🔍',
    description: 'General web search (fallback)',
    step: 1,
    order: 2,
  },

  // ===========================================
  // Step 2: Validation Categories
  // ===========================================
  filtering: {
    label: 'Filtering',
    icon: '🔍',
    description: 'Remove unwanted URLs',
    step: 2,
    order: 1,
  },
  dedup: {
    label: 'Deduplication',
    icon: '🔄',
    description: 'Remove duplicate URLs',
    step: 2,
    order: 2,
  },

  // ===========================================
  // Planned Categories (Step 1 expansion)
  // ===========================================
  // Uncomment when submodules are created:
  //
  // news: {
  //   label: 'News',
  //   icon: '📰',
  //   description: 'Find news and press releases',
  //   step: 1,
  //   order: 3,
  // },
  // linkedin: {
  //   label: 'LinkedIn',
  //   icon: '💼',
  //   description: 'Company profiles and posts',
  //   step: 1,
  //   order: 4,
  // },
  // youtube: {
  //   label: 'YouTube',
  //   icon: '🎬',
  //   description: 'Videos and channel content',
  //   step: 1,
  //   order: 5,
  // },
  // twitter: {
  //   label: 'Twitter/X',
  //   icon: '🐦',
  //   description: 'Profile and tweets',
  //   step: 1,
  //   order: 6,
  // },
};
