import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';

export interface CsvEntity {
  name: string;
  website: string;
  [key: string]: string;  // Allow additional columns
}

export interface CsvUploadInputProps {
  onEntitiesLoaded: (entities: CsvEntity[], fileName: string) => void;
  onClear: () => void;
  currentFileName: string | null;
  currentEntities: CsvEntity[];
  requiredColumns?: string[];  // Default: ['name', 'website']
  onError?: (message: string) => void;
}

// Column name aliases for flexible CSV headers
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['name', 'company', 'company_name', 'entity', 'entity_name'],
  website: ['website', 'url', 'domain', 'website_url', 'site'],
};

/**
 * Parse CSV content into entities
 * Handles BOM, various line endings, and flexible column names
 */
function parseCsv(content: string, requiredColumns: string[] = ['name', 'website']): CsvEntity[] {
  // Remove BOM if present
  let cleanContent = content;
  if (cleanContent.charCodeAt(0) === 0xFEFF) {
    cleanContent = cleanContent.slice(1);
  }

  // Normalize line endings
  cleanContent = cleanContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into lines
  const lines = cleanContent.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Parse headers
  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  // Find column indices using aliases
  const columnIndices: Record<string, number> = {};
  for (const col of requiredColumns) {
    const aliases = COLUMN_ALIASES[col] || [col];
    const idx = headers.findIndex((h) => aliases.includes(h));
    columnIndices[col] = idx !== -1 ? idx : requiredColumns.indexOf(col);
  }

  // Parse data rows
  const entities: CsvEntity[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());

    const entity: CsvEntity = { name: '', website: '' };
    let hasRequiredFields = true;

    for (const col of requiredColumns) {
      const value = cols[columnIndices[col]] || '';
      entity[col] = value;
      if (!value) hasRequiredFields = false;
    }

    if (hasRequiredFields) {
      entities.push(entity);
    }
  }

  return entities;
}

export function CsvUploadInput({
  onEntitiesLoaded,
  onClear,
  currentFileName,
  currentEntities,
  requiredColumns = ['name', 'website'],
  onError,
}: CsvUploadInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      onError?.('Please upload a CSV file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const entities = parseCsv(content, requiredColumns);

      if (entities.length === 0) {
        onError?.('No valid entities found in CSV');
        return;
      }

      onEntitiesLoaded(entities, file.name);
    };
    reader.onerror = () => {
      onError?.('Failed to read file');
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    onClear();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Show loaded CSV preview
  if (currentFileName) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-600">📄</span>
            <div>
              <p className="text-sm font-medium text-green-800">{currentFileName}</p>
              <p className="text-xs text-green-600">{currentEntities.length} entities loaded</p>
            </div>
          </div>
          <button
            onClick={handleClear}
            className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
          >
            Remove
          </button>
        </div>
        {/* Preview first few entities */}
        <div className="mt-2 pt-2 border-t border-green-200">
          <p className="text-[10px] text-green-600 mb-1">Preview:</p>
          <div className="space-y-0.5">
            {currentEntities.slice(0, 3).map((e, i) => (
              <p key={i} className="text-xs text-gray-600 truncate">
                {e.name} — {e.website}
              </p>
            ))}
            {currentEntities.length > 3 && (
              <p className="text-xs text-gray-400">...and {currentEntities.length - 3} more</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show drag-drop upload zone
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
        isDragging
          ? 'border-[#0891B2] bg-[#0891B2]/5'
          : 'border-gray-300 hover:border-[#0891B2]'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />
      <p className="text-xs text-gray-500">
        {isDragging ? 'Drop CSV here' : 'Drop CSV or click to browse'}
      </p>
      <p className="text-[10px] text-gray-400 mt-1">
        Columns: {requiredColumns.join(', ')}
      </p>
    </div>
  );
}
