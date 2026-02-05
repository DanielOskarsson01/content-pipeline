import { create } from 'zustand';

/**
 * Discovery Store - UI State Only
 *
 * This store holds ONLY runtime UI state for discovery submodules.
 * Category/submodule definitions come from the server via useStepCategories hook.
 *
 * State is keyed by:
 * - Category key (for expanded state)
 * - Submodule ID (for status and result_count)
 */

type SubmoduleStatus = 'pending' | 'running' | 'completed' | 'approved';

interface DiscoveryStore {
  // UI state maps
  expanded: Record<string, boolean>;
  status: Record<string, SubmoduleStatus>;
  result_count: Record<string, number>;

  // Actions
  toggleExpanded: (catKey: string) => void;
  setExpanded: (catKey: string, isExpanded: boolean) => void;
  setStatus: (submoduleId: string, status: SubmoduleStatus) => void;
  setResultCount: (submoduleId: string, count: number) => void;
  approveSubmodule: (submoduleId: string, resultCount: number) => void;
  reset: () => void;

  // Backwards compatibility aliases
  toggleCategory: (catKey: string) => void;
  setSubmoduleStatus: (submoduleId: string, status: SubmoduleStatus) => void;
  resetCategories: () => void;
}

export const useDiscoveryStore = create<DiscoveryStore>((set) => ({
  expanded: {},
  status: {},
  result_count: {},

  toggleExpanded: (catKey) =>
    set((state) => ({
      expanded: { ...state.expanded, [catKey]: !state.expanded[catKey] },
    })),

  setExpanded: (catKey, isExpanded) =>
    set((state) => ({
      expanded: { ...state.expanded, [catKey]: isExpanded },
    })),

  setStatus: (submoduleId, status) =>
    set((state) => ({
      status: { ...state.status, [submoduleId]: status },
    })),

  setResultCount: (submoduleId, count) =>
    set((state) => ({
      result_count: { ...state.result_count, [submoduleId]: count },
    })),

  approveSubmodule: (submoduleId, resultCount) =>
    set((state) => ({
      status: { ...state.status, [submoduleId]: 'approved' },
      result_count: { ...state.result_count, [submoduleId]: resultCount },
    })),

  reset: () => set({ expanded: {}, status: {}, result_count: {} }),

  // Backwards compatibility
  toggleCategory: (catKey) =>
    set((state) => ({
      expanded: { ...state.expanded, [catKey]: !state.expanded[catKey] },
    })),

  setSubmoduleStatus: (submoduleId, status) =>
    set((state) => ({
      status: { ...state.status, [submoduleId]: status },
    })),

  resetCategories: () => set({ expanded: {}, status: {}, result_count: {} }),
}));

// Re-export SubmoduleStatus type
export type { SubmoduleStatus };
