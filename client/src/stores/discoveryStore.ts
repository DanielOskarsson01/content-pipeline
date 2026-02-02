import { create } from 'zustand';
import type { Submodule, Category, Categories } from '../types/step';

// Re-export types for backwards compatibility
export type { Submodule, Category, Categories };

// Initial categories data (matches original Alpine data)
const INITIAL_CATEGORIES: Categories = {
  website: {
    label: 'Website',
    icon: '🌐',
    description: 'Find URLs from company websites',
    enabled: true,
    expanded: false,
    submodules: [
      { id: 'sitemap', name: 'Sitemap', description: 'Parse sitemap.xml to find URLs', cost: 'cheap', status: 'pending', result_count: 0 },
      { id: 'navigation', name: 'Navigation', description: 'Extract links from site navigation', cost: 'cheap', status: 'pending', result_count: 0 },
      { id: 'seed-expansion', name: 'Seed Expansion', description: 'Expand from seed URLs', cost: 'cheap', status: 'pending', result_count: 0 },
    ],
  },
  news: {
    label: 'News',
    icon: '📰',
    description: 'Find news and press releases',
    enabled: false,
    expanded: false,
    submodules: [
      { id: 'rss-feeds', name: 'RSS Feeds', description: 'Parse RSS/Atom feeds', cost: 'cheap', status: 'pending', result_count: 0 },
      { id: 'news-search', name: 'News Search', description: 'Search news APIs', cost: 'medium', status: 'pending', result_count: 0 },
    ],
  },
  linkedin: {
    label: 'LinkedIn',
    icon: '💼',
    description: 'Company profiles and posts',
    enabled: false,
    expanded: false,
    submodules: [
      { id: 'linkedin-company', name: 'Company Page', description: 'Scrape company profile', cost: 'medium', status: 'pending', result_count: 0 },
      { id: 'linkedin-posts', name: 'Posts', description: 'Fetch recent posts', cost: 'medium', status: 'pending', result_count: 0 },
    ],
  },
  youtube: {
    label: 'YouTube',
    icon: '🎬',
    description: 'Videos and channel content',
    enabled: false,
    expanded: false,
    submodules: [
      { id: 'youtube-channel', name: 'Channel Videos', description: 'List channel videos', cost: 'cheap', status: 'pending', result_count: 0 },
      { id: 'youtube-search', name: 'YouTube Search', description: 'Search for videos', cost: 'medium', status: 'pending', result_count: 0 },
    ],
  },
  twitter: {
    label: 'Twitter/X',
    icon: '🐦',
    description: 'Profile and tweets',
    enabled: false,
    expanded: false,
    submodules: [
      { id: 'twitter-profile', name: 'Profile', description: 'Fetch profile & tweets', cost: 'medium', status: 'pending', result_count: 0 },
    ],
  },
  search: {
    label: 'Search',
    icon: '🔍',
    description: 'General web search (fallback)',
    enabled: false,
    expanded: false,
    submodules: [
      { id: 'search-google', name: 'Google Search', description: 'General web search', cost: 'expensive', status: 'pending', result_count: 0 },
    ],
  },
};

interface DiscoveryStore {
  categories: Categories;

  // Actions
  toggleCategory: (catKey: string) => void;
  approveSubmodule: (submoduleId: string, resultCount: number) => void;
  setSubmoduleStatus: (submoduleId: string, status: Submodule['status']) => void;
  resetCategories: () => void;
}

export const useDiscoveryStore = create<DiscoveryStore>((set) => ({
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
