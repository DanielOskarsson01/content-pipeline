import { NavLink } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';

const TABS = [
  { path: '/projects', label: 'Projects' },
  { path: '/monitor', label: 'Monitor' },
  { path: '/content', label: 'Content' },
  { path: '/settings', label: 'Settings' },
];

export function AppHeader() {
  const { useMockData, setUseMockData } = useAppStore();

  return (
    <header className="bg-white border-b border-gray-200">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3">
        {/* Logo and version */}
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">
            Content Pipeline
          </h1>
          <span className="px-2 py-0.5 text-xs font-medium bg-brand-600 text-white rounded">
            v1.0
          </span>
        </div>

        {/* Demo/Live Toggle */}
        <div className="flex items-center gap-3">
          <span className={`text-sm ${useMockData ? 'text-gray-400' : 'text-green-600 font-medium'}`}>
            Live
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={useMockData}
            onClick={() => setUseMockData(!useMockData)}
            className={`
              relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2
              ${useMockData ? 'bg-brand-600' : 'bg-gray-200'}
            `}
          >
            <span
              className={`
                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                transition duration-200 ease-in-out
                ${useMockData ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
          <span className={`text-sm ${useMockData ? 'text-brand-600 font-medium' : 'text-gray-400'}`}>
            Demo
          </span>
        </div>
      </div>

      {/* Tab navigation */}
      <nav className="flex px-6 border-t border-gray-100">
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) => `
              px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${isActive
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
