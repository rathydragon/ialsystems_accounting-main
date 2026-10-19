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
  /** Render without its own card so it can sit inside the header row */
  embedded?: boolean;
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
  onToggleKpiCollapsed,
  embedded = false
}) => {
  return (
    <div className={embedded ? 'contents' : 'bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs transition-all overflow-hidden'}>
      {/* COMPACT SLIM METRIC STRIP (Always visible, clean 1-row layout) */}
      <div className={embedded
        ? 'order-last xl:order-2 w-full xl:w-auto xl:flex-1 xl:basis-0 min-w-0 flex items-center justify-between gap-1 text-xs'
        : 'flex items-center justify-between gap-2 px-2.5 sm:px-3 py-1.5 text-xs'}>
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
          {/* 1. Total Chip */}
          <button
            type="button"
            onClick={() => {
              onSetStatusFilter('ALL');
              onSetTeamsFilter('ALL');
              onSetLocationFilter('ALL');
            }}
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              statusFilter === 'ALL' && teamsFilter === 'ALL' && locationFilter === 'ALL'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="សរុប — បង្ហាញទិន្នន័យទាំងអស់ (Reset quick filters)"
          >
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden 2xl:inline">សរុប:</span>
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
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              statusFilter === 'DELIVERED'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200 border-emerald-400 dark:border-emerald-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="Delivered — ចុចដើម្បីចម្រាញ់យកតែ Delivered"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden 2xl:inline">Delivered:</span>
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
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              statusFilter === 'NOT_DELIVERED'
                ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/70 dark:text-rose-200 border-rose-400 dark:border-rose-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="Pending — ចុចដើម្បីចម្រាញ់យកតែ Not Delivered"
          >
            <Clock className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden 2xl:inline">Pending:</span>
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
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              teamsFilter === 'IAL_OR_DEL'
                ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200 border-indigo-400 dark:border-indigo-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="ចុចដើម្បីចម្រាញ់ក្រុម IAL / DEL"
          >
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden 2xl:inline">Teams:</span>
            <span className="font-mono font-bold">IAL {ialTotal.toLocaleString()}</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="font-mono font-bold">DEL {delTotal.toLocaleString()}</span>
          </button>

          {/* 5. Location Chip (OOT | City) */}
          <button
            type="button"
            onClick={() => onSetLocationFilter(locationFilter === 'LOCATION_VALID' ? 'ALL' : 'LOCATION_VALID')}
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold border transition cursor-pointer shrink-0 active:scale-95 ${
              locationFilter === 'LOCATION_VALID'
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/70 dark:text-amber-200 border-amber-400 dark:border-amber-700 font-bold shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
            }`}
            title="ចុចដើម្បីចម្រាញ់ទីតាំង Out of Town / City Town"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden 2xl:inline">Location:</span>
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
        <div className={`${embedded ? 'order-last basis-full pt-1.5' : 'px-3 pb-3 pt-2.5'} border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-150`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
            {[
              { label: 'សរុបទាំងអស់', sub: 'កញ្ចប់ក្នុង Sheets', value: totalRowsCount, dot: 'bg-slate-500', bar: 'bg-slate-400', text: 'text-slate-900 dark:text-white' },
              { label: 'Delivered', sub: 'ដឹករួច', value: deliveredTotal, dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Pending / Hold', sub: 'មិនទាន់ដឹក', value: nonDeliveredTotal, dot: 'bg-rose-500', bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400' },
              { label: 'IAL Team', sub: 'ក្រុម IAL', value: ialTotal, dot: 'bg-blue-500', bar: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400' },
              { label: 'DEL Team', sub: 'ក្រុម DEL', value: delTotal, dot: 'bg-indigo-500', bar: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-400' },
              { label: 'Out Of Town', sub: 'តាមបណ្តាខេត្ត', value: outOfTownTotal, dot: 'bg-amber-500', bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
              { label: 'City Town', sub: 'ក្នុងភ្នំពេញ', value: cityTownTotal, dot: 'bg-teal-500', bar: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-400' }
            ].map((card) => {
              const pct = totalRowsCount > 0 ? (card.value / totalRowsCount) * 100 : 0;
              return (
                <div
                  key={card.label}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60"
                  title={`${card.label} (${card.sub}): ${card.value.toLocaleString()} • ${pct.toFixed(1)}%`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.dot}`} />
                    <span className="truncate">{card.label}</span>
                    <span className="ml-auto font-mono tabular-nums text-slate-400">{pct.toFixed(1)}%</span>
                  </div>
                  <div className={`text-sm font-bold font-mono tabular-nums leading-snug ${card.text}`}>
                    {card.value.toLocaleString()}
                  </div>
                  <div className="mt-1 h-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700/60 overflow-hidden">
                    <div className={`h-full rounded-full ${card.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
