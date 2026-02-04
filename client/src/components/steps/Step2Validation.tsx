import { StepContainer } from './StepContainer';
import { usePipelineStore } from '../../stores/pipelineStore';
import { usePanelStore } from '../../stores/panelStore';
import { useAppStore } from '../../stores/appStore';
import { useValidationStore } from '../../stores/validationStore';
import { useStepContext, extractUrlsFromContext } from '../../hooks/useStepContext';
import {
  CategoryCardGrid,
  StepSummary,
  StepApprovalFooter,
} from '../shared';
import type { Category, Submodule } from '../../types/step';

export function Step2Validation() {
  const { setStepCompleted, stepStates, selectedRunId } = usePipelineStore();
  const { openSubmodulePanel } = usePanelStore();
  const { showToast } = useAppStore();
  const { categories, toggleCategory } = useValidationStore();

  // Fetch Step 1 context to show input URL count
  const { data: step1Context, isLoading: isLoadingContext } = useStepContext(
    selectedRunId,
    1 // Step 1 index
  );

  const inputUrls = extractUrlsFromContext(step1Context);
  const isStepCompleted = stepStates[2] === 'completed';
  const isStep1Completed = stepStates[1] === 'completed';

  // Calculate totals
  const getApprovedCount = (cat: Category) =>
    cat.submodules.filter((s) => s.status === 'approved').length;

  const getTotalApprovedSubmodules = () =>
    Object.values(categories).reduce(
      (sum, cat) => sum + getApprovedCount(cat),
      0
    );

  const getTotalValidatedUrls = () =>
    Object.values(categories).reduce(
      (sum, cat) =>
        sum + cat.submodules.reduce((s, sub) => s + sub.result_count, 0),
      0
    );

  const getCategoryUrlCount = (cat: Category) =>
    cat.submodules.reduce((sum, sub) => sum + sub.result_count, 0);

  // Handle step approval
  const handleApproveStep = () => {
    if (getTotalApprovedSubmodules() > 0) {
      setStepCompleted(2);
      showToast('Step 2 completed!', 'success');
    }
  };

  // Open submodule panel
  const handleSubmoduleClick = (submodule: Submodule, _category: Category) => {
    openSubmodulePanel(submodule.id, 'validation');
  };

  // Determine step status
  const stepStatus = getTotalApprovedSubmodules() > 0 ? 'completed' : 'active';

  // Build category breakdown for summary
  const categoryBreakdown = Object.values(categories).map((cat) => ({
    label: cat.label,
    count: getCategoryUrlCount(cat),
  }));

  return (
    <StepContainer
      step={2}
      title="Validation"
      description="Filter unwanted URLs and remove duplicates"
      status={stepStatus}
      resultSummary={
        getTotalValidatedUrls() > 0
          ? `${getTotalValidatedUrls()} URLs validated`
          : undefined
      }
    >
      {/* Input Summary Banner */}
      <div className="bg-cyan-50 rounded-lg p-3 border border-cyan-200 mb-4">
        <p className="text-xs text-cyan-700 font-medium mb-1">
          Input from Step 1
        </p>
        {isLoadingContext ? (
          <p className="text-xs text-gray-500">Loading...</p>
        ) : isStep1Completed && inputUrls.length > 0 ? (
          <p className="text-xs text-gray-600">
            <span className="font-semibold text-cyan-800">{inputUrls.length}</span> URLs
            discovered, ready for validation
          </p>
        ) : (
          <p className="text-xs text-orange-600">
            Complete Step 1 first to have URLs for validation
          </p>
        )}
      </div>

      {/* Source Types Label */}
      <p className="text-xs text-gray-500 mb-3 font-medium">
        Validation Types (click to configure)
      </p>

      {/* Category Cards Grid */}
      <CategoryCardGrid
        categories={categories}
        onToggleCategory={toggleCategory}
        onSubmoduleClick={handleSubmoduleClick}
        getApprovedCount={getApprovedCount}
      />

      {/* Validation Summary */}
      <StepSummary
        totalApproved={getTotalApprovedSubmodules()}
        totalItems={getTotalValidatedUrls()}
        itemLabel="URLs"
        categoryBreakdown={categoryBreakdown}
        approvedLabel="filters applied"
      />

      {/* Step Approval Footer */}
      <StepApprovalFooter
        isCompleted={isStepCompleted}
        canApprove={getTotalApprovedSubmodules() > 0 && isStep1Completed}
        onApprove={handleApproveStep}
      />
    </StepContainer>
  );
}
