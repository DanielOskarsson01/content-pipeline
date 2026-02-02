import { StepContainer } from './StepContainer';
import { usePipelineStore } from '../../stores/pipelineStore';
import { usePanelStore } from '../../stores/panelStore';
import { useAppStore } from '../../stores/appStore';
import { useDiscoveryStore } from '../../stores/discoveryStore';
import {
  CategoryCardGrid,
  StepSummary,
  StepApprovalFooter,
} from '../shared';
import type { Category, Submodule } from '../../types/step';

export function Step1Discovery() {
  const { setStepCompleted, stepStates } = usePipelineStore();
  const { openSubmodulePanel } = usePanelStore();
  const { showToast } = useAppStore();
  const { categories, toggleCategory } = useDiscoveryStore();

  const isStepCompleted = stepStates[1] === 'completed';

  // Calculate totals
  const getApprovedCount = (cat: Category) =>
    cat.submodules.filter((s) => s.status === 'approved').length;

  const getTotalApprovedSubmodules = () =>
    Object.values(categories).reduce(
      (sum, cat) => sum + getApprovedCount(cat),
      0
    );

  const getTotalDiscoveredUrls = () =>
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
      setStepCompleted(1);
      showToast('Step 1 completed!', 'success');
    }
  };

  // Open submodule panel
  const handleSubmoduleClick = (submodule: Submodule, _category: Category) => {
    openSubmodulePanel(submodule.id, 'discovery');
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
      step={1}
      title="Discovery"
      description="Find URLs via sitemap, navigation, search, and external sources"
      status={stepStatus}
      resultSummary={
        getTotalDiscoveredUrls() > 0
          ? `${getTotalDiscoveredUrls()} URLs found`
          : undefined
      }
    >
      {/* Info Banner */}
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 mb-4">
        <p className="text-xs text-pink-600 font-medium mb-1">
          Multi-Source Discovery
        </p>
        <p className="text-xs text-gray-600">
          Enable source types and configure submodules for each. Cheap sources
          run first in parallel; expensive sources run as fallback if needed.
        </p>
      </div>

      {/* Source Types Label */}
      <p className="text-xs text-gray-500 mb-3 font-medium">
        Source Types (click to configure)
      </p>

      {/* Category Cards Grid */}
      <CategoryCardGrid
        categories={categories}
        onToggleCategory={toggleCategory}
        onSubmoduleClick={handleSubmoduleClick}
        getApprovedCount={getApprovedCount}
      />

      {/* Discovery Summary */}
      <StepSummary
        totalApproved={getTotalApprovedSubmodules()}
        totalItems={getTotalDiscoveredUrls()}
        itemLabel="URLs"
        categoryBreakdown={categoryBreakdown}
        approvedLabel="submodules approved"
      />

      {/* Step Approval Footer */}
      <StepApprovalFooter
        isCompleted={isStepCompleted}
        canApprove={getTotalApprovedSubmodules() > 0}
        onApprove={handleApproveStep}
      />
    </StepContainer>
  );
}
