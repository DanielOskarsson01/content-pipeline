import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Project, type CreateProjectInput } from '../../api/client';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useAppStore } from '../../stores/appStore';
import { useUrlParams } from '../../hooks/useUrlParams';
import { StepContainer } from './StepContainer';

const TEMPLATES = [
  { id: 'tpl-1', name: 'Company Profile', stages: ['discovery', 'validation', 'extraction'] },
  { id: 'tpl-2', name: 'News Monitoring', stages: ['discovery', 'validation'] },
];

type Mode = 'new' | 'existing';

export function Step0ProjectSetup() {
  const queryClient = useQueryClient();
  const { showToast } = useAppStore();
  const { toggleStep } = usePipelineStore();
  const { projectId, selectProject } = useUrlParams();

  const [mode, setMode] = useState<Mode>('new');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Fetch projects from API
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
  });

  const selectedProject = projects.find((p) => p.id === projectId);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: api.createProject,
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      selectProject(newProject.id);
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

    const input: CreateProjectInput = {
      name,
      company_name: name,
      project_type: 'company_profile',
    };
    createMutation.mutate(input);
  };

  const handleSelectProject = (selectedId: string) => {
    if (!selectedId) return;
    selectProject(selectedId);
    const project = projects.find((p) => p.id === selectedId);
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
              <label className="block text-xs text-gray-600 mb-1 font-medium">Description</label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={2}
                placeholder="Brief description..."
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">Template</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="">None (start from scratch)</option>
                {TEMPLATES.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                ))}
              </select>
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

        {mode === 'existing' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">Select Project</label>
              {isLoading ? (
                <p className="text-sm text-gray-500">Loading projects...</p>
              ) : (
                <select
                  value={projectId || ''}
                  onChange={(e) => handleSelectProject(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                >
                  <option value="">-- Choose a project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.company_name})</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {selectedProject && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-green-800">Active: {selectedProject.name}</p>
            <p className="text-xs text-green-600 mt-1">{selectedProject.company_name}</p>
          </div>
        )}

        {!selectedProject && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
            <p className="text-sm text-yellow-700">Create or select a project to continue.</p>
          </div>
        )}
      </div>
    </StepContainer>
  );
}
