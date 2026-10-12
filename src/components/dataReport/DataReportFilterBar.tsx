import React from 'react';
import {
  Search,
  ScanBarcode,
  X,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  Table2,
  LayoutGrid,
  Columns,
  Eye,
  EyeOff,
  Calendar,
  Check
} from 'lucide-react';
import { SheetColumnDef } from '../../utils/googleSheetFetcher';
import { SearchableFilterDropdown } from './SearchableFilterDropdown';
import { TableDensity, ViewMode } from './types';

interface DataReportFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenBarcodeScanner: () => void;
  columns: SheetColumnDef[];
  selectedColumnFilter: string;
  onSelectColumnFilter: (colId: string) => void;
  // Advanced Filter Panel
  isFilterPanelOpen: boolean;
  onToggleFilterPanel: () => void;
  activeFilterCount: number;
  onResetFilters: () => void;
  // Options & Selections
  uniqueShippers: string[];
  selectedShipper: string[];
  onShipperChange: (val: string[]) => void;
  uniqueDestinations: string[];
  selectedDestination: string[];
  onDestinationChange: (val: string[]) => void;
  uniqueReDests: string[];
  selectedReDest: string[];
  onReDestChange: (val: string[]) => void;
  uniqueOrigins: string[];
  selectedOrigin: string[];
  onOriginChange: (val: string[]) => void;
  uniqueStatuses: string[];
  selectedStatusVal: string[];
  onStatusValChange: (val: string[]) => void;
  uniqueCustomersCare: string[];
  selectedCustomersCare: string[];
  onCustomersCareChange: (val: string[]) => void;
  filterStartDate: string;
  onStartDateChange: (val: string[]) => void;
  filterEndDate: string;
  onEndDateChange: (val: string[]) => void;
  // View & Density & Columns
  tableDensity: TableDensity;
  onSetTableDensity: (d: TableDensity) => void;
  viewMode: ViewMode;
  onSetViewMode: (m: ViewMode) => void;
  hiddenColumnIds: string[];
  onToggleColumnVisibility: (id: string) => void;
  onHideEmptyColumns: () => void;
  onShowAllColumns: () => void;
  isColumnDropdownOpen: boolean;
  setIsColumnDropdownOpen: (open: boolean) => void;
  columnDropdownRef: React.RefObject<HTMLDivElement | null>;
  emptyColumnIds: Set<string>;
}

