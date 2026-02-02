import { useState } from 'react';
import { usePanelStore } from '../../stores/panelStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useAppStore } from '../../stores/appStore';
import { useDiscoveryStore, getSubmoduleById } from '../../stores/discoveryStore';
import { useExecuteSubmodule, useApproveSubmoduleRun } from '../../hooks/useSubmodules';
import { SubmodulePanel, type AccordionConfig } from '../shared';

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
    setPanelAccordion,
    setSubmoduleState,
    setSubmoduleResults,
    setSubmoduleRunIds,
  } = usePanelStore();

  const { selectedProjectId } = usePipelineStore();
  const { useMockData, showToast } = useAppStore();
  const { categories, approveSubmodule } = useDiscoveryStore();

  // Mutations
  const executeMutation = useExecuteSubmodule();
  const approveMutation = useApproveSubmoduleRun();

  // Local state for input URLs
  const [inputUrls, setInputUrls] = useState('');

  // Only render if panel is for step 1 (discovery)
  if (!submodulePanelOpen || activeCategoryKey !== 'discovery') return null;

  // Get submodule info from store
  const storeInfo = activeSubmoduleId
    ? getSubmoduleById(categories, activeSubmoduleId)
    : null;
  const submoduleInfo = storeInfo?.submodule;

  const isRunning = submoduleState === 'running' || executeMutation.isPending;
  const isCompleted = submoduleState === 'completed';

  // Parse input URLs into entities
  const parseInputEntities = () => {
    const urls = inputUrls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      // Use default entities for demo
      return DEFAULT_ENTITIES;
    }

    return urls.map((url, idx) => {
      try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        return {
          name: urlObj.hostname.replace('www.', ''),
          website: urlObj.origin,
        };
      } catch {
        return { name: `Entity ${idx + 1}`, website: url };
      }
    });
  };

  // Run task handler
  const handleRunTask = () => {
    if (useMockData) {
      // Demo mode - use mock data
      setSubmoduleState('running');
      showToast('Running task...', 'info');

      setTimeout(() => {
        setSubmoduleState('completed');
        setSubmoduleResults(MOCK_RESULTS);
        setPanelAccordion('results');
        showToast('Task completed - 5 URLs found', 'success');
      }, 2000);
      return;
    }

    // Real API mode
    if (!selectedProjectId) {
      showToast('Please select a project first', 'error');
      return;
    }

    const entities = parseInputEntities();
    const submoduleName = activeSubmoduleId || 'sitemap';

    setSubmoduleState('running');

    executeMutation.mutate(
      {
        name: submoduleName,
        project_id: selectedProjectId,
        entities,
      },
      {
        onSuccess: (data) => {
          // Store run IDs for approval
          if (data.created_run_id && data.submodule_run_id) {
            setSubmoduleRunIds(data.created_run_id, data.submodule_run_id);
          }

          // Map results to expected format
          const results = (data.results || []).map((r: { url: string; entity_name?: string; entity_id?: string }, idx: number) => ({
            id: String(idx),
            url: r.url,
            entity_name: r.entity_name || 'Unknown',
          }));

          setSubmoduleState('completed');
          setSubmoduleResults(results);
          setPanelAccordion('results');
          showToast(`Task completed - ${results.length} URLs found`, 'success');
        },
        onError: (error) => {
          setSubmoduleState('idle');
          showToast(error.message || 'Task failed', 'error');
        },
      }
    );
  };

  // Approve handler
  const handleApprove = () => {
    if (activeSubmoduleId) {
      approveSubmodule(activeSubmoduleId, submoduleResults.length);
    }

    // If we have real run IDs, also approve via API
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

  // Configure accordions for Step 1
  const accordions: AccordionConfig[] = [
    {
      id: 'input',
      title: 'Input data',
      subtitle: 'No data',
      variant: 'teal',
      showWhen: 'always',
      content: (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Paste URLs (one per line)
            </label>
            <textarea
              rows={4}
              value={inputUrls}
              onChange={(e) => setInputUrls(e.target.value)}
              placeholder={'https://betsson.com\nhttps://evolution.com'}
              className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm font-mono focus:outline-none focus:border-[#0891B2]"
            />
          </div>
          <div className="text-center text-[10px] text-gray-400">— or —</div>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-[#0891B2] cursor-pointer">
            <p className="text-xs text-gray-500">Drop CSV or click to browse</p>
          </div>
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
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Sitemap location
            </label>
            <select className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm">
              <option value="auto">Auto-detect</option>
              <option value="custom">Custom URL</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              defaultChecked
              className="rounded border-gray-300 text-[#0891B2]"
            />
            Include nested sitemaps
          </label>
        </div>
      ),
    },
    {
      id: 'results',
      title: 'Results',
      subtitle: submoduleResults.length > 0 ? `${submoduleResults.length} URLs` : '',
      variant: 'pink',
      showWhen: 'running',
      content: (
        <>
          {isRunning && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#E11D73] mb-2" />
              <p className="text-xs text-gray-500">Processing...</p>
            </div>
          )}
          {isCompleted && submoduleResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-600 font-medium uppercase">
                  URLs
                </p>
                <button className="text-xs text-[#E11D73] hover:text-[#E11D73]/80 flex items-center gap-1">
                  <span>⬇</span> Download CSV
                </button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {submoduleResults.map((result) => (
                  <a
                    key={result.id}
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-600 hover:text-blue-800 hover:underline py-0.5 truncate"
                    title={result.url}
                  >
                    {result.url}
                  </a>
                ))}
              </div>
              <button
                onClick={resetState}
                className="mt-3 w-full bg-[#E11D73] hover:bg-[#E11D73]/90 text-white py-2 rounded text-sm font-medium"
              >
                Reject and try with new settings or uploads
              </button>
            </div>
          )}
        </>
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
    />
  );
}
