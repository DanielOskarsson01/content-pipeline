# Submodule Development Guide

This guide explains how to create new submodules for the content pipeline. The architecture is designed so that **adding a new submodule requires no frontend changes** - just create a backend file and restart the server.

## Quick Start

1. Create a file in `modules/submodules/discovery/` or `modules/submodules/validation/`
2. Export an object with the required fields (see template below)
3. Restart the backend
4. Your submodule appears in the UI automatically

## Submodule Template

```javascript
module.exports = {
  // Required fields
  id: 'my-submodule',           // Unique identifier (matches filename)
  name: 'My Submodule',         // Display name in UI
  type: 'discovery',            // 'discovery' or 'validation'
  category: 'website',          // Category key (see below)
  description: 'What this does',// Short description for UI
  cost: 'cheap',                // 'cheap', 'medium', or 'expensive'

  // Optional fields
  version: '1.0.0',
  requiresExternalApi: false,   // true if needs API keys

  // Configuration options shown in UI
  options: [
    {
      name: 'max_results',
      type: 'number',
      default: 100,
      description: 'Maximum results to return'
    },
    {
      name: 'include_subdomains',
      type: 'boolean',
      values: [true, false],
      default: true,
      description: 'Include subdomain URLs'
    },
    {
      name: 'filter_type',
      type: 'select',
      values: ['strict', 'loose', 'custom'],
      default: 'strict',
      description: 'Filtering strictness'
    }
  ],

  // Main execution function
  async execute(input, config, context) {
    const { logger } = context;
    // Your logic here
    return results;
  }
};
```

## Available Categories

Categories are defined in `config/categories.js`. Each category belongs to a step:

### Step 1: Discovery
| Category | Description |
|----------|-------------|
| `website` | Find URLs from company websites (sitemap, navigation, etc.) |
| `search` | General web search (Google, Bing - typically fallback/expensive) |

### Step 2: Validation
| Category | Description |
|----------|-------------|
| `filtering` | Remove unwanted URLs (path patterns, file types, etc.) |
| `dedup` | Remove duplicate URLs (exact match, language variants, etc.) |

## Adding a New Category

1. Add the category to `config/categories.js`:

```javascript
module.exports = {
  // ... existing categories

  'my-category': {
    label: 'My Category',
    icon: '🔧',
    description: 'Description for UI',
    step: 1,  // 1 = Discovery, 2 = Validation
    order: 3, // Display order within the step
  },
};
```

2. Use the category key in your submodule's `category` field

## Option Types

| Type | Description | Example |
|------|-------------|---------|
| `boolean` | Toggle on/off | `{ type: 'boolean', values: [true, false], default: true }` |
| `number` | Numeric input | `{ type: 'number', default: 100 }` |
| `select` | Dropdown selection | `{ type: 'select', values: ['a', 'b', 'c'], default: 'a' }` |
| `array` | List of values | `{ type: 'array', default: ['en', 'de'] }` |

## Cost Levels

- **cheap**: Fast, no API calls, runs in parallel first
- **medium**: Some API calls or heavier processing
- **expensive**: Paid APIs, rate-limited, runs as fallback

## Architecture Overview

```
Backend owns:
├── modules/submodules/         # Submodule implementations
│   ├── discovery/              # Step 1 submodules
│   └── validation/             # Step 2 submodules
├── config/categories.js        # Category definitions
└── routes/submodules.js        # GET /api/submodules endpoint

Frontend owns:
├── hooks/useSubmodules.ts      # Fetches metadata from server
├── stores/discoveryStore.ts    # UI state only (expanded, status)
└── components/steps/           # Renders what server sends
```

## Testing Your Submodule

1. Start the dev server: `npm run dev`
2. Check the API: `curl http://localhost:3000/api/submodules | jq`
3. Verify your submodule appears under the correct category
4. Open the UI and confirm it renders correctly

## Example: Adding a News RSS Submodule

```javascript
// modules/submodules/discovery/rss-feeds.js
module.exports = {
  id: 'rss-feeds',
  name: 'RSS Feeds',
  type: 'discovery',
  category: 'website',  // or create 'news' category
  description: 'Parse RSS/Atom feeds for content URLs',
  cost: 'cheap',
  requiresExternalApi: false,

  options: [
    {
      name: 'max_items',
      type: 'number',
      default: 50,
      description: 'Maximum feed items to process'
    },
    {
      name: 'include_enclosures',
      type: 'boolean',
      values: [true, false],
      default: false,
      description: 'Include media enclosure URLs'
    }
  ],

  async execute(entities, config, context) {
    const { logger } = context;
    const results = [];

    for (const entity of entities) {
      // Your RSS parsing logic
      logger.info(`[rss-feeds] Processing ${entity.name}`);
    }

    return results;
  }
};
```

After creating this file and restarting the server, "RSS Feeds" will automatically appear in the UI under the Website category.
