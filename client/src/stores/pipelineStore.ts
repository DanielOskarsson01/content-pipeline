import { create } from 'zustand';

export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped';

// Approved step results for passing data between steps
export interface StepResult {
  url: string;
  entity_name: string;
}

interface PipelineStore {
  // Selected IDs (data comes from Query)
  selectedProjectId: string | null;
  selectedRunId: string | null;

  // Approved step results (persisted for cross-step data flow)
  step1ApprovedUrls: StepResult[];

  // Step states (0-10 workflow steps)
  stepStates: Record<number, StepStatus>;

  // UI state
  expandedStep: number | null;
  expandedCategory: string | null;
  expandedValidationCategory: string | null;

  // Enabled categories (user preferences)
  enabledCategories: Record<string, boolean>;
  enabledValidationCategories: Record<string, boolean>;

  // Actions
  setSelectedProject: (id: string | null) => void;
  setSelectedRun: (id: string | null) => void;
  setStep1ApprovedUrls: (urls: StepResult[]) => void;
  setStepCompleted: (step: number) => void;
  setStepStatus: (step: number, status: StepStatus) => void;
  toggleStep: (step: number) => void;
  setExpandedCategory: (category: string | null) => void;
  setExpandedValidationCategory: (category: string | null) => void;
  toggleCategoryEnabled: (category: string) => void;
  toggleValidationCategoryEnabled: (category: string) => void;
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  // Initial state
  selectedProjectId: null,
  selectedRunId: null,
  step1ApprovedUrls: [],
  stepStates: {
    0: 'pending',
    1: 'pending',
    2: 'pending',
    3: 'pending',
    4: 'pending',
    5: 'pending',
    6: 'pending',
    7: 'pending',
    8: 'pending',
    9: 'pending',
    10: 'pending',
  },
  expandedStep: 0, // Step 0 expanded by default
  expandedCategory: null,
  expandedValidationCategory: null,
  enabledCategories: {
    website: true,
    news: true,
    linkedin: true,
    youtube: true,
    twitter: true,
    search: true,
  },
  enabledValidationCategories: {
    filtering: true,
    dedup: true,
  },

  // Actions
  setSelectedProject: (id) => set({ selectedProjectId: id }),
  setSelectedRun: (id) => set({ selectedRunId: id }),
  setStep1ApprovedUrls: (urls) => set({ step1ApprovedUrls: urls }),

  setStepCompleted: (step) => {
    const stepStates = get().stepStates;
    set({
      stepStates: {
        ...stepStates,
        [step]: 'completed',
      },
    });
  },

  setStepStatus: (step, status) => {
    const stepStates = get().stepStates;
    set({
      stepStates: {
        ...stepStates,
        [step]: status,
      },
    });
  },

  toggleStep: (step) => {
    const current = get().expandedStep;
    set({ expandedStep: current === step ? null : step });
  },

  setExpandedCategory: (category) => set({ expandedCategory: category }),
  setExpandedValidationCategory: (category) => set({ expandedValidationCategory: category }),

  toggleCategoryEnabled: (category) => {
    const enabled = get().enabledCategories;
    set({
      enabledCategories: {
        ...enabled,
        [category]: !enabled[category],
      },
    });
  },

  toggleValidationCategoryEnabled: (category) => {
    const enabled = get().enabledValidationCategories;
    set({
      enabledValidationCategories: {
        ...enabled,
        [category]: !enabled[category],
      },
    });
  },
}));