export const DataReportFilterBar: React.FC<DataReportFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenBarcodeScanner,
  columns,
  selectedColumnFilter,
  onSelectColumnFilter,
  isFilterPanelOpen,
  onToggleFilterPanel,
  activeFilterCount,
  onResetFilters,
  uniqueShippers,
  selectedShipper,
  onShipperChange,
  uniqueDestinations,
  selectedDestination,
  onDestinationChange,
  uniqueReDests,
  selectedReDest,
  onReDestChange,
  uniqueOrigins,
  selectedOrigin,
  onOriginChange,
  uniqueStatuses,
  selectedStatusVal,
  onStatusValChange,
  uniqueCustomersCare,
  selectedCustomersCare,
  onCustomersCareChange,
  filterStartDate,
  onStartDateChange,
  filterEndDate,
  onEndDateChange,
  tableDensity,
  onSetTableDensity,
  viewMode,
  onSetViewMode,
  hiddenColumnIds,
  onToggleColumnVisibility,
  onHideEmptyColumns,
  onShowAllColumns,
  isColumnDropdownOpen,
  setIsColumnDropdownOpen,
  columnDropdownRef,
  emptyColumnIds
}) => {
  return (
    <div className="space-y-2">
      {/* 🔍 SEARCH & CONTROLS TOOLBAR */}
      <div className="flex flex-col lg:flex-row gap-2 items-stretch lg:items-center justify-between bg-white dark:bg-slate-900 px-3 py-1.5 sm:py-2 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        {/* Left: Search Input & Scope Dropdown */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap flex-1 min-w-0">
          <div className="relative w-full sm:w-72 lg:w-84 shrink-0 flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="ស្វែងរក Barcode, ឈ្មោះ, ទូរស័ព្ទ..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8.5 pr-20 h-8 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer"
                  title="សម្អាតការស្វែងរក"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={onOpenBarcodeScanner}
                className="h-6 px-1.5 rounded-md text-[10.5px] font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/70 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center gap-1 transition cursor-pointer shadow-2xs"
                title="ស្កេន Barcode / QR Code ដោយកាមេរ៉ា"
              >
                <ScanBarcode className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Scan</span>
              </button>
            </div>
          </div>

          {/* Search Column Scope Selector */}
          <select
            value={selectedColumnFilter}
            onChange={(e) => onSelectColumnFilter(e.target.value)}
            className="h-8 px-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer max-w-[130px] truncate"
            title="កំណត់ជួរឈរសម្រាប់ស្វែងរក"
          >
            <option value="ALL">គ្រប់ជួរឈរ (All)</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label || c.id}
              </option>
            ))}
          </select>

          {/* Toggle Filter Panel Button */}
          <button
            type="button"
            onClick={onToggleFilterPanel}
            className={`h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer shadow-2xs ${
              isFilterPanelOpen || activeFilterCount > 0
                ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 font-bold'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Right: View Mode, Density, Column Visibility */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {/* Column Visibility Dropdown */}
          <div className="relative" ref={columnDropdownRef}>
            <button
              type="button"
              onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
              className={`h-8 px-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer shadow-2xs ${
                hiddenColumnIds.length > 0
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
              title="ជ្រើសរើសជួរឈរដែលចង់បង្ហាញ ឬលាក់"
            >
              <Columns className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">ជួរឈរ</span>
              {hiddenColumnIds.length > 0 && (
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  (-{hiddenColumnIds.length})
                </span>
              )}
            </button>

            {isColumnDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-2 text-xs space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-[11px] text-slate-700 dark:text-slate-200">
                    គ្រប់គ្រងជួរឈរ
                  </span>
                  <div className="flex items-center gap-2 text-[10.5px]">
                    {emptyColumnIds.size > 0 && (
                      <button
                        type="button"
                        onClick={onHideEmptyColumns}
                        className="text-amber-600 dark:text-amber-400 hover:underline font-semibold cursor-pointer"
                        title="លាក់ជួរឈរដែលគ្មានទិន្នន័យ"
                      >
                        លាក់ទទេ
                      </button>
                    )}
                    {hiddenColumnIds.length > 0 && (
                      <button
                        type="button"
                        onClick={onShowAllColumns}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                      >
                        បង្ហាញទាំងអស់
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-0.5">
                  {columns.map((col) => {
                    const isVisible = !hiddenColumnIds.includes(col.id);
                    const isEmpty = emptyColumnIds.has(col.id);
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => onToggleColumnVisibility(col.id)}
                        className={`w-full text-left px-2 py-1 rounded-md flex items-center justify-between transition cursor-pointer text-xs ${
                          isVisible
                            ? 'bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 font-medium'
                            : 'text-slate-400 line-through opacity-70 hover:bg-slate-50 dark:hover:bg-slate-850'
                        }`}
                      >
                        <span className="truncate max-w-[170px]">{col.label || col.id}</span>
                        {isVisible ? (
                          <Eye className="w-3 h-3 text-blue-600 shrink-0" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Density Toggle (Compact vs Normal) */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => onSetTableDensity('compact')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                tableDensity === 'compact'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="ទម្រង់តូចបង្រួម (Compact)"
            >
              តូច
            </button>
            <button
              type="button"
              onClick={() => onSetTableDensity('normal')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                tableDensity === 'normal'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="ទម្រង់ធម្មតា (Normal)"
            >
              មធ្យម
            </button>
          </div>

          {/* View Mode Toggle (Table vs Cards) */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => onSetViewMode('table')}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
              title="ទម្រង់តារាង (Table View)"
            >
              <Table2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSetViewMode('cards')}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
              title="ទម្រង់កាត (Card Grid View)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 🎯 ADVANCED COLUMN FILTERS PANEL (Drawer style) */}
      {isFilterPanelOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs p-3 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                ចម្រាញ់ទិន្នន័យតាមជួរឈរ (Filters by Columns)
              </h3>
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  បានជ្រើស {activeFilterCount}
                </span>
              )}
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onResetFilters}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 transition cursor-pointer hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>សម្អាតការចម្រាញ់ទាំងអស់ (Reset Filters)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {/* 1. Shipper Filter */}
            <SearchableFilterDropdown
              label="Shipper"
              allLabel="គ្រប់ Shipper (All)"
              selected={selectedShipper}
              onChange={onShipperChange}
              options={uniqueShippers}
            />

            {/* 2. Destination Filter */}
            <SearchableFilterDropdown
              label="Destination"
              allLabel="គ្រប់ Destination (All)"
              selected={selectedDestination}
              onChange={onDestinationChange}
              options={uniqueDestinations}
            />

            {/* 3. Re-Dest Filter */}
            <SearchableFilterDropdown
              label="Re-Dest"
              allLabel="គ្រប់ Re-Dest (All)"
              selected={selectedReDest}
              onChange={onReDestChange}
              options={uniqueReDests}
            />

            {/* 4. Origin Filter */}
            <SearchableFilterDropdown
              label="Origin"
              allLabel="គ្រប់ Origin (All)"
              selected={selectedOrigin}
              onChange={onOriginChange}
              options={uniqueOrigins}
            />

            {/* 5. Status Filter */}
            <SearchableFilterDropdown
              label="Status"
              allLabel="គ្រប់ Status (All)"
              selected={selectedStatusVal}
              onChange={onStatusValChange}
              options={uniqueStatuses}
            />

            {/* 6. Customers Care Filter */}
            <SearchableFilterDropdown
              label="Customers Care"
              allLabel="គ្រប់ Customers Care (All)"
              selected={selectedCustomersCare}
              onChange={onCustomersCareChange}
              options={uniqueCustomersCare}
            />

            {/* 7. Date Range: Start Date & End Date (Spans 2 cols) */}
            <div className="col-span-1 sm:col-span-2 md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>កាលបរិច្ឆេទ (Date Range)</span>
                {(filterStartDate || filterEndDate) && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => onStartDateChange([e.target.value])}
                  className={`flex-1 h-8.5 px-2 rounded-lg text-xs border focus:outline-none cursor-pointer ${
                    filterStartDate
                      ? 'bg-blue-50/70 border-blue-400 text-blue-700 font-semibold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                  title="ចាប់ពីថ្ងៃ (Start Date)"
                />
                <span className="text-xs text-slate-400 font-bold">-</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => onEndDateChange([e.target.value])}
                  className={`flex-1 h-8.5 px-2 rounded-lg text-xs border focus:outline-none cursor-pointer ${
                    filterEndDate
                      ? 'bg-blue-50/70 border-blue-400 text-blue-700 font-semibold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                  title="ដល់ថ្ងៃ (End Date)"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
