import { useMemo } from 'react';
import { StepContainer } from './StepContainer';
import { usePanelStore } from '../../stores/panelStore';
import { useAppStore } from '../../stores/appStore';
import { useValidationStore } from '../../stores/validationStore';
import { useStepCategories } from '../../hooks/useSubmodules';
import { useUrlParams } from '../../hooks/useUrlParams';
import { useStepContext, extractUrlsFromContext } from '../../hooks/useStepContext';
import {
  CategoryCardGrid,
  StepSummary,
  StepApprovalFooter,
} from '../shared';
import type { Categories, Category, Submodule } from '../../types/step';

export function Step2Validation() {
  const { openSubmodulePanel } = usePanelStore();
  const { showToast } = useAppStore();
  const { runId } = useUrlParams();

  // Server data (category + submodule definitions)
  const { categories: serverCategories, isLoading, error } = useStepCategories(2);

  // UI state (expanded, status, result_count)
  const { expanded, status, result_count, toggleCategory } = useValidationStore();

  // Fetch Step 1 context to show input URL count
  const { data: step1Context, isLoading: isLoadingContext } = useStepContext(
    runId,
    1 // Step 1 index
  );

  const inputUrls = extractUrlsFromContext(step1Context);

  // Merge server data with UI state
  const categories: Categories = useMemo(() => {
    if (!serverCategories) return {};

    const merged: Categories = {};

    // Sort by order and build merged structure
    const sortedEntries = Object.entries(serverCategories)
      .sort(([, a], [, b]) => a.order - b.order);

    for (const [key, serverCat] of sortedEntries) {
      merged[key] = {
        label: serverCat.label,
        icon: serverCat.icon,
        description: serverCat.description,
        enabled: true, // All enabled by default
        expanded: expanded[key] ?? false,
        submodules: serverCat.submodules.map((serverSub) => ({
          id: serverSub.id,
          name: serverSub.name,
          description: serverSub.description,
          cost: serverSub.cost,
          status: status[serverSub.id] ?? 'pending',
          result_count: result_count[serverSub.id] ?? 0,
        })),
      };
    }

    return merged;
  }, [serverCategories, expanded, status, result_count]);

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

  // Derive completion state from approved submodules
  const isStepCompleted = getTotalApprovedSubmodules() > 0;
  // Step 1 is "complete" if we have input URLs
  const isStep1Completed = inputUrls.length > 0;

  // Handle step approval (just show toast - state is derived)
  const handleApproveStep = () => {
    if (getTotalApprovedSubmodules() > 0) {
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

  // Loading state
  if (isLoading) {
    return (
      <StepContainer step={2} title="Validation" description="Loading..." status="active">
        <div className="p-4 text-gray-500 text-sm">Loading submodules...</div>
      </StepContainer>
    );
  }

  // Error state
  if (error) {
    return (
      <StepContainer step={2} title="Validation" description="Error" status="active">
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
          Failed to load submodules. Please refresh the page.
        </div>
      </StepContainer>
    );
  }

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
