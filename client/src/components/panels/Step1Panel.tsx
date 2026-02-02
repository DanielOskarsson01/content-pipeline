import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { usePanelStore } from '../../stores/panelStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useAppStore } from '../../stores/appStore';
import { useDiscoveryStore, getSubmoduleById } from '../../stores/discoveryStore';
import { useExecuteSubmodule, useApproveSubmoduleRun } from '../../hooks/useSubmodules';
import { SubmodulePanel, type AccordionConfig } from '../shared';

// Entity from CSV
interface CsvEntity {
  name: string;
  website: string;
}

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

  // Local state for input
  const [inputUrls, setInputUrls] = useState('');
  const [csvEntities, setCsvEntities] = useState<CsvEntity[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Only render if panel is for step 1 (discovery)
  if (!submodulePanelOpen || activeCategoryKey !== 'discovery') return null;

  // Get submodule info from store
  const storeInfo = activeSubmoduleId
    ? getSubmoduleById(categories, activeSubmoduleId)
    : null;
  const submoduleInfo = storeInfo?.submodule;

  const isRunning = submoduleState === 'running' || executeMutation.isPending;
  const isCompleted = submoduleState === 'completed';

  // Parse CSV content into entities
  const parseCsv = (content: string): CsvEntity[] => {
    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return [];

    // Detect delimiter (comma or semicolon)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    // Parse header to find name/website columns
    const headers = firstLine.split(delimiter).map((h) => h.trim().toLowerCase().replace(/"/g, ''));
    const nameIdx = headers.findIndex((h) => ['name', 'company', 'company_name', 'entity'].includes(h));
    const websiteIdx = headers.findIndex((h) => ['website', 'url', 'domain', 'website_url'].includes(h));

    // If no headers found, assume first column is name, second is website
    const hasHeaders = nameIdx !== -1 || websiteIdx !== -1;
    const dataLines = hasHeaders ? lines.slice(1) : lines;
    const actualNameIdx = nameIdx !== -1 ? nameIdx : 0;
    const actualWebsiteIdx = websiteIdx !== -1 ? websiteIdx : 1;

    return dataLines
      .map((line) => {
        const cols = line.split(delimiter).map((c) => c.trim().replace(/"/g, ''));
        const name = cols[actualNameIdx] || '';
        const website = cols[actualWebsiteIdx] || '';
        if (!name && !website) return null;
        return { name: name || website, website };
      })
      .filter((e): e is CsvEntity => e !== null);
  };

  // Handle file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // Handle drag events
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // Process uploaded file
  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      showToast('Please upload a CSV file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const entities = parseCsv(content);
      if (entities.length === 0) {
        showToast('No valid entities found in CSV', 'error');
        return;
      }
      setCsvEntities(entities);
      setCsvFileName(file.name);
      setInputUrls(''); // Clear manual input when CSV is uploaded
      showToast(`Loaded ${entities.length} entities from CSV`, 'success');
    };
    reader.onerror = () => {
      showToast('Failed to read file', 'error');
    };
    reader.readAsText(file);
  };

  // Clear CSV data
  const clearCsv = () => {
    setCsvEntities([]);
    setCsvFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Parse input URLs into entities (or use CSV data)
  const parseInputEntities = () => {
    // If CSV is loaded, use that
    if (csvEntities.length > 0) {
      return csvEntities;
    }

    // Otherwise parse manual URLs
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

  // Calculate input summary
  const getInputSummary = () => {
    if (csvEntities.length > 0) return `${csvEntities.length} from CSV`;
    const urlCount = inputUrls.split('\n').filter((u) => u.trim()).length;
    if (urlCount > 0) return `${urlCount} URLs`;
    return 'No data';
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
      subtitle: getInputSummary(),
      variant: 'teal',
      showWhen: 'always',
      content: (
        <div className="space-y-3">
          {/* Show CSV info if loaded */}
          {csvFileName ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">📄</span>
                  <div>
                    <p className="text-sm font-medium text-green-800">{csvFileName}</p>
                    <p className="text-xs text-green-600">{csvEntities.length} entities loaded</p>
                  </div>
                </div>
                <button
                  onClick={clearCsv}
                  className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
              {/* Preview first few entities */}
              <div className="mt-2 pt-2 border-t border-green-200">
                <p className="text-[10px] text-green-600 mb-1">Preview:</p>
                <div className="space-y-0.5">
                  {csvEntities.slice(0, 3).map((e, i) => (
                    <p key={i} className="text-xs text-gray-600 truncate">
                      {e.name} — {e.website}
                    </p>
                  ))}
                  {csvEntities.length > 3 && (
                    <p className="text-xs text-gray-400">...and {csvEntities.length - 3} more</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
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
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-[#0891B2] bg-[#0891B2]/5'
                    : 'border-gray-300 hover:border-[#0891B2]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <p className="text-xs text-gray-500">
                  {isDragging ? 'Drop CSV here' : 'Drop CSV or click to browse'}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  Columns: name/company, website/url
                </p>
              </div>
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
