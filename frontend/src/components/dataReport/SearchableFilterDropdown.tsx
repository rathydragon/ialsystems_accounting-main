import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SearchableFilterDropdownProps {
  label: string;
  allLabel?: string;
  selected: string[];
  onChange: (val: string[]) => void;
  options: string[];
}

export const SearchableFilterDropdown: React.FC<SearchableFilterDropdownProps> = ({
  label,
  allLabel,
  selected,
  onChange,
  options
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Filtered list based on search query
  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase().trim();
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, query]);

  const isSelected = selected.length > 0;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleOption = (opt: string) => {
    if (selectedSet.has(opt)) {
      onChange(selected.filter((item) => item !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const handleSelectAllFiltered = () => {
    const allFilteredSelected =
      filteredOptions.length > 0 && filteredOptions.every((opt) => selectedSet.has(opt));
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredOptions);
      onChange(selected.filter((item) => !filteredSet.has(item)));
    } else {
      const combined = Array.from(new Set([...selected, ...filteredOptions]));
      onChange(combined);
    }
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Compact chip trigger: "Label" when idle, "Label: value +N" when filtered */}
      <div
        className={`h-8 inline-flex items-center rounded-lg border text-xs transition ${
          isSelected
            ? 'bg-blue-50 border-blue-300 dark:bg-blue-950/60 dark:border-blue-700 text-blue-700 dark:text-blue-300'
            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            setQuery('');
          }}
          title={isSelected ? selected.join(', ') : `${label} (${options.length})`}
          className={`h-full flex items-center gap-1 cursor-pointer min-w-0 ${isSelected ? 'pl-2.5 pr-1' : 'px-2.5'}`}
        >
          <span className={isSelected ? 'font-medium' : ''}>{label}</span>
          {isSelected && (
            <>
              <span className="text-blue-400">:</span>
              <span className="max-w-[120px] truncate font-semibold">{selected[0]}</span>
              {selected.length > 1 && (
                <span className="px-1 rounded bg-blue-600 text-white text-[10px] font-bold leading-4">
                  +{selected.length - 1}
                </span>
              )}
            </>
          )}
          {!isSelected && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          )}
        </button>
        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClearAll();
            }}
            className="h-full pr-2 pl-0.5 flex items-center text-blue-400 hover:text-rose-500 cursor-pointer"
            title="លុបការចម្រាញ់"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-68 max-w-[90vw] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col">
          {/* Search Box & Actions */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 space-y-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={`ស្វែងរក ${label} (${options.length})...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-7 h-7 rounded-md text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center justify-between text-[11px] pt-0.5 px-0.5">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
              >
                {filteredOptions.length > 0 && filteredOptions.every((opt) => selectedSet.has(opt))
                  ? 'ដោះធីកទាំងអស់ (Deselect)'
                  : 'ជ្រើសទាំងអស់ (Select All)'}
              </button>
              {isSelected && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-rose-500 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                >
                  សម្អាត (Clear)
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto custom-scrollbar p-1 text-xs">
            {/* 'ALL' option */}
            <button
              type="button"
              onClick={handleClearAll}
              className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer mb-0.5 ${
                !isSelected
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <div
                  className={`w-3.5 h-3.5 rounded flex items-center justify-center transition shrink-0 ${
                    !isSelected
                      ? 'bg-blue-600 border border-blue-600 text-white'
                      : 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                  }`}
                >
                  {!isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </div>
                <span className="truncate">{allLabel || `គ្រប់ ${label} (All)`}</span>
              </div>
              {!isSelected && (
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                  សកម្ម
                </span>
              )}
            </button>

            {/* Filtered Options */}
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs">
                មិនមាន "{query}" ឡើយ
              </div>
            ) : (
              filteredOptions.slice(0, 150).map((opt) => {
                const isItemActive = selectedSet.has(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleOption(opt)}
                    className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer ${
                      isItemActive
                        ? 'bg-blue-50/80 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center transition shrink-0 ${
                          isItemActive
                            ? 'bg-blue-600 border border-blue-600 text-white shadow-2xs'
                            : 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isItemActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <span className="truncate">{opt}</span>
                    </div>
                  </button>
                );
              })
            )}

            {filteredOptions.length > 150 && (
              <div className="px-2.5 py-1 text-[10px] text-slate-400 text-center border-t border-slate-100 dark:border-slate-800 mt-1">
                បង្ហាញ 150 នៃ {filteredOptions.length} (សូមវាយអក្សរដើម្បីស្វែងរកបន្ថែម)
              </div>
            )}
          </div>

          {/* Footer with summary and Done button */}
          <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {isSelected ? `បានជ្រើស ${selected.length}` : 'គ្រប់ទាំងអស់'}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-2xs transition"
            >
              រួចរាល់ (Done)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
