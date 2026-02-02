import { QueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/appStore';

// Base API URL - defaults to same origin
const API_BASE = import.meta.env.VITE_API_URL || '';

// Create QueryClient with global config
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 30_000, // 30 seconds
    },
    mutations: {
      retry: 0, // No auto-retry for mutations
      onError: (error) => {
        const errorMessage = error instanceof Error ? error.message : 'An error occurred';
        useAppStore.getState().showToast(errorMessage, 'error');
      },
    },
  },
});

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// API methods
export const api = {
  // Projects
  getProjects: () => apiFetch<Project[]>('/api/projects'),
  createProject: (data: CreateProjectInput) =>
    apiFetch<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Runs
  getRuns: () => apiFetch<Run[]>('/api/runs'),
  getRun: (id: string) => apiFetch<Run>(`/api/runs/${id}`),
  startRun: (projectId: string) =>
    apiFetch<Run>(`/api/projects/${projectId}/start`, { method: 'POST' }),

  // Submodules
  getSubmoduleRuns: (runId: string) =>
    apiFetch<SubmoduleRun[]>(`/api/submodules/runs/${runId}`),
  getSubmoduleResults: (runId: string, submoduleRunId: string) =>
    apiFetch<SubmoduleResults>(`/api/submodules/runs/${runId}/${submoduleRunId}/results`),
  executeSubmodule: (data: ExecuteSubmoduleInput) =>
    apiFetch<SubmoduleRun>(`/api/submodules/discovery/${data.name}/execute`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Approvals
  approveResult: (runId: string, submoduleRunId: string, approvalId: string, approved: boolean) =>
    apiFetch(`/api/submodules/runs/${runId}/${submoduleRunId}/results/${approvalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ approved }),
    }),
  batchApprove: (runId: string, submoduleRunId: string, approvals: ApprovalInput[]) =>
    apiFetch(`/api/submodules/runs/${runId}/${submoduleRunId}/batch-approval`, {
      method: 'POST',
      body: JSON.stringify({ approvals }),
    }),
};

// Types
export interface Project {
  id: string;
  name: string;
  company_name: string;
  website_url: string;
  created_at: string;
}

export interface CreateProjectInput {
  name: string;
  company_name: string;
  website_url: string;
}

export interface Run {
  id: string;
  project_id: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  created_at: string;
}

export interface SubmoduleRun {
  id: string;
  run_id: string;
  submodule_name: string;
  status: 'pending' | 'running' | 'completed' | 'approved' | 'error';
  result_count: number;
  created_at: string;
}

export interface SubmoduleResults {
  submodule_run_id: string;
  results: ResultItem[];
  approval_status: Record<string, boolean>;
}

export interface ResultItem {
  id: string;
  url: string;
  entity_name: string;
  approval_id?: string;
  approved?: boolean;
}

export interface ExecuteSubmoduleInput {
  name: string;
  run_id: string;
  config?: Record<string, unknown>;
}

export interface ApprovalInput {
  approval_id: string;
  approved: boolean;
}
