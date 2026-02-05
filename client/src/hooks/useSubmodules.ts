import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppStore } from '../stores/appStore';

// ============================================
// Submodule Metadata (Server-owned categories)
// ============================================

interface SubmoduleOption {
  name: string;
  type: 'select' | 'boolean' | 'number' | 'array';
  values?: unknown[];
  default: unknown;
  description?: string;
}

interface Submodule {
  id: string;
  name: string;
  description: string;
  cost: 'cheap' | 'medium' | 'expensive';
  options: SubmoduleOption[];
}

interface Category {
  label: string;
  icon: string;
  description: string;
  step: number;
  order: number;
  submodules: Submodule[];
}

interface SubmodulesResponse {
  success: boolean;
  categories: Record<string, Category>;
}

async function fetchSubmoduleMetadata(): Promise<Record<string, Category>> {
  const res = await fetch('/api/submodules');
  if (!res.ok) throw new Error('Failed to fetch submodule metadata');
  const data: SubmodulesResponse = await res.json();
  return data.categories;
}

// Fetch all submodule metadata (categories with submodules)
export function useSubmoduleMetadata() {
  return useQuery({
    queryKey: ['submoduleMetadata'],
    queryFn: fetchSubmoduleMetadata,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Filter categories by step number
export function useStepCategories(stepIndex: number) {
  const { data, isLoading, error } = useSubmoduleMetadata();

  if (isLoading || error || !data) {
    return { categories: {} as Record<string, Category>, isLoading, error };
  }

  const filtered = Object.fromEntries(
    Object.entries(data).filter(([, cat]) => cat.step === stepIndex)
  );

  return { categories: filtered, isLoading: false, error: null };
}

// Export types for use in components
export type { Submodule, SubmoduleOption, Category };

// ============================================
// Submodule Execution & Results
// ============================================

// Fetch all submodule runs for a pipeline run
export function useSubmoduleRuns(runId: string | null) {
  return useQuery({
    queryKey: ['submoduleRuns', runId],
    queryFn: () => api.getSubmoduleRuns(runId!),
    enabled: !!runId,
  });
}

// Fetch results for a specific submodule run
export function useSubmoduleResults(runId: string | null, submoduleRunId: string | null) {
  return useQuery({
    queryKey: ['submoduleResults', runId, submoduleRunId],
    queryFn: () => api.getSubmoduleResults(runId!, submoduleRunId!),
    enabled: !!runId && !!submoduleRunId,
  });
}

// Execute a submodule
export function useExecuteSubmodule() {
  const queryClient = useQueryClient();
  const { showToast } = useAppStore();

  return useMutation({
    mutationFn: async (data: Parameters<typeof api.executeSubmodule>[0]) => {
      const response = await api.executeSubmodule(data);
      return response;
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['submoduleRuns', vars.run_id] });
      showToast('Submodule started', 'success');
    },
    onError: (error) => {
      console.error('[useExecuteSubmodule] Error:', error);
    },
  });
}

// Approve/reject a single result
export function useApproveResult() {
  const queryClient = useQueryClient();
  const { showToast } = useAppStore();

  return useMutation({
    mutationFn: ({
      runId,
      submoduleRunId,
      approvalId,
      approved,
    }: {
      runId: string;
      submoduleRunId: string;
      approvalId: string;
      approved: boolean;
    }) => api.approveResult(runId, submoduleRunId, approvalId, approved),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['submoduleResults', variables.runId, variables.submoduleRunId],
      });
      showToast(variables.approved ? 'Approved' : 'Rejected', 'success');
    },
  });
}

// Batch approve/reject
export function useBatchApprove() {
  const queryClient = useQueryClient();
  const { showToast } = useAppStore();

  return useMutation({
    mutationFn: ({
      runId,
      submoduleRunId,
      approvals,
    }: {
      runId: string;
      submoduleRunId: string;
      approvals: { approval_id: string; approved: boolean }[];
    }) => api.batchApprove(runId, submoduleRunId, approvals),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['submoduleResults', variables.runId, variables.submoduleRunId],
      });
      queryClient.invalidateQueries({
        queryKey: ['submoduleRuns', variables.runId],
      });
      showToast('Batch approval complete', 'success');
    },
  });
}

// Start a pipeline run for a project
export function useStartRun() {
  const queryClient = useQueryClient();
  const { showToast } = useAppStore();

  return useMutation({
    mutationFn: (projectId: string) => api.startRun(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      showToast('Run started', 'success');
    },
  });
}

// Approve entire submodule run
export function useApproveSubmoduleRun() {
  const queryClient = useQueryClient();
  const { showToast } = useAppStore();

  return useMutation({
    mutationFn: async ({
      runId,
      submoduleRunId,
    }: {
      runId: string;
      submoduleRunId: string;
    }) => {
      const response = await fetch(`/api/submodules/runs/${runId}/${submoduleRunId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to approve');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['submoduleRuns', variables.runId],
      });
      showToast('Submodule approved', 'success');
    },
  });
}
