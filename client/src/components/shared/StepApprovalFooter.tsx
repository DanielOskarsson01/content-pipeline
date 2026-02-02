interface StepApprovalFooterProps {
  isCompleted: boolean;
  canApprove: boolean;
  onApprove: () => void;
  approveLabel?: string;
  completedLabel?: string;
}

export function StepApprovalFooter({
  isCompleted,
  canApprove,
  onApprove,
  approveLabel = 'Approve Step',
  completedLabel = 'Step Completed',
}: StepApprovalFooterProps) {
  if (isCompleted) {
    return (
      <div className="mt-4 flex justify-end">
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-green-100 text-green-700 text-xs font-medium">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          {completedLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 flex justify-end">
      <button
        onClick={onApprove}
        disabled={!canApprove}
        className={`px-4 py-1.5 rounded text-xs font-medium shadow-sm ${
          canApprove
            ? 'bg-[#0891B2] hover:bg-[#0891B2]/90 text-white'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        {approveLabel}
      </button>
    </div>
  );
}
