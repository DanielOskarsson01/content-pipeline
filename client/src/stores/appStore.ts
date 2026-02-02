import { create } from 'zustand';

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppStore {
  // UI State
  activeTab: string;
  useMockData: boolean;
  toast: Toast | null;

  // Actions
  setActiveTab: (tab: string) => void;
  setUseMockData: (useMock: boolean) => void;
  showToast: (message: string, type?: Toast['type']) => void;
  hideToast: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Initial state
  activeTab: 'projects',
  useMockData: true, // Start in demo mode
  toast: null,

  // Actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setUseMockData: (useMock) => set({ useMockData: useMock }),
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } });
    // Auto-hide after 3 seconds
    setTimeout(() => set({ toast: null }), 3000);
  },
  hideToast: () => set({ toast: null }),
}));
