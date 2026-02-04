import { create } from 'zustand';

export type PanelAccordion = 'input' | 'options' | 'results' | null;

// CSV Entity type
export interface CsvEntity {
  name: string;
  website: string;
  [key: string]: string;  // Allow additional columns
}

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

  // CSV input state (persisted across HMR)
  csvEntities: CsvEntity[];
  csvFileName: string | null;
  inputUrls: string;

  // Option values for submodule configuration
  optionValues: Record<string, string | number | boolean>;

  // Actions
  openSubmodulePanel: (submoduleId: string, categoryKey: string) => void;
  closeSubmodulePanel: () => void;
  setPanelAccordion: (accordion: PanelAccordion) => void;
  setSubmoduleState: (state: 'idle' | 'running' | 'completed') => void;
  setSubmoduleResults: (results: Array<{ id: string; url: string; entity_name: string }>) => void;
  setSubmoduleRunIds: (runId: string, submoduleRunId: string) => void;
  setCsvData: (entities: CsvEntity[], fileName: string) => void;
  clearCsvData: () => void;
  setInputUrls: (urls: string) => void;
  setOptionValue: (name: string, value: string | number | boolean) => void;
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
  csvEntities: [],
  csvFileName: null,
  inputUrls: '',
  optionValues: {},

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
      // Note: We preserve csvEntities and csvFileName across panel opens
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

  setCsvData: (entities, fileName) =>
    set({ csvEntities: entities, csvFileName: fileName, inputUrls: '' }),

  clearCsvData: () =>
    set({ csvEntities: [], csvFileName: null }),

  setInputUrls: (urls) =>
    set({ inputUrls: urls }),

  setOptionValue: (name, value) =>
    set((state) => ({
      optionValues: { ...state.optionValues, [name]: value },
    })),

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
      csvEntities: [],
      csvFileName: null,
      inputUrls: '',
      optionValues: {},
    }),
}));
