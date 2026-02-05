import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/client';
import { AppHeader } from './components/layout/AppHeader';
import { Toast } from './components/layout/Toast';
import { Step1Panel } from './components/panels/Step1Panel';
import { Step2Panel } from './components/panels/Step2Panel';
import { Step0ProjectSetup } from './components/steps/Step0ProjectSetup';
import { Step1Discovery } from './components/steps/Step1Discovery';
import { Step2Validation } from './components/steps/Step2Validation';
import { StepContainer } from './components/steps/StepContainer';

// Root layout with header and providers
function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-5xl mx-auto p-6">
          <Outlet />
        </main>
        <Toast />
        <Step1Panel />
        <Step2Panel />
      </div>
    </QueryClientProvider>
  );
}

// Pipeline view - shows all steps for a project/run
function PipelineView() {
  return (
    <div className="space-y-2">
      <Step0ProjectSetup />
      <Step1Discovery />
      <Step2Validation />
      <StepContainer
        step={3}
        title="Content Extraction"
        description="Download and parse content from validated URLs"
        status="pending"
      >
        <p className="text-gray-500 text-sm">Coming next...</p>
      </StepContainer>
    </div>
  );
}

// Placeholder views for other tabs
function MonitorView() {
  return <div className="text-center py-12 text-gray-500">Monitor tab - Milestone 1.5</div>;
}

function ContentView() {
  return <div className="text-center py-12 text-gray-500">Content tab - later</div>;
}

function SettingsView() {
  return <div className="text-center py-12 text-gray-500">Settings tab - later</div>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      // Default redirect to projects
      { index: true, element: <Navigate to="/projects" replace /> },

      // Projects list / pipeline view
      { path: 'projects', element: <PipelineView /> },

      // Project with optional run - IDs in URL for deep linking
      { path: 'project/:projectId', element: <PipelineView /> },
      { path: 'project/:projectId/run/:runId', element: <PipelineView /> },

      // Other tabs
      { path: 'monitor', element: <MonitorView /> },
      { path: 'content', element: <ContentView /> },
      { path: 'settings', element: <SettingsView /> },
    ],
  },
]);
