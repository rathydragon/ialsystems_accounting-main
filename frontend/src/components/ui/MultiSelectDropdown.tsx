import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string; // e.g. "HANDLE BY"
  icon: React.ElementType;
  options: MultiSelectOption[];
  selected: string[]; // empty = all
  onChange: (next: string[]) => void;
  /** Classes for the trigger when something is selected */
  activeClass: string;
  /** Icon color when something is selected */
  activeIconClass: string;
  title?: string;
  className?: string;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label, icon: Icon, options, selected, onChange, activeClass, activeIconClass, title, className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (value: string) => {
    onChange(selectedSet.has(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };
  const allVisibleSelected = visible.length > 0 && visible.every(o => selectedSet.has(o.value));
  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      const hide = new Set(visible.map(o => o.value));
      onChange(selected.filter(v => !hide.has(v)));
    } else {
      onChange([...selected, ...visible.filter(o => !selectedSet.has(o.value)).map(o => o.value)]);
    }
  };

  const hasSelection = selected.length > 0;
  const triggerText = !hasSelection
    ? `${label} (ទាំងអស់)`
    : selected.length === 1
    ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
    : `${label} (${selected.length})`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          // Open toward the left when there is no room on the right (phones)
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect) setAlignRight(rect.left + Math.max(240, rect.width) > window.innerWidth - 8);
          setOpen(o => !o);
        }}
        title={hasSelection ? `${label}: ${selected.map(v => options.find(o => o.value === v)?.label ?? v).join(', ')}` : title}
        className={`w-full h-9 sm:h-8.5 pl-8 pr-6 rounded-lg text-xs text-left transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 border truncate ${
          hasSelection
            ? `${activeClass} font-bold shadow-xs`
            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-medium'
        } ${open ? 'ring-1 ring-blue-500' : ''}`}
      >
        <Icon className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${hasSelection ? activeIconClass : 'text-slate-400'}`} />
        <span className="block truncate">{triggerText}</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[8.5px]">▼</span>
      </button>

      {open && (
        <div className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full mt-1 z-50 w-full min-w-[240px] rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden`}>
          {/* Search */}
          <div className="p-1.5 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ស្វែងរក..."
                className="w-full h-8 pl-7 pr-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Select all / clear */}
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={toggleAllVisible}
              disabled={visible.length === 0}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 cursor-pointer"
            >
              {allVisibleSelected ? 'ដោះធីកទាំងអស់' : 'ជ្រើសទាំងអស់'}
            </button>
            {hasSelection && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                <X className="w-3 h-3" /> សម្អាត ({selected.length})
              </button>
            )}
          </div>

          {/* Options */}
          <ul className="max-h-72 overflow-y-auto custom-scrollbar py-1">
            {visible.length === 0 && (
              <li className="px-3 py-2 text-xs text-slate-400">រកមិនឃើញ</li>
            )}
            {visible.map(o => {
              const checked = selectedSet.has(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left cursor-pointer transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                      checked ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {checked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
