import type { Categories, Category, Submodule } from '../../types/step';

interface CategoryCardGridProps {
  categories: Categories;
  onToggleCategory: (catKey: string) => void;
  onSubmoduleClick: (submodule: Submodule, category: Category) => void;
  getApprovedCount: (cat: Category) => number;
}

export function CategoryCardGrid({
  categories,
  onToggleCategory,
  onSubmoduleClick,
  getApprovedCount,
}: CategoryCardGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {Object.entries(categories).map(([catKey, cat]) => (
        <div
          key={catKey}
          className={`rounded-lg border transition-all ${
            cat.expanded
              ? 'border-dashed border-2 border-sky-400 bg-white'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          {/* Category Header (always visible) */}
          <div
            className="p-3 cursor-pointer"
            onClick={() => onToggleCategory(catKey)}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{cat.icon}</span>
              <p className="text-sm font-semibold text-gray-800">{cat.label}</p>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              {getApprovedCount(cat)}/{cat.submodules.length} submodules
            </p>
          </div>

          {/* Inline Submodules (shown when expanded) */}
          {cat.expanded && (
            <div className="border-t border-gray-200">
              <p className="text-[10px] text-gray-500 font-medium uppercase px-3 pt-2">
                Submodules
              </p>
              <div className="p-2 space-y-1">
                {cat.submodules.map((sub) => (
                  <div
                    key={sub.id}
                    className={`flex items-center justify-between p-2 rounded hover:bg-gray-50 cursor-pointer group ${
                      sub.status === 'approved'
                        ? 'bg-green-50 border border-green-200'
                        : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSubmoduleClick(sub, cat);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sub.status === 'approved'}
                        readOnly
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 text-cyan-600"
                      />
                      <div>
                        <p
                          className={`text-sm ${
                            sub.status === 'approved'
                              ? 'text-pink-600 font-medium'
                              : 'text-gray-700'
                          }`}
                        >
                          {sub.name}
                          {sub.status === 'approved' && sub.result_count > 0 && (
                            <span className="ml-2 text-xs text-green-600">
                              ({sub.result_count} URLs)
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {sub.description}
                        </p>
                      </div>
                    </div>
                    {/* Arrow icon */}
                    <svg
                      className="w-5 h-5 text-pink-600 opacity-50 group-hover:opacity-100"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
