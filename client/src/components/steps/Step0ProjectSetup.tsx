import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Project, type CreateProjectInput } from '../../api/client';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useAppStore } from '../../stores/appStore';
import { StepContainer } from './StepContainer';

const MOCK_PROJECTS: Project[] = [
  {
    id: 'mock-1',
    name: 'Betsson Profile',
    company_name: 'Betsson Group',
    website_url: 'https://betsson.com',
    created_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'mock-2',
    name: 'LeoVegas Profile',
    company_name: 'LeoVegas',
    website_url: 'https://leovegas.com',
    created_at: '2026-01-20T14:30:00Z',
  },
];

const MOCK_TEMPLATES = [
  { id: 'tpl-1', name: 'Company Profile', stages: ['discovery', 'validation', 'extraction'] },
  { id: 'tpl-2', name: 'News Monitoring', stages: ['discovery', 'validation'] },
];

type Mode = 'new' | 'existing';

export function Step0ProjectSetup() {
  const queryClient = useQueryClient();
  const { useMockData, showToast } = useAppStore();
  const { selectedProjectId, setSelectedProject, toggleStep } = usePipelineStore();

  const [mode, setMode] = useState<Mode>('new');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Fetch projects
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
    enabled: !useMockData,
  });

  const displayProjects = useMockData ? MOCK_PROJECTS : projects;
  const selectedProject = displayProjects.find((p) => p.id === selectedProjectId);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: api.createProject,
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setSelectedProject(newProject.id);
      showToast('Project created! Add input data in Step 1.', 'success');
      toggleStep(1);
    },
    onError: (error) => {
      showToast(error.message, 'error');
    },
  });

  const handleCreateProject = () => {
    const name = projectName.trim();
    if (!name) {
      showToast('Please enter a project name', 'error');
      return;
    }

    if (useMockData) {
      // Demo mode
      const mockId = `mock-${Date.now()}`;
      setSelectedProject(mockId);
      showToast('Project created! Add input data in Step 1.', 'success');
      setProjectName('');
      setProjectDescription('');
      toggleStep(1);
    } else {
      const input: CreateProjectInput = {
        name,
        company_name: name,
        website_url: '',
      };
      createMutation.mutate(input);
    }
  };

  const handleSelectProject = (projectId: string) => {
    if (!projectId) return;
    setSelectedProject(projectId);
    const project = displayProjects.find((p) => p.id === projectId);
    if (project) {
      showToast(`Selected: ${project.name}`, 'success');
      toggleStep(1);
    }
  };

  const status = selectedProject ? 'completed' : 'active';
  const resultSummary = selectedProject ? `Selected: ${selectedProject.name}` : undefined;

  return (
    <StepContainer
      step={0}
      title="Project Setup"
      description="Name your project, select template, and configure settings"
      status={status}
      resultSummary={resultSummary}
    >
      <div className="space-y-4">
        {/* Project Selection: New or Existing */}
        <div className="flex items-center gap-6 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="projectMode"
              value="new"
              checked={mode === 'new'}
              onChange={() => setMode('new')}
              className="w-4 h-4 text-sky-600 border-gray-300 focus:ring-sky-500"
            />
            <span className="text-sm text-gray-700">New Project</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="projectMode"
              value="existing"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
              className="w-4 h-4 text-sky-600 border-gray-300 focus:ring-sky-500"
            />
            <span className="text-sm text-gray-700">Existing Project</span>
          </label>
        </div>

        {/* New Project Form */}
        {mode === 'new' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Nordic Operators Q1 2026"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">
                Description
              </label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of this project's purpose..."
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">
                Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="">None (start from scratch)</option>
                {MOCK_TEMPLATES.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.stages.length} steps)
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                Templates pre-configure step settings for common workflows
              </p>
            </div>

            <button
              onClick={handleCreateProject}
              disabled={!projectName.trim() || createMutation.isPending}
              className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                projectName.trim() && !createMutation.isPending
                  ? 'bg-sky-600 hover:bg-sky-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        )}

        {/* Existing Project Dropdown */}
        {mode === 'existing' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">
                Select Project
              </label>
              {isLoading && !useMockData ? (
                <p className="text-sm text-gray-500">Loading projects...</p>
              ) : (
                <select
                  value={selectedProjectId || ''}
                  onChange={(e) => handleSelectProject(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                >
                  <option value="">-- Choose a project --</option>
                  {displayProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.company_name})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-[10px] text-gray-400">
              Continue working on an existing project
            </p>
          </div>
        )}

        {/* Current Project Info (shown when a project is selected) */}
        {selectedProject && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">
                  Active Project: {selectedProject.name}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  {selectedProject.company_name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-500 text-xl">✓</span>
              </div>
            </div>
          </div>
        )}

        {/* No Project Selected Warning */}
        {!selectedProject && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-yellow-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-yellow-700">
                Create or select a project above to continue to the next steps.
              </p>
            </div>
          </div>
        )}
      </div>
    </StepContainer>
  );
}
