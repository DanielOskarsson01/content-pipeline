import { useQuery } from '@tanstack/react-query';

export interface StepContextEntity {
  entity_name: string;
  url?: string;
  [key: string]: string | undefined;
}

export interface StepContextResponse {
  id: string;
  run_id: string;
  step_index: number;
  entities: StepContextEntity[];
  source_submodule: string | null;
  created_at: string;
  stats: {
    total: number;
    columns: string[];
    by_column: Record<string, number>;
  };
}

/**
 * Fetch the most recent run for a project
 */
export function useLatestRun(projectId: string | null) {
  return useQuery({
    queryKey: ['latest-run', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const response = await fetch(`/api/runs?project_id=${projectId}&limit=1`);
      if (!response.ok) throw new Error('Failed to fetch runs');
      const runs = await response.json();
      return runs[0] || null;
    },
    enabled: !!projectId,
    staleTime: 10_000,
  });
}

/**
 * Fetch step context data from a previous step
 *
 * Step 2 uses this to get URLs discovered in Step 1.
 * Step 3+ uses this to get validated URLs from Step 2, etc.
 *
 * @param runId - The pipeline run ID
 * @param stepIndex - The step index to fetch context for (1-indexed)
 */
export function useStepContext(runId: string | null, stepIndex: number) {
  return useQuery({
    queryKey: ['step-context', { runId, stepIndex }],
    queryFn: async (): Promise<StepContextResponse | null> => {
      if (!runId) return null;

      const response = await fetch(
        `/api/runs/${runId}/step-context?step_index=${stepIndex}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch step context');
      }

      const data = await response.json();
      return data; // May be null if no context exists
    },
    enabled: !!runId,
    staleTime: 30_000, // Cache for 30 seconds
  });
}

/**
 * Auto-fetch previous step data for the current step
 * Automatically finds the latest run for the project and fetches context from previousStep
 *
 * @param projectId - The project ID (required)
 * @param currentStep - The current step number (will fetch context from currentStep - 1)
 * @param explicitRunId - Optional explicit run ID (takes precedence over auto-fetch)
 */
export function usePreviousStepContext(
  projectId: string | null,
  currentStep: number,
  explicitRunId?: string | null
) {
  // First, get the latest run for the project (if no explicit runId provided)
  const { data: latestRun, isLoading: isLoadingRun } = useLatestRun(
    explicitRunId ? null : projectId
  );

  // Use explicit runId if provided, otherwise use latest run
  const effectiveRunId = explicitRunId || latestRun?.id || null;

  // Fetch context from previous step
  const previousStep = currentStep - 1;
  const {
    data: stepContext,
    isLoading: isLoadingContext,
    error,
  } = useStepContext(effectiveRunId, previousStep);

  return {
    runId: effectiveRunId,
    stepContext,
    isLoading: isLoadingRun || isLoadingContext,
    error,
  };
}

/**
 * Get URLs from step context for validation
 * Extracts URL array from entities for Step 2
 */
export function extractUrlsFromContext(
  context: StepContextResponse | null | undefined
): Array<{ url: string; entity_name: string }> {
  if (!context?.entities) return [];

  return context.entities
    .filter((e) => e.url)
    .map((e) => ({
      url: e.url!,
      entity_name: e.entity_name,
    }));
}
