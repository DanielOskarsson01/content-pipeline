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
