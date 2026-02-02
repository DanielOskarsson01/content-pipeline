import { useEffect, type ReactNode } from 'react';
import { usePanelStore, type PanelAccordion } from '../../stores/panelStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useAppStore } from '../../stores/appStore';

// Accordion section configuration
export interface AccordionConfig {
  id: string;
  title: string;
  subtitle?: string;
  variant: 'teal' | 'pink';
  showWhen?: 'always' | 'running' | 'completed';
  content: ReactNode;
}

interface SubmodulePanelProps {
  stepNumber: number;
  submoduleName: string;
  submoduleDescription: string;
  accordions: AccordionConfig[];
  onRunTask: () => void;
  onApprove: () => void;
  isRunning: boolean;
  isCompleted: boolean;
}

interface AccordionItemProps {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  variant: 'teal' | 'pink';
  children: ReactNode;
}

function PanelAccordionItem({
  title,
  subtitle,
  isOpen,
  onToggle,
  variant,
  children,
}: AccordionItemProps) {
  const bgColor = variant === 'teal' ? 'bg-[#0891B2]' : 'bg-[#E11D73]';
  const buttonBg = variant === 'teal' ? 'bg-[#E11D73]' : 'bg-white';
  const buttonText = variant === 'teal' ? 'text-white' : 'text-[#E11D73]';

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 ${isOpen ? 'flex-1 flex flex-col min-h-0' : 'flex-shrink-0'}`}
    >
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 ${bgColor} text-white rounded-t-lg`}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{title}</span>
          {subtitle && (
            <span className="text-xs text-white/70">{subtitle}</span>
          )}
        </div>
        <div
          className={`w-6 h-6 rounded-full ${buttonBg} flex items-center justify-center`}
        >
          <span className={`${buttonText} font-bold text-sm`}>
            {isOpen ? '−' : '+'}
          </span>
        </div>
      </button>
      {isOpen && (
        <div className="p-4 flex-1 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}

export function SubmodulePanel({
  stepNumber,
  submoduleName,
  submoduleDescription,
  accordions,
  onRunTask,
  onApprove,
  isRunning,
  isCompleted,
}: SubmodulePanelProps) {
  const {
    submodulePanelOpen,
    panelAccordion,
    closeSubmodulePanel,
    setPanelAccordion,
  } = usePanelStore();

  const { selectedProjectId } = usePipelineStore();
  const { showToast } = useAppStore();

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && submodulePanelOpen) {
        closeSubmodulePanel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [submodulePanelOpen, closeSubmodulePanel]);

  if (!submodulePanelOpen) return null;

  // Filter accordions based on showWhen
  const visibleAccordions = accordions.filter((acc) => {
    if (!acc.showWhen || acc.showWhen === 'always') return true;
    if (acc.showWhen === 'running') return isRunning || isCompleted;
    if (acc.showWhen === 'completed') return isCompleted;
    return true;
  });

  const handleApproveClick = () => {
    onApprove();
    showToast('Results approved!', 'success');
    closeSubmodulePanel();
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 transition-opacity duration-300 ${
          submodulePanelOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={closeSubmodulePanel}
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 left-0 w-full max-w-lg bg-gray-100 shadow-2xl flex flex-col transition-transform duration-300 ${
          submodulePanelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Panel Header - Teal */}
        <div className="bg-[#0891B2] text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold">
              Step{stepNumber} - {submoduleName}
            </h3>
            <p className="text-xs text-white/70">
              {selectedProjectId ? 'Active Project' : 'No project selected'}
            </p>
          </div>
          <button
            onClick={closeSubmodulePanel}
            className="p-1 text-white/80 hover:text-white rounded hover:bg-white/10"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Submodule Description */}
        <p className="px-4 py-2 text-xs text-gray-500 bg-white border-b flex-shrink-0">
          {submoduleDescription}
        </p>

        {/* Accordions Container */}
        <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
          {visibleAccordions.map((acc) => (
            <PanelAccordionItem
              key={acc.id}
              title={acc.title}
              subtitle={acc.subtitle}
              isOpen={panelAccordion === acc.id}
              onToggle={() =>
                setPanelAccordion(panelAccordion === acc.id ? null : acc.id as PanelAccordion)
              }
              variant={acc.variant}
            >
              {acc.content}
            </PanelAccordionItem>
          ))}
        </div>

        {/* Panel Footer - Action Buttons */}
        <div className="border-t border-gray-200 px-4 py-3 bg-white flex-shrink-0">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onRunTask}
              disabled={isRunning}
              className={`px-8 py-3 rounded text-sm font-medium ${
                isRunning
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              RUN TASK
            </button>
            <button
              onClick={() => setPanelAccordion('results')}
              disabled={!isCompleted}
              className={`px-8 py-3 rounded text-sm font-medium ${
                isCompleted
                  ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              SEE RESULTS
            </button>
            <button
              onClick={handleApproveClick}
              disabled={!isCompleted}
              className={`px-8 py-3 rounded text-sm font-medium ${
                isCompleted
                  ? 'bg-[#E11D73] hover:bg-[#E11D73]/90 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              APPROVE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
