import React from 'react';
import {
  Layers,
  CheckCircle2,
  Clock,
  Users,
  MapPin,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { StatusFilterOption, TeamsFilterOption, LocationFilterOption } from './types';

interface DataReportKpiBarProps {
  totalRowsCount: number;
  filteredRowsCount: number;
  deliveredTotal: number;
  deliveredFiltered: number;
  nonDeliveredTotal: number;
  nonDeliveredFiltered: number;
  ialTotal: number;
  ialFiltered: number;
  delTotal: number;
  delFiltered: number;
  outOfTownTotal: number;
  outOfTownFiltered: number;
  cityTownTotal: number;
  cityTownFiltered: number;
  statusFilter: StatusFilterOption;
  onSetStatusFilter: (status: StatusFilterOption) => void;
  teamsFilter: TeamsFilterOption;
  onSetTeamsFilter: (teams: TeamsFilterOption) => void;
  locationFilter: LocationFilterOption;
  onSetLocationFilter: (loc: LocationFilterOption) => void;
  isKpiCollapsed: boolean;
  onToggleKpiCollapsed: () => void;
}

export const DataReportKpiBar: React.FC<DataReportKpiBarProps> = React.memo(({
  totalRowsCount,
  filteredRowsCount,
  deliveredTotal,
  deliveredFiltered,
  nonDeliveredTotal,
  nonDeliveredFiltered,
  ialTotal,
  ialFiltered,
  delTotal,
  delFiltered,
  outOfTownTotal,
  outOfTownFiltered,
  cityTownTotal,
  cityTownFiltered,
  statusFilter,
  onSetStatusFilter,
  teamsFilter,
  onSetTeamsFilter,
  locationFilter,
  onSetLocationFilter,
  isKpiCollapsed,
  onToggleKpiCollapsed
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs transition-all overflow-hidden">
      {/* COMPACT SLIM METRIC STRIP (Always visible, clean 1-row layout) */}
      <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3 py-1.5 text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
          {/* 1. Total Chip */}
          <button
            type="button"
            onClick={() => {
              onSetStatusFilter('ALL');
              onSetTeamsFilter('ALL');
              onSetLocationFilter('ALL');
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              statusFilter === 'ALL' && teamsFilter === 'ALL' && locationFilter === 'ALL'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="បង្ហាញទិន្នន័យទាំងអស់ (Reset quick filters)"
          >
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>សរុប:</span>
            <span className="font-bold font-mono">{totalRowsCount.toLocaleString()}</span>
            {filteredRowsCount !== totalRowsCount && (
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                ({filteredRowsCount.toLocaleString()})
              </span>
            )}
          </button>

          {/* 2. Delivered Chip */}
          <button
            type="button"
            onClick={() => onSetStatusFilter(statusFilter === 'DELIVERED' ? 'ALL' : 'DELIVERED')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              statusFilter === 'DELIVERED'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200 border-emerald-400 dark:border-emerald-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="ចុចដើម្បីចម្រាញ់យកតែ Delivered"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Delivered:</span>
            <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {deliveredTotal.toLocaleString()}
            </span>
            {deliveredFiltered !== deliveredTotal && (
              <span className="text-[10px] text-emerald-600 font-bold">
                ({deliveredFiltered.toLocaleString()})
              </span>
            )}
          </button>

          {/* 3. Not Delivered Chip */}
          <button
            type="button"
            onClick={() => onSetStatusFilter(statusFilter === 'NOT_DELIVERED' ? 'ALL' : 'NOT_DELIVERED')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              statusFilter === 'NOT_DELIVERED'
                ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/70 dark:text-rose-200 border-rose-400 dark:border-rose-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="ចុចដើម្បីចម្រាញ់យកតែ Not Delivered"
          >
            <Clock className="w-3.5 h-3.5 text-rose-600" />
            <span>Pending:</span>
            <span className="font-bold font-mono text-rose-700 dark:text-rose-400">
              {nonDeliveredTotal.toLocaleString()}
            </span>
            {nonDeliveredFiltered !== nonDeliveredTotal && (
              <span className="text-[10px] text-rose-600 font-bold">
                ({nonDeliveredFiltered.toLocaleString()})
              </span>
            )}
          </button>

          {/* 4. Teams Chip (IAL | DEL) */}
          <button
            type="button"
            onClick={() => onSetTeamsFilter(teamsFilter === 'IAL_OR_DEL' ? 'ALL' : 'IAL_OR_DEL')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              teamsFilter === 'IAL_OR_DEL'
                ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200 border-indigo-400 dark:border-indigo-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="ចុចដើម្បីចម្រាញ់ក្រុម IAL / DEL"
          >
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span>Teams:</span>
            <span className="font-mono font-bold">IAL {ialTotal.toLocaleString()}</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="font-mono font-bold">DEL {delTotal.toLocaleString()}</span>
          </button>

          {/* 5. Location Chip (OOT | City) */}
          <button
            type="button"
            onClick={() => onSetLocationFilter(locationFilter === 'LOCATION_VALID' ? 'ALL' : 'LOCATION_VALID')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              locationFilter === 'LOCATION_VALID'
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/70 dark:text-amber-200 border-amber-400 dark:border-amber-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="ចុចដើម្បីចម្រាញ់ទីតាំង Out of Town / City Town"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-600" />
            <span>Location:</span>
            <span className="font-mono font-bold">OOT {outOfTownTotal.toLocaleString()}</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="font-mono font-bold">City {cityTownTotal.toLocaleString()}</span>
          </button>
        </div>

        {/* Expand / Collapse Full Cards Toggle */}
        <button
          type="button"
          onClick={onToggleKpiCollapsed}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
          title={isKpiCollapsed ? 'ពង្រីកកាតស្ថិតិពេញលេញ' : 'បង្រួមកាតស្ថិតិ'}
        >
          {isKpiCollapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4 text-indigo-600" />
          )}
        </button>
      </div>

      {/* EXPANDED DETAILED KPI CARDS (Only when user specifically opens) */}
      {!isKpiCollapsed && (
        <div className="p-3 pt-0 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-150">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2.5">
            {/* Card 1: Total */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-800">
              <div className="text-[10px] font-bold text-slate-500 uppercase">សរុបទាំងអស់</div>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5 font-mono">
                {totalRowsCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400">កញ្ចប់សរុបក្នុង Sheets</div>
            </div>

            {/* Card 2: Delivered */}
            <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
              <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">Delivered</div>
              <div className="text-lg font-black text-emerald-800 dark:text-emerald-200 mt-0.5 font-mono">
                {deliveredTotal.toLocaleString()}
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                {totalRowsCount > 0 ? `${((deliveredTotal / totalRowsCount) * 100).toFixed(1)}%` : '0%'}
              </div>
            </div>

            {/* Card 3: Pending */}
            <div className="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60">
              <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase">Pending / Hold</div>
              <div className="text-lg font-black text-rose-800 dark:text-rose-200 mt-0.5 font-mono">
                {nonDeliveredTotal.toLocaleString()}
              </div>
              <div className="text-[10px] text-rose-600 dark:text-rose-400">
                {totalRowsCount > 0 ? `${((nonDeliveredTotal / totalRowsCount) * 100).toFixed(1)}%` : '0%'}
              </div>
            </div>

            {/* Card 4: IAL Team */}
            <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60">
              <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">IAL Team</div>
              <div className="text-lg font-black text-blue-800 dark:text-blue-200 mt-0.5 font-mono">
                {ialTotal.toLocaleString()}
              </div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400">ក្រុម IAL</div>
            </div>

            {/* Card 5: DEL Team */}
            <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
              <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase">DEL Team</div>
              <div className="text-lg font-black text-indigo-800 dark:text-indigo-200 mt-0.5 font-mono">
                {delTotal.toLocaleString()}
              </div>
              <div className="text-[10px] text-indigo-600 dark:text-indigo-400">ក្រុម DEL</div>
            </div>

            {/* Card 6: Out Of Town */}
            <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60">
              <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase">Out Of Town</div>
              <div className="text-lg font-black text-amber-800 dark:text-amber-200 mt-0.5 font-mono">
                {outOfTownTotal.toLocaleString()}
              </div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400">តាមបណ្តាខេត្ត</div>
            </div>

            {/* Card 7: City Town */}
            <div className="p-2.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60">
              <div className="text-[10px] font-bold text-teal-700 dark:text-teal-300 uppercase">City Town</div>
              <div className="text-lg font-black text-teal-800 dark:text-teal-200 mt-0.5 font-mono">
                {cityTownTotal.toLocaleString()}
              </div>
              <div className="text-[10px] text-teal-600 dark:text-teal-400">ក្នុងរាជធានីភ្នំពេញ</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
