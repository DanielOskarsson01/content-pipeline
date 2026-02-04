export interface OptionConfig {
  name: string;
  label: string;
  type: 'select' | 'checkbox' | 'number' | 'text';
  options?: { value: string; label: string }[];
  defaultValue: string | number | boolean;
  description?: string;
}

interface SubmoduleOptionsProps {
  config: OptionConfig[];
  values: Record<string, string | number | boolean>;
  onChange: (name: string, value: string | number | boolean) => void;
}

/**
 * Dynamic form generator for submodule options
 *
 * Renders form fields based on OptionConfig array.
 * Used across all steps for consistent options UI.
 */
export function SubmoduleOptions({
  config,
  values,
  onChange,
}: SubmoduleOptionsProps) {
  if (config.length === 0) {
    return (
      <p className="text-xs text-gray-400 text-center py-2">
        No options available for this submodule
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {config.map((option) => {
        const value = values[option.name] ?? option.defaultValue;

        switch (option.type) {
          case 'select':
            return (
              <div key={option.name}>
                <label className="block text-xs text-gray-600 mb-1">
                  {option.label}
                </label>
                <select
                  value={String(value)}
                  onChange={(e) => onChange(option.name, e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[#0891B2]"
                >
                  {option.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {option.description && (
                  <p className="text-[10px] text-gray-400 mt-1">{option.description}</p>
                )}
              </div>
            );

          case 'checkbox':
            return (
              <label key={option.name} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => onChange(option.name, e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-[#0891B2] focus:ring-[#0891B2]"
                />
                <span className="text-gray-700">
                  {option.label}
                  {option.description && (
                    <span className="block text-[10px] text-gray-400 mt-0.5">
                      {option.description}
                    </span>
                  )}
                </span>
              </label>
            );

          case 'number':
            return (
              <div key={option.name}>
                <label className="block text-xs text-gray-600 mb-1">
                  {option.label}
                </label>
                <input
                  type="number"
                  value={Number(value)}
                  onChange={(e) => onChange(option.name, Number(e.target.value))}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[#0891B2]"
                />
                {option.description && (
                  <p className="text-[10px] text-gray-400 mt-1">{option.description}</p>
                )}
              </div>
            );

          case 'text':
          default:
            return (
              <div key={option.name}>
                <label className="block text-xs text-gray-600 mb-1">
                  {option.label}
                </label>
                <input
                  type="text"
                  value={String(value)}
                  onChange={(e) => onChange(option.name, e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[#0891B2]"
                />
                {option.description && (
                  <p className="text-[10px] text-gray-400 mt-1">{option.description}</p>
                )}
              </div>
            );
        }
      })}
    </div>
  );
}

// ============================================
// Pre-built option configs for Step 1 and Step 2
// ============================================

/** Step 1 Sitemap discovery options */
export const SITEMAP_OPTIONS: OptionConfig[] = [
  {
    name: 'sitemap_location',
    label: 'Sitemap location',
    type: 'select',
    options: [
      { value: 'auto', label: 'Auto-detect' },
      { value: 'custom', label: 'Custom URL' },
    ],
    defaultValue: 'auto',
  },
  {
    name: 'include_nested',
    label: 'Include nested sitemaps',
    type: 'checkbox',
    defaultValue: true,
    description: 'Follow sitemap index files to discover all sitemaps',
  },
];

/** Step 2 Path Filter options */
export const PATH_FILTER_OPTIONS: OptionConfig[] = [
  {
    name: 'exclude_patterns',
    label: 'Exclude paths containing',
    type: 'text',
    defaultValue: '/login, /logout, /cart, /checkout, /api/, /cdn-cgi/',
    description: 'Comma-separated path patterns to exclude',
  },
  {
    name: 'include_only',
    label: 'Include only paths containing (optional)',
    type: 'text',
    defaultValue: '',
    description: 'If set, only URLs with these patterns are kept',
  },
  {
    name: 'max_depth',
    label: 'Max URL depth',
    type: 'number',
    defaultValue: 5,
    description: 'Maximum path segments (e.g., /a/b/c = 3)',
  },
];

/** Step 2 Content Type Filter options */
export const CONTENT_TYPE_OPTIONS: OptionConfig[] = [
  {
    name: 'exclude_extensions',
    label: 'Exclude file extensions',
    type: 'text',
    defaultValue: '.pdf, .jpg, .png, .gif, .css, .js, .xml',
    description: 'Comma-separated extensions to filter out',
  },
  {
    name: 'html_only',
    label: 'HTML pages only',
    type: 'checkbox',
    defaultValue: false,
    description: 'Only keep URLs that return text/html',
  },
];

/** Step 2 Deduplication options */
export const DEDUP_OPTIONS: OptionConfig[] = [
  {
    name: 'normalize_urls',
    label: 'Normalize URLs before comparison',
    type: 'checkbox',
    defaultValue: true,
    description: 'Remove trailing slashes, sort query params, lowercase',
  },
  {
    name: 'ignore_query_params',
    label: 'Ignore query parameters',
    type: 'checkbox',
    defaultValue: false,
    description: 'Treat ?foo=bar and ?foo=baz as same URL',
  },
  {
    name: 'ignore_fragments',
    label: 'Ignore fragments (#)',
    type: 'checkbox',
    defaultValue: true,
    description: 'Treat #section1 and #section2 as same URL',
  },
];
