import { useState } from 'react';
import { usePanelStore } from '../../stores/panelStore';
import { useAppStore } from '../../stores/appStore';
import { useValidationStore, getSubmoduleById } from '../../stores/validationStore';
import { useUrlParams } from '../../hooks/useUrlParams';
import { usePreviousStepContext, extractUrlsFromContext } from '../../hooks/useStepContext';
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
  // UI state from store
  const {
    submodulePanelOpen,
    activeSubmoduleId,
    activeCategoryKey,
    setPanelAccordion,
  } = usePanelStore();

  // URL params for project/run IDs
  const { projectId, runId } = useUrlParams();

  // Local state for form and results
  const [optionValues, setOptionValues] = useState<Record<string, string | number | boolean>>({});
  const [results, setResults] = useState<Array<{ id: string; url: string; entity_name: string }>>([]);
  const [executionRunId, setExecutionRunId] = useState<string | null>(null);
  const [subRunId, setSubRunId] = useState<string | null>(null);

  const { showToast } = useAppStore();
  const { categories, approveSubmodule } = useValidationStore();

  // Mutations
  const executeMutation = useExecuteSubmodule();
  const approveMutation = useApproveSubmoduleRun();

  // Fetch previous step data from Supabase
  const {
    stepContext: step1Context,
    isLoading: isLoadingContext,
  } = usePreviousStepContext(projectId, 2, runId);

  const inputUrls = extractUrlsFromContext(step1Context);

  // Only render if panel is for step 2 (validation)
  if (!submodulePanelOpen || activeCategoryKey !== 'validation') return null;

  // Get submodule info from store
  const storeInfo = activeSubmoduleId
    ? getSubmoduleById(categories, activeSubmoduleId)
    : null;
  const submoduleInfo = storeInfo?.submodule;

  const isRunning = executeMutation.isPending;
  const isCompleted = results.length > 0 && !isRunning;
  const hasInput = inputUrls.length > 0;

  const optionsConfig = getOptionsForSubmodule(activeSubmoduleId);

  const getInputSummary = () => {
    if (isLoadingContext) return 'Loading...';
    if (inputUrls.length > 0) return `${inputUrls.length} URLs from Step 1`;
    return 'No URLs available';
  };

  const handleOptionChange = (name: string, value: string | number | boolean) => {
    setOptionValues(prev => ({ ...prev, [name]: value }));
  };

  const handleRunTask = () => {
    if (inputUrls.length === 0) {
      showToast('No URLs available from Step 1', 'error');
      return;
    }

    setPanelAccordion('results');

    executeMutation.mutate({
      name: activeSubmoduleId || 'path-filter',
      urls: inputUrls,
      project_id: projectId || undefined,
      options: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    }, {
      onSuccess: (data) => {
        if (data.created_run_id && data.submodule_run_id) {
          setExecutionRunId(data.created_run_id);
          setSubRunId(data.submodule_run_id);
        }

        const formattedResults = (data.results || []).map((r: { url: string; entity_name?: string }, idx: number) => ({
          id: String(idx),
          url: r.url,
          entity_name: r.entity_name || 'Unknown',
        }));

        setResults(formattedResults);
        showToast(`Validation complete - ${formattedResults.length} passed`, 'success');
      },
      onError: (error) => {
        showToast(error.message || 'Validation failed', 'error');
      },
    });
  };

  const handleApprove = () => {
    if (activeSubmoduleId) {
      approveSubmodule(activeSubmoduleId, results.length);
    }

    if (executionRunId && subRunId) {
      approveMutation.mutate({
        runId: executionRunId,
        submoduleRunId: subRunId,
      });
    }
  };

  const resetState = () => {
    setResults([]);
    setExecutionRunId(null);
    setSubRunId(null);
    setPanelAccordion('input');
  };

  const accordions: AccordionConfig[] = [
    {
      id: 'input',
      title: 'Input URLs',
      subtitle: getInputSummary(),
      variant: 'teal',
      showWhen: 'always',
      content: (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">URLs discovered in Step 1 (read-only)</p>
          {isLoadingContext ? (
            <div className="text-center py-3">
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-[#0891B2]" />
            </div>
          ) : inputUrls.length > 0 ? (
            <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
              <span className="font-semibold">{inputUrls.length}</span> URLs ready for validation
            </div>
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
          onChange={handleOptionChange}
        />
      ),
    },
    {
      id: 'results',
      title: 'Results',
      subtitle: results.length > 0
        ? `${results.length} passed (${inputUrls.length - results.length} filtered)`
        : '',
      variant: 'pink',
      showWhen: 'running',
      content: (
        <ResultsList
          results={results}
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
