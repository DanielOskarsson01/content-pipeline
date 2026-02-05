import { useParams, useNavigate } from 'react-router-dom';

/**
 * Hook to get project and run IDs from URL params.
 * This replaces storing these IDs in Zustand stores.
 *
 * URL patterns:
 * - /projects - no IDs selected
 * - /project/:projectId - project selected, no run
 * - /project/:projectId/run/:runId - project and run selected
 */
export function useUrlParams() {
  const { projectId, runId } = useParams<{ projectId?: string; runId?: string }>();
  const navigate = useNavigate();

  // Navigation helpers that update URL instead of Zustand state
  const selectProject = (id: string | null) => {
    if (id) {
      navigate(`/project/${id}`);
    } else {
      navigate('/projects');
    }
  };

  const selectRun = (projectId: string, runId: string) => {
    navigate(`/project/${projectId}/run/${runId}`);
  };

  const clearRun = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  return {
    projectId: projectId || null,
    runId: runId || null,
    selectProject,
    selectRun,
    clearRun,
  };
}
