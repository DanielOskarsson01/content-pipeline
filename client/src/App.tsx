import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/client';
import { AppHeader } from './components/layout/AppHeader';
import { Toast } from './components/layout/Toast';
import { Step1Panel } from './components/panels/Step1Panel';
import { Step0ProjectSetup } from './components/steps/Step0ProjectSetup';
import { Step1Discovery } from './components/steps/Step1Discovery';
import { StepContainer } from './components/steps/StepContainer';
import { useAppStore } from './stores/appStore';

function App() {
  const { activeTab } = useAppStore();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <AppHeader />

        <main className="max-w-5xl mx-auto p-6">
          {activeTab === 'projects' && (
            <div className="space-y-2">
              <Step0ProjectSetup />
              <Step1Discovery />

              {/* Placeholder steps */}
              <StepContainer
                step={2}
                title="Validation & Dedup"
                description="Filter by trust, authority, policy compliance, and remove duplicates"
                status="pending"
              >
                <p className="text-gray-500 text-sm">Coming next...</p>
              </StepContainer>

              <StepContainer
                step={3}
                title="Content Extraction"
                description="Download and parse content from validated URLs"
                status="pending"
              >
                <p className="text-gray-500 text-sm">Coming next...</p>
              </StepContainer>
            </div>
          )}

          {activeTab === 'monitor' && (
            <div className="text-center py-12 text-gray-500">Monitor tab - Milestone 1.5</div>
          )}

          {activeTab === 'content' && (
            <div className="text-center py-12 text-gray-500">Content tab - later</div>
          )}

          {activeTab === 'settings' && (
            <div className="text-center py-12 text-gray-500">Settings tab - later</div>
          )}
        </main>

        <Toast />
        <Step1Panel />
      </div>
    </QueryClientProvider>
  );
}

export default App;
