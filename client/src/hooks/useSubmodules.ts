import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SubmoduleRun, type SubmoduleResults } from '../api/client';
import { useAppStore } from '../stores/appStore';

// Mock data for demo mode
const MOCK_SUBMODULE_RUNS: SubmoduleRun[] = [];

const MOCK_RESULTS: SubmoduleResults = {
  submodule_run_id: 'mock-run-1',
  results: [
    { id: '1', url: 'https://betsson.com/about', entity_name: 'Betsson', approval_id: 'a1', approved: undefined },
    { id: '2', url: 'https://betsson.com/careers', entity_name: 'Betsson', approval_id: 'a2', approved: undefined },
    { id: '3', url: 'https://betsson.com/news', entity_name: 'Betsson', approval_id: 'a3', approved: true },
  ],
  approval_status: {},
};

// Fetch all submodule runs for a pipeline run
export function useSubmoduleRuns(runId: string | null) {
  const { useMockData } = useAppStore();

  return useQuery({
    queryKey: ['submoduleRuns', runId],
    queryFn: () => api.getSubmoduleRuns(runId!),
    enabled: !!runId && !useMockData,
    placeholderData: useMockData ? MOCK_SUBMODULE_RUNS : undefined,
  });
}

// Fetch results for a specific submodule run
export function useSubmoduleResults(runId: string | null, submoduleRunId: string | null) {
  const { useMockData } = useAppStore();

  return useQuery({
    queryKey: ['submoduleResults', runId, submoduleRunId],
    queryFn: () => api.getSubmoduleResults(runId!, submoduleRunId!),
    enabled: !!runId && !!submoduleRunId && !useMockData,
    placeholderData: useMockData ? MOCK_RESULTS : undefined,
  });
}

// Execute a submodule
export function useExecuteSubmodule() {
  const queryClient = useQueryClient();
  const { useMockData, showToast } = useAppStore();

  return useMutation({
    mutationFn: api.executeSubmodule,
    onSuccess: (_data, vars) => {
      // Invalidate submodule runs to show new status
      queryClient.invalidateQueries({ queryKey: ['submoduleRuns', vars.run_id] });
      showToast('Submodule started', 'success');
    },
    onMutate: async () => {
      // In demo mode, simulate execution
      if (useMockData) {
        showToast('Submodule running (demo)', 'info');
        // Simulate async completion
        setTimeout(() => {
          showToast('Submodule completed (demo)', 'success');
        }, 2000);
      }
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
      // Invalidate results to reflect new approval status
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

// Approve entire submodule run (saves all URLs to discovered_urls)
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
