interface StepSummaryProps {
  totalApproved: number;
  totalItems: number;
  itemLabel: string; // "URLs", "documents", etc.
  categoryBreakdown: Array<{ label: string; count: number }>;
  approvedLabel?: string; // "submodules approved", "filters applied", etc.
}

export function StepSummary({
  totalApproved,
  totalItems,
  itemLabel,
  categoryBreakdown,
  approvedLabel = 'submodules approved',
}: StepSummaryProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-600 font-medium uppercase">Summary</p>
        <span className="text-xs text-gray-500">
          {totalApproved} {approvedLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-gray-700">
          <span className="font-semibold text-lg">{totalItems}</span> total{' '}
          {itemLabel}
        </span>
        {categoryBreakdown.map(
          ({ label, count }) =>
            count > 0 && (
              <span key={label} className="text-green-600">
                {label}: {count}
              </span>
            )
        )}
      </div>
    </div>
  );
}
