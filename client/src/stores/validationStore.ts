import { create } from 'zustand';
import type { Submodule, Category, Categories } from '../types/step';

// Re-export types for backwards compatibility
export type { Submodule, Category, Categories };

// Step 2 categories - filtering and deduplication
const INITIAL_CATEGORIES: Categories = {
  filtering: {
    label: 'Filtering',
    icon: '🔍',
    description: 'Remove unwanted URLs by path or content type',
    enabled: true,
    expanded: false,
    submodules: [
      {
        id: 'path-filter',
        name: 'Path Filter',
        description: 'Filter by URL path patterns (exclude /login, /api, etc.)',
        cost: 'cheap',
        status: 'pending',
        result_count: 0,
      },
      {
        id: 'content-type-filter',
        name: 'Content Type',
        description: 'Filter by file extension (.pdf, .jpg, etc.)',
        cost: 'cheap',
        status: 'pending',
        result_count: 0,
      },
    ],
  },
  dedup: {
    label: 'Deduplication',
    icon: '🔄',
    description: 'Remove duplicate URLs',
    enabled: false,
    expanded: false,
    submodules: [
      {
        id: 'exact-dedup',
        name: 'Exact Match',
        description: 'Remove identical URLs (with normalization)',
        cost: 'cheap',
        status: 'pending',
        result_count: 0,
      },
      {
        id: 'fuzzy-dedup',
        name: 'Fuzzy Match',
        description: 'Remove near-duplicate URLs (same page, different params)',
        cost: 'medium',
        status: 'pending',
        result_count: 0,
      },
    ],
  },
};

interface ValidationStore {
  categories: Categories;

  // Actions
  toggleCategory: (catKey: string) => void;
  approveSubmodule: (submoduleId: string, resultCount: number) => void;
  setSubmoduleStatus: (submoduleId: string, status: Submodule['status']) => void;
  resetCategories: () => void;
}

export const useValidationStore = create<ValidationStore>((set) => ({
  categories: INITIAL_CATEGORIES,

  toggleCategory: (catKey) =>
    set((state) => ({
      categories: {
        ...state.categories,
        [catKey]: {
          ...state.categories[catKey],
          expanded: !state.categories[catKey].expanded,
        },
      },
    })),

  approveSubmodule: (submoduleId, resultCount) =>
    set((state) => {
      const newCategories = { ...state.categories };
      for (const catKey in newCategories) {
        const cat = newCategories[catKey];
        const subIndex = cat.submodules.findIndex((s) => s.id === submoduleId);
        if (subIndex !== -1) {
          newCategories[catKey] = {
            ...cat,
            submodules: cat.submodules.map((s, i) =>
              i === subIndex
                ? { ...s, status: 'approved' as const, result_count: resultCount }
                : s
            ),
          };
          break;
        }
      }
      return { categories: newCategories };
    }),

  setSubmoduleStatus: (submoduleId, status) =>
    set((state) => {
      const newCategories = { ...state.categories };
      for (const catKey in newCategories) {
        const cat = newCategories[catKey];
        const subIndex = cat.submodules.findIndex((s) => s.id === submoduleId);
        if (subIndex !== -1) {
          newCategories[catKey] = {
            ...cat,
            submodules: cat.submodules.map((s, i) =>
              i === subIndex ? { ...s, status } : s
            ),
          };
          break;
        }
      }
      return { categories: newCategories };
    }),

  resetCategories: () =>
    set({ categories: INITIAL_CATEGORIES }),
}));

// Helper to get submodule info by ID
export function getSubmoduleById(
  categories: Categories,
  submoduleId: string
): { submodule: Submodule; category: Category } | null {
  for (const catKey in categories) {
    const cat = categories[catKey];
    const sub = cat.submodules.find((s) => s.id === submoduleId);
    if (sub) {
      return { submodule: sub, category: cat };
    }
  }
  return null;
}
