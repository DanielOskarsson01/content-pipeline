import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface ResultItem {
  id: string;
  url: string;
  entity_name?: string;
  reason?: string;
}

interface ResultsListProps {
  results: ResultItem[];
  isLoading: boolean;
  emptyMessage?: string;
  showEntityName?: boolean;
  showReason?: boolean;
  maxHeight?: number; // pixels, default 256 (h-64) - ignored if fullHeight is true
  fullHeight?: boolean; // Use all available space in parent container
  onDownloadCsv?: () => void;
  onReject?: () => void;
}

/**
 * Virtual-scrolling results list for displaying large URL sets
 *
 * Uses @tanstack/react-virtual to handle 10,000+ items without freezing.
 * DO NOT replace with naive slice() - it causes jank with large datasets.
 */
export function ResultsList({
  results,
  isLoading,
  emptyMessage = 'No results yet',
  showEntityName = false,
  showReason = false,
  maxHeight = 256,
  fullHeight = false,
  onDownloadCsv,
  onReject,
}: ResultsListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28, // row height in pixels
    overscan: 10, // render 10 extra items above/below viewport
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="text-center py-4">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#E11D73] mb-2" />
        <p className="text-xs text-gray-500">Processing...</p>
      </div>
    );
  }

  // Empty state
  if (results.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  // Handle CSV download
  const handleDownload = () => {
    if (onDownloadCsv) {
      onDownloadCsv();
      return;
    }

    // Default CSV download implementation
    const headers = ['url'];
    if (showEntityName) headers.push('entity_name');
    if (showReason) headers.push('reason');

    const rows = results.map((r) => {
      const row = [r.url];
      if (showEntityName) row.push(r.entity_name || '');
      if (showReason) row.push(r.reason || '');
      return row.map((val) => `"${val.replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `results-${results.length}-urls.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${fullHeight ? 'h-full flex flex-col' : 'space-y-3'}`}>
      {/* Header with count and download */}
      <div className={`flex items-center justify-between ${fullHeight ? 'flex-shrink-0 mb-2' : ''}`}>
        <p className="text-xs text-gray-600 font-medium uppercase">
          {results.length} URLs
        </p>
        <button
          onClick={handleDownload}
          className="text-xs text-[#E11D73] hover:text-[#E11D73]/80 flex items-center gap-1"
        >
          <span>⬇</span> Download CSV
        </button>
      </div>

      {/* Virtual scrolling list */}
      <div
        ref={parentRef}
        className={`overflow-auto border border-gray-200 rounded ${fullHeight ? 'flex-1 min-h-0' : ''}`}
        style={fullHeight ? undefined : { height: maxHeight }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const result = results[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="px-2 flex items-center hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {showEntityName && result.entity_name && (
                    <span className="text-[10px] text-gray-400 flex-shrink-0 w-24 truncate">
                      {result.entity_name}
                    </span>
                  )}
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate flex-1"
                    title={result.url}
                  >
                    {result.url}
                  </a>
                  {showReason && result.reason && (
                    <span className="text-[10px] text-orange-500 flex-shrink-0">
                      {result.reason}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reject button (optional) */}
      {onReject && (
        <button
          onClick={onReject}
          className={`w-full bg-[#E11D73] hover:bg-[#E11D73]/90 text-white py-2 rounded text-sm font-medium ${fullHeight ? 'flex-shrink-0 mt-2' : ''}`}
        >
          Reject and try with new settings or uploads
        </button>
      )}
    </div>
  );
}
