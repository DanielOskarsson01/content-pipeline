export interface UrlTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  parseMode?: 'urls-only' | 'name-url-pairs';
  rows?: number;
  label?: string;
}

export interface ParsedUrlEntry {
  name: string;
  url: string;
}

/**
 * Parse textarea content based on mode
 *
 * 'urls-only': One URL per line
 *   https://betsson.com
 *   https://evolution.com
 *   example.com           <- auto-prefixes https://
 *
 * 'name-url-pairs': Tab-separated name and URL per line
 *   Betsson	https://betsson.com
 *   Evolution Gaming	https://evolution.com
 *   Falls back to comma if no tab found:
 *   Betsson, https://betsson.com
 */
export function parseUrls(value: string, mode: 'urls-only' | 'name-url-pairs' = 'urls-only'): ParsedUrlEntry[] {
  const lines = value.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  return lines.map((line, idx) => {
    if (mode === 'name-url-pairs') {
      // Try tab first, then comma
      let parts = line.includes('\t') ? line.split('\t') : line.split(',');
      parts = parts.map((p) => p.trim());

      if (parts.length >= 2) {
        const name = parts[0];
        const url = normalizeUrl(parts[1]);
        return { name, url };
      }
    }

    // URLs only mode or fallback
    const url = normalizeUrl(line);
    const name = extractNameFromUrl(url) || `Entity ${idx + 1}`;
    return { name, url };
  });
}

function normalizeUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

function extractNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return '';
  }
}

export function UrlTextarea({
  value,
  onChange,
  placeholder = 'https://betsson.com\nhttps://evolution.com',
  parseMode = 'urls-only',
  rows = 4,
  label = 'Paste URLs (one per line)',
}: UrlTextareaProps) {
  const lineCount = value.split('\n').filter((l) => l.trim()).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs text-gray-600">{label}</label>
        {lineCount > 0 && (
          <span className="text-[10px] text-gray-400">{lineCount} {lineCount === 1 ? 'URL' : 'URLs'}</span>
        )}
      </div>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm font-mono focus:outline-none focus:border-[#0891B2]"
      />
      {parseMode === 'name-url-pairs' && (
        <p className="text-[10px] text-gray-400 mt-1">
          Format: Name, URL (tab or comma separated)
        </p>
      )}
    </div>
  );
}
