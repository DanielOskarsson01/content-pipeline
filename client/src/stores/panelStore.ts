import { create } from 'zustand';

export type PanelAccordion = 'input' | 'options' | 'results' | null;

interface PanelStore {
  // Panel visibility
  submodulePanelOpen: boolean;
  activeSubmoduleId: string | null;
  activeCategoryKey: string | null;

  // Accordion state
  panelAccordion: PanelAccordion;

  // Submodule execution state
  submoduleState: 'idle' | 'running' | 'completed';
  submoduleResults: Array<{ id: string; url: string; entity_name: string }>;

  // API tracking (for approval flow)
  activeRunId: string | null;
  activeSubmoduleRunId: string | null;

  // Actions
  openSubmodulePanel: (submoduleId: string, categoryKey: string) => void;
  closeSubmodulePanel: () => void;
  setPanelAccordion: (accordion: PanelAccordion) => void;
  setSubmoduleState: (state: 'idle' | 'running' | 'completed') => void;
  setSubmoduleResults: (results: Array<{ id: string; url: string; entity_name: string }>) => void;
  setSubmoduleRunIds: (runId: string, submoduleRunId: string) => void;
  resetPanelState: () => void;
}

export const usePanelStore = create<PanelStore>((set) => ({
  submodulePanelOpen: false,
  activeSubmoduleId: null,
  activeCategoryKey: null,
  panelAccordion: 'input',
  submoduleState: 'idle',
  submoduleResults: [],
  activeRunId: null,
  activeSubmoduleRunId: null,

  openSubmodulePanel: (submoduleId, categoryKey) =>
    set({
      submodulePanelOpen: true,
      activeSubmoduleId: submoduleId,
      activeCategoryKey: categoryKey,
      panelAccordion: 'input',
      submoduleState: 'idle',
      submoduleResults: [],
      activeRunId: null,
      activeSubmoduleRunId: null,
    }),

  closeSubmodulePanel: () =>
    set({
      submodulePanelOpen: false,
    }),

  setPanelAccordion: (accordion) =>
    set({ panelAccordion: accordion }),

  setSubmoduleState: (state) =>
    set({ submoduleState: state }),

  setSubmoduleResults: (results) =>
    set({ submoduleResults: results }),

  setSubmoduleRunIds: (runId, submoduleRunId) =>
    set({ activeRunId: runId, activeSubmoduleRunId: submoduleRunId }),

  resetPanelState: () =>
    set({
      submodulePanelOpen: false,
      activeSubmoduleId: null,
      activeCategoryKey: null,
      panelAccordion: 'input',
      submoduleState: 'idle',
      submoduleResults: [],
      activeRunId: null,
      activeSubmoduleRunId: null,
    }),
}));
