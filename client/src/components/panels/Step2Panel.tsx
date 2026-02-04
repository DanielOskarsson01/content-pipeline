import { usePanelStore } from '../../stores/panelStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useAppStore } from '../../stores/appStore';
import { useValidationStore, getSubmoduleById } from '../../stores/validationStore';
import { useStepContext, extractUrlsFromContext } from '../../hooks/useStepContext';
import { useExecuteSubmodule, useApproveSubmoduleRun } from '../../hooks/useSubmodules';
import { SubmodulePanel, type AccordionConfig } from '../shared';
import {
  ResultsList,
  SubmoduleOptions,
  PATH_FILTER_OPTIONS,
  CONTENT_TYPE_OPTIONS,
  DEDUP_OPTIONS,
} from '../primitives';

// Get options config based on submodule ID
function getOptionsForSubmodule(submoduleId: string | null) {
  switch (submoduleId) {
    case 'path-filter':
      return PATH_FILTER_OPTIONS;
    case 'content-type-filter':
      return CONTENT_TYPE_OPTIONS;
    case 'exact-dedup':
    case 'fuzzy-dedup':
      return DEDUP_OPTIONS;
    default:
      return [];
  }
}

export function Step2Panel() {
  const {
    submodulePanelOpen,
    activeSubmoduleId,
    activeCategoryKey,
    submoduleState,
    submoduleResults,
    activeRunId,
    activeSubmoduleRunId,
    optionValues,
    setPanelAccordion,
    setSubmoduleState,
    setSubmoduleResults,
    setSubmoduleRunIds,
    setOptionValue,
  } = usePanelStore();

  const { selectedProjectId, selectedRunId, step1ApprovedUrls } = usePipelineStore();
  const { useMockData, showToast } = useAppStore();
  const { categories, approveSubmodule } = useValidationStore();

  // Mutations
  const executeMutation = useExecuteSubmodule();
  const approveMutation = useApproveSubmoduleRun();

  // Fetch Step 1 context (input URLs) from Supabase
  // In real mode: fetches from step_context table
  // In mock mode: falls back to in-memory store
  const { data: step1Context, isLoading: isLoadingContext } = useStepContext(
    selectedRunId,
    1
  );
  const apiUrls = extractUrlsFromContext(step1Context);
  // Use Supabase data in real mode, in-memory store only for mock mode
  const inputUrls = useMockData ? step1ApprovedUrls : apiUrls;

  // Only render if panel is for step 2 (validation)
  if (!submodulePanelOpen || activeCategoryKey !== 'validation') return null;

  // Get submodule info from store
  const storeInfo = activeSubmoduleId
    ? getSubmoduleById(categories, activeSubmoduleId)
    : null;
  const submoduleInfo = storeInfo?.submodule;

  const isRunning = submoduleState === 'running' || executeMutation.isPending;
  const isCompleted = submoduleState === 'completed';

  // Check if input URLs are available from Step 1
  const hasInput = inputUrls.length > 0;

  // Get the right options config for this submodule
  const optionsConfig = getOptionsForSubmodule(activeSubmoduleId);

  // Calculate input summary
  const getInputSummary = () => {
    if (isLoadingContext) return 'Loading...';
    if (inputUrls.length > 0) return `${inputUrls.length} URLs from Step 1`;
    return 'No URLs available';
  };

  // Run task handler
  const handleRunTask = () => {
    if (inputUrls.length === 0) {
      showToast('No URLs available from Step 1', 'error');
      return;
    }

    // Open results accordion immediately to show loading state
    setPanelAccordion('results');

    if (useMockData) {
      // Demo mode - simulate filtering
      setSubmoduleState('running');
      showToast('Running validation...', 'info');

      setTimeout(() => {
        // Simulate 20% filtered out
        const filteredCount = Math.floor(inputUrls.length * 0.8);
        const mockResults = inputUrls.slice(0, filteredCount).map((u, idx) => ({
          id: String(idx),
          url: u.url,
          entity_name: u.entity_name,
        }));

        setSubmoduleState('completed');
        setSubmoduleResults(mockResults);
        showToast(`Validation complete - ${filteredCount} URLs passed`, 'success');
      }, 1500);
      return;
    }

    // Real API mode
    const submoduleName = activeSubmoduleId || 'path-filter';

    const requestData = {
      name: submoduleName,
      urls: inputUrls,
      project_id: selectedProjectId || undefined,
      options: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    };

    setSubmoduleState('running');

    executeMutation.mutate(requestData, {
      onSuccess: (data) => {
        if (data.created_run_id && data.submodule_run_id) {
          setSubmoduleRunIds(data.created_run_id, data.submodule_run_id);
        }

        const rawResults = data.results || [];
        const results = rawResults.map((r: { url: string; entity_name?: string }, idx: number) => ({
          id: String(idx),
          url: r.url,
          entity_name: r.entity_name || 'Unknown',
        }));

        setSubmoduleState('completed');
        setSubmoduleResults(results);
        const filtered = inputUrls.length - results.length;
        showToast(`Validation complete - ${results.length} passed, ${filtered} filtered`, 'success');
      },
      onError: (error) => {
        setSubmoduleState('idle');
        showToast(error.message || 'Validation failed', 'error');
      },
    });
  };

  // Approve handler
  const handleApprove = () => {
    if (activeSubmoduleId) {
      approveSubmodule(activeSubmoduleId, submoduleResults.length);
    }

    if (!useMockData && activeRunId && activeSubmoduleRunId) {
      approveMutation.mutate({
        runId: activeRunId,
        submoduleRunId: activeSubmoduleRunId,
      });
    }
  };

  // Reset state for reject
  const resetState = () => {
    setSubmoduleState('idle');
    setSubmoduleResults([]);
    setPanelAccordion('input');
  };

  // Configure accordions for Step 2
  const accordions: AccordionConfig[] = [
    {
      id: 'input',
      title: 'Input URLs',
      subtitle: getInputSummary(),
      variant: 'teal',
      showWhen: 'always',
      content: (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            URLs discovered in Step 1 (read-only)
          </p>
          {isLoadingContext ? (
            <div className="text-center py-3">
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-[#0891B2]" />
            </div>
          ) : inputUrls.length > 0 ? (
            <>
              <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
                <span className="font-semibold">{inputUrls.length}</span> URLs ready for validation
              </div>
              {/* Show breakdown by entity */}
              {step1Context?.stats?.by_column?.entity_name && (
                <div className="text-[10px] text-gray-400 mt-1">
                  From {Object.keys(step1Context.stats.by_column).length} entities
                </div>
              )}
            </>
          ) : (
            <div className="bg-orange-50 rounded p-2 text-xs text-orange-600">
              No URLs available. Complete Step 1 first.
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'options',
      title: 'Filter Options',
      subtitle: optionsConfig.length > 0 ? `${optionsConfig.length} settings` : 'No options',
      variant: 'teal',
      showWhen: 'always',
      content: (
        <SubmoduleOptions
          config={optionsConfig}
          values={optionValues}
          onChange={setOptionValue}
        />
      ),
    },
    {
      id: 'results',
      title: 'Results',
      subtitle: submoduleResults.length > 0
        ? `${submoduleResults.length} passed (${inputUrls.length - submoduleResults.length} filtered)`
        : '',
      variant: 'pink',
      showWhen: 'running',
      content: (
        <ResultsList
          results={submoduleResults}
          isLoading={isRunning}
          emptyMessage="Run validation to see results"
          showEntityName
          fullHeight
          onReject={resetState}
        />
      ),
    },
  ];

  return (
    <SubmodulePanel
      stepNumber={2}
      submoduleName={submoduleInfo?.name || 'Validation'}
      submoduleDescription={submoduleInfo?.description || ''}
      accordions={accordions}
      onRunTask={handleRunTask}
      onApprove={handleApprove}
      isRunning={isRunning}
      isCompleted={isCompleted}
      hasInput={hasInput}
    />
  );
}
