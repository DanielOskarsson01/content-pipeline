import { usePanelStore, type CsvEntity } from '../../stores/panelStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useAppStore } from '../../stores/appStore';
import { api } from '../../api/client';
import { useDiscoveryStore, getSubmoduleById } from '../../stores/discoveryStore';
import { useExecuteSubmodule, useApproveSubmoduleRun } from '../../hooks/useSubmodules';
import { SubmodulePanel, type AccordionConfig } from '../shared';
import {
  CsvUploadInput,
  UrlTextarea,
  parseUrls,
  ResultsList,
  SubmoduleOptions,
  SITEMAP_OPTIONS,
} from '../primitives';

// Mock data for demo mode
const MOCK_RESULTS = [
  { id: '1', url: 'https://betsson.com/about', entity_name: 'Betsson' },
  { id: '2', url: 'https://betsson.com/careers', entity_name: 'Betsson' },
  { id: '3', url: 'https://betsson.com/news', entity_name: 'Betsson' },
  { id: '4', url: 'https://betsson.com/investors', entity_name: 'Betsson' },
  { id: '5', url: 'https://betsson.com/responsible-gaming', entity_name: 'Betsson' },
];

// Default entities for demo when no URLs provided
const DEFAULT_ENTITIES = [
  { name: 'Betsson', website: 'https://betsson.com' },
];

