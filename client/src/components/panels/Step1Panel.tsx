import { useState } from 'react';
import { usePanelStore } from '../../stores/panelStore';
import { useAppStore } from '../../stores/appStore';
import { api } from '../../api/client';
import { useDiscoveryStore, getSubmoduleById } from '../../stores/discoveryStore';
import { useUrlParams } from '../../hooks/useUrlParams';
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

// CSV Entity type
interface CsvEntity {
  name: string;
  website: string;
  [key: string]: string;
}

// Default entities when no URLs provided
const DEFAULT_ENTITIES = [
  { name: 'Betsson', website: 'https://betsson.com' },
];

export function Step1Panel() {
  // UI state from store
  const {
    submodulePanelOpen,
    activeSubmoduleId,
    activeCategoryKey,
    setPanelAccordion,
  } = usePanelStore();

  // URL params
  const { projectId, selectRun } = useUrlParams();

  // Local state for form inputs
  const [csvEntities, setCsvEntities] = useState<CsvEntity[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [inputUrls, setInputUrls] = useState('');
  const [optionValues, setOptionValues] = useState<Record<string, string | number | boolean>>({});

  // Local state for results
  const [results, setResults] = useState<Array<{ id: string; url: string; entity_name: string }>>([]);
  const [executionRunId, setExecutionRunId] = useState<string | null>(null);
  const [subRunId, setSubRunId] = useState<string | null>(null);

  const { showToast } = useAppStore();
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

  const isRunning = executeMutation.isPending;
  const isCompleted = results.length > 0 && !isRunning;
  const hasInput = csvEntities.length > 0 || inputUrls.split('\n').some((u) => u.trim().length > 0);

  // Parse input URLs into entities (or use CSV data)
  const parseInputEntities = (): CsvEntity[] => {
    if (csvEntities.length > 0) {
      return csvEntities;
    }

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

  // CSV handlers
  const handleCsvLoad = (entities: CsvEntity[], fileName: string) => {
    setCsvEntities(entities);
    setCsvFileName(fileName);
    showToast(`Loaded ${entities.length} entities from CSV`, 'success');
  };

  const handleCsvClear = () => {
    setCsvEntities([]);
    setCsvFileName(null);
  };

  const handleOptionChange = (name: string, value: string | number | boolean) => {
    setOptionValues(prev => ({ ...prev, [name]: value }));
  };

  // Run task handler
  const handleRunTask = () => {
    setPanelAccordion('results');

    const entities = parseInputEntities();
    const submoduleName = activeSubmoduleId || 'sitemap';

    const requestData: { name: string; entities: typeof entities; project_id?: string; options?: Record<string, string | number | boolean> } = {
      name: submoduleName,
      entities,
    };

    if (projectId) {
      requestData.project_id = projectId;
    }

    if (Object.keys(optionValues).length > 0) {
      requestData.options = optionValues;
    }

    executeMutation.mutate(requestData, {
      onSuccess: (data) => {
        // Store run IDs for approval
        if (data.created_run_id && data.submodule_run_id) {
          setExecutionRunId(data.created_run_id);
          setSubRunId(data.submodule_run_id);
          // Update URL to include run ID
          if (projectId) {
            selectRun(projectId, data.created_run_id);
          }
        }

        const formattedResults = (data.results || []).map((r: { url: string; entity_name?: string }, idx: number) => ({
          id: String(idx),
          url: r.url,
          entity_name: r.entity_name || 'Unknown',
        }));

        setResults(formattedResults);
        const previewLabel = data.preview_mode ? ' (preview)' : '';
        showToast(`Task completed${previewLabel} - ${formattedResults.length} URLs found`, 'success');
      },
      onError: (error) => {
        showToast(error.message || 'Task failed', 'error');
      },
    });
  };

  // Approve handler
  const handleApprove = async () => {
    if (activeSubmoduleId) {
      approveSubmodule(activeSubmoduleId, results.length);
    }

    const approvedUrls = results.map((r) => ({
      url: r.url,
      entity_name: r.entity_name,
    }));

    if (executionRunId && subRunId) {
      // Save approval to Supabase
      approveMutation.mutate({
        runId: executionRunId,
        submoduleRunId: subRunId,
      });

      // Save to step_context table - Step 2 will fetch from here
      try {
        await api.saveStepContext(executionRunId, 1, approvedUrls, activeSubmoduleId || undefined);
      } catch (e) {
        console.warn('Failed to save step context:', e);
      }
    }
  };

  // Reset state for reject
  const resetState = () => {
    setResults([]);
    setExecutionRunId(null);
    setSubRunId(null);
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
              onEntitiesLoaded={handleCsvLoad}
              onClear={handleCsvClear}
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
                onEntitiesLoaded={handleCsvLoad}
                onClear={handleCsvClear}
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
          onChange={handleOptionChange}
        />
      ),
    },
    {
      id: 'results',
      title: 'Results',
      subtitle: results.length > 0 ? `${results.length} URLs` : '',
      variant: 'pink',
      showWhen: 'running',
      content: (
        <ResultsList
          results={results}
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
