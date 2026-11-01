import React from 'react';
import { FileSpreadsheet, ChevronRight } from 'lucide-react';

interface DashboardStatusCardsProps {
  /** Each Data Report STATUS value with its row count. */
  items: { value: string; count: number }[];
  total: number;
  onOpen: () => void;
  /** Grid span classes so the card fills the free space in the tile row */
  className?: string;
}

// Pick a colour from the status text
const colorFor = (status: string): { dot: string; text: string } => {
  const s = status.toUpperCase();
  if (s.includes('DELIVERED') && !s.includes('NOT') && !s.includes('UN')) return { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' };
  if (s.includes('RETURN')) return { dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' };
  if (s.includes('CANCEL') || s.includes('FAIL') || s.includes('NOT') || s.includes('REJECT')) return { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
  if (s.includes('HOLD') || s.includes('REMAIN') || s.includes('STOCK')) return { dot: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-300' };
  if (s.includes('UPLEFT') || s.includes('OUT') || s.includes('TRANSIT') || s.includes('RIDER')) return { dot: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400' };
  if (s.includes('ARRIV') || s.includes('HUB') || s.includes('RECEIV')) return { dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' };
  if (s.includes('PENDING') || s.includes('WAIT') || s.includes('PROCESS')) return { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' };
  return { dot: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' };
};

/** One compact card: stacked bar + every STATUS value with count and %. */
export const DashboardStatusCards: React.FC<DashboardStatusCardsProps> = ({ items, total, onOpen, className = '' }) => {
  if (items.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group text-left px-3.5 py-3 min-w-0 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition cursor-pointer flex flex-col justify-between gap-2 ${className}`}
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-teal-600 bg-teal-500/10 dark:text-teal-400">
          <FileSpreadsheet className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">Data Report · Status</p>
          <p className="text-[10px] text-slate-400 truncate leading-tight">សរុប {total.toLocaleString('en-US')} កញ្ចប់</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition shrink-0" />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {items.map(({ value, count }) => {
          const c = colorFor(value);
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={value} className="flex items-baseline gap-1.5 min-w-0" title={`${value}: ${count.toLocaleString()} (${pct.toFixed(1)}%)`}>
              <span className={`w-2 h-2 rounded-sm shrink-0 self-center ${c.dot}`} />
              <span className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 truncate">{value}</span>
              <span className="text-[18px] font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">{count.toLocaleString('en-US')}</span>
              <span className={`text-[10px] font-semibold tabular-nums ${c.text}`}>{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>

      <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 gap-px">
        {total > 0 && items.map(({ value, count }) => (
          <div key={value} className={colorFor(value).dot} style={{ width: `${(count / total) * 100}%` }} />
        ))}
      </div>
    </button>
  );
};
