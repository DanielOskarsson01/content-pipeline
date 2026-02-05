import { create } from 'zustand';

/**
 * Pipeline UI Store - UI state only
 *
 * ARCHITECTURE NOTE: This store only holds UI state (accordion expansion, enabled toggles).
 * Domain data (projects, runs, URLs, step results) comes from TanStack Query.
 * Navigation IDs (projectId, runId) come from URL params via useUrlParams hook.
 */
interface PipelineStore {
  // UI state - accordion expansion
  expandedStep: number | null;
  expandedCategory: string | null;
  expandedValidationCategory: string | null;

  // UI state - user preferences for enabled categories
  enabledCategories: Record<string, boolean>;
  enabledValidationCategories: Record<string, boolean>;

  // Actions
  toggleStep: (step: number) => void;
  setExpandedCategory: (category: string | null) => void;
  setExpandedValidationCategory: (category: string | null) => void;
  toggleCategoryEnabled: (category: string) => void;
  toggleValidationCategoryEnabled: (category: string) => void;
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  // Initial UI state
  expandedStep: 0,
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
