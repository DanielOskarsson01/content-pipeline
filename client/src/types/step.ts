// Shared types for step components

export interface Submodule {
  id: string;
  name: string;
  description: string;
  cost: 'cheap' | 'medium' | 'expensive';
  status: 'pending' | 'running' | 'completed' | 'approved';
  result_count: number;
}

export interface Category {
  label: string;
  icon: string;
  description: string;
  enabled: boolean;
  expanded: boolean;
  submodules: Submodule[];
}

export type Categories = Record<string, Category>;

// Accordion configuration for SubmodulePanel
export interface AccordionSection {
  id: string;
  title: string;
  subtitle?: string;
  variant: 'teal' | 'pink';
  render: () => React.ReactNode;
  showWhen?: 'always' | 'running' | 'completed';
}

// Panel context passed to SubmodulePanel
export interface PanelContext {
  stepNumber: number;
  stepName: string;
  submoduleId: string | null;
  submoduleName: string;
  submoduleDescription: string;
  accordions: AccordionSection[];
  onRunTask: () => void;
  onApprove: () => void;
  isRunning: boolean;
  isCompleted: boolean;
  results: Array<{ id: string; url: string; entity_name: string }>;
}

// Step summary data
export interface StepSummaryData {
  totalApproved: number;
  totalItems: number; // URLs, documents, etc.
  itemLabel: string; // "URLs", "documents", etc.
  categoryBreakdown: Array<{ label: string; count: number }>;
}
