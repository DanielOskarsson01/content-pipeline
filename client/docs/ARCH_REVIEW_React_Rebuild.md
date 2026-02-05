# Architecture Review: React Client Rebuild

## Problem Statement

Current React client has 649+ lines of domain state in Zustand stores that should be in Supabase + TanStack Query. This causes:
- Data loss on page refresh
- Steps not receiving data from previous steps
- Mock mode hiding broken API integration
- No deep linking support

## Data Flow (Correct Design)

```
Step 1 (URL Discovery)
├── Input: CSV upload or manual URL entry
├── Execute: API call to /api/submodules/execute
├── Store output: API writes to Supabase (step_context table, step_index=1)
└── Approve: API marks submodule_run as approved

Step 2 (Validation)
├── Input: FETCH from Supabase via /api/runs/:runId/step-context?step_index=1
├── Execute: API call to /api/submodules/execute
├── Store output: API writes to Supabase (step_context table, step_index=2)
└── Approve: API marks submodule_run as approved

Step N...
└── Same pattern: Fetch previous step from Supabase, write results to Supabase
```

## State Classification

| Data | Current Location | Correct Location | Migration Action |
|------|------------------|------------------|------------------|
| `selectedProjectId` | pipelineStore | URL params `/project/:id` | Add React Router |
| `selectedRunId` | pipelineStore | URL params `/project/:pid/run/:rid` | Add React Router |
| `step1ApprovedUrls` | pipelineStore | TanStack Query (fetch from API) | DELETE from store |
| `stepStates` | pipelineStore | TanStack Query (derive from run data) | DELETE from store |
| `expandedStep` | pipelineStore | Keep in Zustand (UI state) | Keep |
| `expandedCategory` | pipelineStore | Keep in Zustand (UI state) | Keep |
| `enabledCategories` | pipelineStore | Keep in Zustand (UI preference) | Keep |
| `submodulePanelOpen` | panelStore | Keep in Zustand (UI state) | Keep |
| `activeSubmoduleId` | panelStore | Keep in Zustand (UI state) | Keep |
| `panelAccordion` | panelStore | Keep in Zustand (UI state) | Keep |
| `submoduleState` | panelStore | TanStack Query (mutation state) | Use `isPending` |
| `submoduleResults` | panelStore | TanStack Query | DELETE from store |
| `activeRunId` | panelStore | URL params | DELETE from store |
| `activeSubmoduleRunId` | panelStore | TanStack Query (from mutation response) | DELETE from store |
| `csvEntities` | panelStore | Local useState in Step1Panel | Move to component |
| `csvFileName` | panelStore | Local useState in Step1Panel | Move to component |
| `inputUrls` | panelStore | Local useState | Move to component |
| `optionValues` | panelStore | Local useState in SubmodulePanel | Move to component |

## New Files Needed

1. **`client/src/router.tsx`** - React Router setup with routes:
   - `/` - Project selection
   - `/project/:projectId` - Project dashboard
   - `/project/:projectId/run/:runId` - Run view with all steps
   - `/project/:projectId/run/:runId/step/:stepIndex` - Step detail view

2. **`client/src/hooks/useRunData.ts`** - TanStack Query hooks:
   - `useProject(projectId)` - Fetch project details
   - `useRuns(projectId)` - List runs for project
   - `useRun(runId)` - Fetch single run with step contexts
   - `useStepContext(runId, stepIndex)` - Already exists, keep
   - `useCreateRun()` - Mutation to create new run
   - `useExecuteSubmodule()` - Already exists, keep
   - `useApproveSubmoduleRun()` - Already exists, keep

3. **Simplified stores (UI state only):**

   **`panelStore.ts`** (~30 lines):
   ```typescript
   interface PanelStore {
     // Panel visibility
     submodulePanelOpen: boolean;
     activeSubmoduleId: string | null;
     activeCategoryKey: string | null;
     panelAccordion: 'input' | 'options' | 'results' | null;

     // Actions
     openSubmodulePanel: (id: string, category: string) => void;
     closeSubmodulePanel: () => void;
     setPanelAccordion: (accordion: PanelAccordion) => void;
   }
   ```

   **`pipelineStore.ts`** (~40 lines):
   ```typescript
   interface PipelineStore {
     // UI state only
     expandedStep: number | null;
     expandedCategory: string | null;
     enabledCategories: Record<string, boolean>;
     enabledValidationCategories: Record<string, boolean>;

     // Actions
     toggleStep: (step: number) => void;
     setExpandedCategory: (category: string | null) => void;
     toggleCategoryEnabled: (category: string) => void;
   }
   ```

## Refresh Test

**Can user bookmark any step and return tomorrow?**

Current: NO
- `selectedProjectId` lost on refresh
- `selectedRunId` lost on refresh
- `step1ApprovedUrls` lost on refresh
- `submoduleResults` lost on refresh

After rebuild: YES
- Project ID in URL: `/project/abc123`
- Run ID in URL: `/project/abc123/run/xyz789`
- Step data fetched from Supabase on mount
- Results fetched from Supabase on mount

## Implementation Order

1. **Add React Router** - Put IDs in URL
2. **Delete domain state from stores** - Remove ~500 lines
3. **Update Step1Panel** - Use local state for CSV, fetch/write via TanStack Query
4. **Update Step2Panel** - Fetch from previous step via `usePreviousStepContext`
5. **Remove mock mode** - Delete `useMockData` checks entirely
6. **Test refresh** - Verify each step survives page refresh

## Architecture Gate Check Results (Pre-Implementation)

```bash
# Current state (FAILING)
$ wc -l client/src/stores/*.ts
  123 panelStore.ts
  130 pipelineStore.ts
  253 total  # Should be <100

$ grep -r "approved.*Urls\|Results\|runData" client/src/stores/
  panelStore.ts:23:  submoduleResults: Array<...>  # VIOLATION
  pipelineStore.ts:17:  step1ApprovedUrls: StepResult[];  # VIOLATION

$ grep -r "useMockData" client/src/
  appStore.ts:9:  useMockData: true,  # VIOLATION - default true
  Step1Panel.tsx:  if (useMockData) {  # VIOLATION
  Step2Panel.tsx:  const inputUrls = useMockData ? step1ApprovedUrls : apiUrls;  # VIOLATION
```

## Approval

- [ ] User reviewed and approved this design
