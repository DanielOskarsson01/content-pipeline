import { useMemo } from 'react';
import { StepContainer } from './StepContainer';
import { usePanelStore } from '../../stores/panelStore';
import { useAppStore } from '../../stores/appStore';
import { useDiscoveryStore } from '../../stores/discoveryStore';
import { useStepCategories } from '../../hooks/useSubmodules';
import {
  CategoryCardGrid,
  StepSummary,
  StepApprovalFooter,
} from '../shared';
import type { Categories, Category, Submodule } from '../../types/step';

export function Step1Discovery() {
  const { openSubmodulePanel } = usePanelStore();
  const { showToast } = useAppStore();

  // Server data (category + submodule definitions)
  const { categories: serverCategories, isLoading, error } = useStepCategories(1);

  // UI state (expanded, status, result_count)
  const { expanded, status, result_count, toggleCategory } = useDiscoveryStore();

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

  const getTotalDiscoveredUrls = () =>
    Object.values(categories).reduce(
      (sum, cat) =>
        sum + cat.submodules.reduce((s, sub) => s + sub.result_count, 0),
      0
    );

  const getCategoryUrlCount = (cat: Category) =>
    cat.submodules.reduce((sum, sub) => sum + sub.result_count, 0);

  // Derive completion state from approved submodules
  const isStepCompleted = getTotalApprovedSubmodules() > 0;

  // Handle step approval (just show toast - state is derived)
  const handleApproveStep = () => {
    if (getTotalApprovedSubmodules() > 0) {
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

  // Loading state
  if (isLoading) {
    return (
      <StepContainer step={1} title="Discovery" description="Loading..." status="active">
        <div className="p-4 text-gray-500 text-sm">Loading submodules...</div>
      </StepContainer>
    );
  }

  // Error state
  if (error) {
    return (
      <StepContainer step={1} title="Discovery" description="Error" status="active">
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
          Failed to load submodules. Please refresh the page.
        </div>
      </StepContainer>
    );
  }

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