export function Step1Panel() {
  const {
    submodulePanelOpen,
    activeSubmoduleId,
    activeCategoryKey,
    submoduleState,
    submoduleResults,
    activeRunId,
    activeSubmoduleRunId,
    csvEntities,
    csvFileName,
    inputUrls,
    optionValues,
    setPanelAccordion,
    setSubmoduleState,
    setSubmoduleResults,
    setSubmoduleRunIds,
    setCsvData,
    clearCsvData,
    setInputUrls,
    setOptionValue,
  } = usePanelStore();

  const { selectedProjectId, setSelectedRun, setStep1ApprovedUrls } = usePipelineStore();
  const { useMockData, showToast } = useAppStore();
  const { categories, approveSubmodule } = useDiscoveryStore();

  // Mutations
  const executeMutation = useExecuteSubmodule();
  const approveMutation = useApproveSubmoduleRun();

  // Only render if panel is for step 1 (discovery)
  if (!submodulePanelOpen || activeCategoryKey !== 'discovery') return null;

  // Get submodule info from store
  const storeInfo = activeSubmoduleId
    ? getSubmoduleById(categories, activeSubmoduleId)
    : null;
  const submoduleInfo = storeInfo?.submodule;

  const isRunning = submoduleState === 'running' || executeMutation.isPending;
  const isCompleted = submoduleState === 'completed';

  // Check if user has provided input data (CSV or URLs)
  const hasInput = csvEntities.length > 0 || inputUrls.split('\n').some((u) => u.trim().length > 0);

  // Parse input URLs into entities (or use CSV data)
  const parseInputEntities = (): CsvEntity[] => {
    // If CSV is loaded, use that
    if (csvEntities.length > 0) {
      return csvEntities;
    }

    // Otherwise parse manual URLs using the UrlTextarea helper
    const parsed = parseUrls(inputUrls, 'urls-only');
    if (parsed.length === 0) {
      return DEFAULT_ENTITIES;
    }

    return parsed.map((p) => ({ name: p.name, website: p.url }));
  };

  // Calculate input summary
  const getInputSummary = () => {
    if (csvEntities.length > 0) return `${csvEntities.length} from CSV`;
    const urlCount = inputUrls.split('\n').filter((u) => u.trim()).length;
    if (urlCount > 0) return `${urlCount} URLs`;
    return 'No data';
  };

  // Run task handler
  const handleRunTask = () => {
    // Open results accordion immediately to show loading state
    setPanelAccordion('results');

    if (useMockData) {
      // Demo mode - use mock data
      setSubmoduleState('running');
      showToast('Running task...', 'info');

      setTimeout(() => {
        setSubmoduleState('completed');
        setSubmoduleResults(MOCK_RESULTS);
        showToast('Task completed - 5 URLs found', 'success');
      }, 2000);
      return;
    }

    // Real API mode
    const entities = parseInputEntities();
    const submoduleName = activeSubmoduleId || 'sitemap';

    // Build request - only include project_id if selected
    const requestData: { name: string; entities: typeof entities; project_id?: string; options?: Record<string, string | number | boolean> } = {
      name: submoduleName,
      entities,
    };

    if (selectedProjectId) {
      requestData.project_id = selectedProjectId;
    }

    // Include options if any are set
    if (Object.keys(optionValues).length > 0) {
      requestData.options = optionValues;
    }

    setSubmoduleState('running');

    executeMutation.mutate(requestData, {
      onSuccess: (data) => {
        // Store run IDs for approval and cross-step sharing
        if (data.created_run_id && data.submodule_run_id) {
          setSubmoduleRunIds(data.created_run_id, data.submodule_run_id);
          // Also update pipelineStore so Step 2 can access the run
          setSelectedRun(data.created_run_id);
        }

        // Map results to expected format
        const rawResults = data.results || [];
        const results = rawResults.map((r: { url: string; entity_name?: string }, idx: number) => ({
          id: String(idx),
          url: r.url,
          entity_name: r.entity_name || 'Unknown',
        }));

        setSubmoduleState('completed');
        setSubmoduleResults(results);
        const previewLabel = data.preview_mode ? ' (preview)' : '';
        showToast(`Task completed${previewLabel} - ${results.length} URLs found`, 'success');
      },
      onError: (error) => {
        setSubmoduleState('idle');
        showToast(error.message || 'Task failed', 'error');
      },
    });
  };

  // Approve handler
  const handleApprove = async () => {
    if (activeSubmoduleId) {
      approveSubmodule(activeSubmoduleId, submoduleResults.length);
    }

    const approvedUrls = submoduleResults.map((r) => ({
      url: r.url,
      entity_name: r.entity_name,
    }));

    if (useMockData) {
      // Mock mode: save to in-memory store for Step 2 to access
      setStep1ApprovedUrls(approvedUrls);
    } else if (activeRunId && activeSubmoduleRunId) {
      // Real mode: save to Supabase via API
      approveMutation.mutate({
        runId: activeRunId,
        submoduleRunId: activeSubmoduleRunId,
      });

      // Save to step_context table - Step 2 will fetch from here
      try {
        await api.saveStepContext(activeRunId, 1, approvedUrls, activeSubmoduleId || undefined);
      } catch (e) {
        console.warn('Failed to save step context:', e);
      }
    }
  };

  // Reset state for reject
  const resetState = () => {
    setSubmoduleState('idle');
    setSubmoduleResults([]);
    setPanelAccordion('input');
  };

  // Configure accordions for Step 1
  const accordions: AccordionConfig[] = [
    {
      id: 'input',
      title: 'Input data',
      subtitle: getInputSummary(),
      variant: 'teal',
      showWhen: 'always',
      content: (
        <div className="space-y-3">
          {csvFileName ? (
            <CsvUploadInput
              onEntitiesLoaded={(entities, fileName) => setCsvData(entities, fileName)}
              onClear={clearCsvData}
              currentFileName={csvFileName}
              currentEntities={csvEntities}
              onError={(msg) => showToast(msg, 'error')}
            />
          ) : (
            <>
              <UrlTextarea
                value={inputUrls}
                onChange={setInputUrls}
                placeholder={'https://betsson.com\nhttps://evolution.com'}
                rows={4}
              />
              <div className="text-center text-[10px] text-gray-400">— or —</div>
              <CsvUploadInput
                onEntitiesLoaded={(entities, fileName) => {
                  setCsvData(entities, fileName);
                  showToast(`Loaded ${entities.length} entities from CSV`, 'success');
                }}
                onClear={clearCsvData}
                currentFileName={null}
                currentEntities={[]}
                onError={(msg) => showToast(msg, 'error')}
              />
            </>
          )}
        </div>
      ),
    },
    {
      id: 'options',
      title: 'Advanced options',
      subtitle: 'Default settings',
      variant: 'teal',
      showWhen: 'always',
      content: (
        <SubmoduleOptions
          config={SITEMAP_OPTIONS}
          values={optionValues}
          onChange={setOptionValue}
        />
      ),
    },
    {
      id: 'results',
      title: 'Results',
      subtitle: submoduleResults.length > 0 ? `${submoduleResults.length} URLs` : '',
      variant: 'pink',
      showWhen: 'running',
      content: (
        <ResultsList
          results={submoduleResults}
          isLoading={isRunning}
          emptyMessage="No URLs discovered yet"
          showEntityName
          fullHeight
          onReject={resetState}
        />
      ),
    },
  ];

  return (
    <SubmodulePanel
      stepNumber={1}
      submoduleName={submoduleInfo?.name || 'Submodule'}
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
