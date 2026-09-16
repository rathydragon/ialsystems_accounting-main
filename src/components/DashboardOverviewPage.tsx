import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  QrCode, 
  Plus, 
  Layers, 
  ArrowUpRight, 
  Users, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Sparkles, 
  Building2, 
  Banknote, 
  RefreshCw,
  Search,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Zap,
  CreditCard
} from 'lucide-react';
import { CollectionBatch, Payer, AuthUser, NavView } from '../types';

interface DashboardOverviewPageProps {
  savedBatches: CollectionBatch[];
  payers: Payer[];
  currentUser: AuthUser | null;
  exchangeRate?: number;
  onNavigate: (view: NavView) => void;
  onOpenSettings?: () => void;
  onSyncToGoogleSheets?: () => void;
}

type TimeRange = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

export const DashboardOverviewPage: React.FC<DashboardOverviewPageProps> = ({
  savedBatches,
  payers,
  currentUser,
  exchangeRate = 4100,
  onNavigate,
  onOpenSettings,
  onSyncToGoogleSheets
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('TODAY');
  const [searchFilter, setSearchFilter] = useState('');

  // 1. Filter batches by time range
  const filteredBatches = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    return savedBatches.filter(b => {
      const batchTime = new Date(b.createdAt).getTime();
      if (isNaN(batchTime)) return true;

      if (timeRange === 'TODAY') {
        return batchTime >= startOfToday;
      }
      if (timeRange === 'WEEK') {
        return batchTime >= oneWeekAgo;
      }
      if (timeRange === 'MONTH') {
        return batchTime >= oneMonthAgo;
      }
      return true; // 'ALL'
    });
  }, [savedBatches, timeRange]);

  // 2. Metrics calculation for selected time range
  const metrics = useMemo(() => {
    let totalUSD = 0;
    let totalKHR = 0;
    let totalItems = 0;
    let totalBankUSD = 0;
    let totalBankKHR = 0;
    let totalCashUSD = 0;
    let totalCashKHR = 0;
    let balancedCount = 0;

    filteredBatches.forEach(b => {
      totalUSD += Number(b.totalUSD) || 0;
      totalKHR += Number(b.totalKHR) || 0;
      totalItems += Number(b.totalItems) || (b.items ? b.items.length : 0);
      totalBankUSD += Number(b.bankUSD) || 0;
      totalBankKHR += Number(b.bankKHR) || 0;
      totalCashUSD += Number(b.cashUSD) || 0;
      totalCashKHR += Number(b.cashKHR) || 0;
      if (b.reconciliation?.includes('គ្រប់ចំនួន') || b.reconciliation?.includes('Balanced')) {
        balancedCount++;
      }
    });

    const grandTotalUSD = totalUSD + (totalKHR / exchangeRate);
    const reconciliationRate = filteredBatches.length > 0 
      ? Math.round((balancedCount / filteredBatches.length) * 100) 
      : 100;

    return {
      totalUSD,
      totalKHR,
      grandTotalUSD,
      totalItems,
      totalBatches: filteredBatches.length,
      totalBankUSD,
      totalBankKHR,
      totalCashUSD,
      totalCashKHR,
      reconciliationRate
    };
  }, [filteredBatches, exchangeRate]);

  // 3. Search and sort recent batches
  const recentBatches = useMemo(() => {
    let list = [...savedBatches];
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(b => 
        b.batchNumber.toLowerCase().includes(q) ||
        b.operator?.toLowerCase().includes(q) ||
        (b.items && b.items.some(i => i.tracking?.toLowerCase().includes(q) || i.name?.toLowerCase().includes(q)))
      );
    }
    return list.slice(0, 6);
  }, [savedBatches, searchFilter]);

  // 4. Top Payers calculation
  const topPayers = useMemo(() => {
    const payerMap: { [name: string]: { count: number; totalUSD: number; totalKHR: number } } = {};
    savedBatches.forEach(b => {
      if (b.items && Array.isArray(b.items)) {
        b.items.forEach(item => {
          const name = item.name?.trim();
          if (name) {
            if (!payerMap[name]) {
              payerMap[name] = { count: 0, totalUSD: 0, totalKHR: 0 };
            }
            payerMap[name].count++;
            payerMap[name].totalUSD += Number(item.usd) || 0;
            payerMap[name].totalKHR += Number(item.khm) || 0;
          }
        });
      }
    });

    return Object.entries(payerMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [savedBatches]);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-200">
      
      {/* 1. Header Banner & Live Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute left-1/3 -top-10 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-black text-lg shrink-0">
            IAL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                <span>IAL Systems / ស៊ីស្ទីម</span>
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Online Sync</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Accounting & Payments Dashboard • ផ្ទាំងគ្រប់គ្រងចំណូល និងការប្រមូលប្រាក់
            </p>
          </div>
        </div>

        {/* Time Range Selector Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-slate-800 self-start sm:self-auto relative z-10">
          {(['TODAY', 'WEEK', 'MONTH', 'ALL'] as TimeRange[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTimeRange(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                timeRange === t
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {t === 'TODAY' ? 'ថ្ងៃនេះ' : t === 'WEEK' ? 'សប្ដាហ៍នេះ' : t === 'MONTH' ? 'ខែនេះ' : 'ទាំងអស់'}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Hero Daily Revenue Card (គំរូទី ២ Glowing Metrics Card) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Main Glowing Revenue Card */}
        <div className="lg:col-span-8 rounded-3xl bg-gradient-to-br from-[#0c1626] to-[#0f1f38] border border-cyan-500/30 p-5 sm:p-6 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <span className="text-[10px] sm:text-xs font-mono tracking-widest text-cyan-400 uppercase font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                TOTAL DAILY REVENUE • ចំណូលសរុបប្រចាំថ្ងៃ
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                គិតសរុបតាមកញ្ចប់ដែលបានរក្សាទុក ({timeRange === 'TODAY' ? 'ថ្ងៃនេះ' : timeRange === 'WEEK' ? '៧ ថ្ងៃចុងក្រោយ' : timeRange === 'MONTH' ? '៣០ ថ្ងៃចុងក្រោយ' : 'ទិន្នន័យទាំងអស់'})
              </p>
            </div>
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          {/* Big Currency Display */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-3">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-cyan-500/20 backdrop-blur-md">
              <span className="text-xs font-bold text-slate-400">ប្រាក់ដុល្លារ (USD)</span>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-black font-mono text-cyan-300 mt-1">
                ${metrics.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                ធនាគារ: ${metrics.totalBankUSD.toFixed(2)} | ប្រាក់សុទ្ធ: ${metrics.totalCashUSD.toFixed(2)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-emerald-500/20 backdrop-blur-md">
              <span className="text-xs font-bold text-slate-400">ប្រាក់រៀល (KHR)</span>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-black font-mono text-emerald-300 mt-1">
                {metrics.totalKHR.toLocaleString()} <span className="text-xl">៛</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                ធនាគារ: {metrics.totalBankKHR.toLocaleString()} ៛ | ប្រាក់សុទ្ធ: {metrics.totalCashKHR.toLocaleString()} ៛
              </span>
            </div>
          </div>

          {/* Secondary Ribbon Stats */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 text-center">
            <div className="p-2 rounded-xl bg-white/5">
              <span className="text-[10px] text-slate-400 block font-medium">ចំនួនកញ្ចប់ (Batches)</span>
              <span className="text-base sm:text-lg font-bold text-white font-mono">{metrics.totalBatches}</span>
            </div>
            <div className="p-2 rounded-xl bg-white/5">
              <span className="text-[10px] text-slate-400 block font-medium">ចំនួនវិក្កយបត្រ (Items)</span>
              <span className="text-base sm:text-lg font-bold text-white font-mono">{metrics.totalItems}</span>
            </div>
            <div className="p-2 rounded-xl bg-white/5">
              <span className="text-[10px] text-slate-400 block font-medium">ផ្ទៀងផ្ទាត់ (Recon)</span>
              <span className="text-base sm:text-lg font-bold text-emerald-400 font-mono">
                ✓ {metrics.reconciliationRate}%
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions & Scanner Trigger Card */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          
          {/* Main QR Scanner Action Card */}
          <div 
            onClick={() => onNavigate('COLLECTION')}
            className="flex-1 rounded-3xl bg-gradient-to-br from-blue-900/60 to-cyan-950/60 border border-cyan-500/40 p-5 text-white shadow-xl cursor-pointer hover:border-cyan-400 hover:scale-[1.01] transition duration-200 relative group overflow-hidden"
          >
            <div className="absolute right-3 top-3 w-20 h-20 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition"></div>

            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center border border-cyan-400/30 group-hover:scale-110 transition">
                <QrCode className="w-6 h-6" />
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Zap className="w-3 h-3" /> ប៉ះដើម្បីស្កេន
              </span>
            </div>

            <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-cyan-300 transition">
              QR & Barcode Scanner
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              ស្កេន & ប្រមូលប្រាក់ (Scan & Collect Payment) បញ្ចូលកូដទំនិញលឿនរហ័ស 0ms
            </p>

            <div className="mt-4 flex items-center gap-1 text-xs font-bold text-cyan-400 group-hover:translate-x-1 transition">
              <span>ចាប់ផ្ដើមទទួលប្រាក់ឥឡូវនេះ</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onNavigate('PAYERS')}
              className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left transition active:scale-95 cursor-pointer shadow-xs"
            >
              <Users className="w-4 h-4 text-blue-600 mb-1" />
              <span className="font-bold text-xs text-slate-900 dark:text-white block">
                អ្នកប្រគល់ប្រាក់
              </span>
              <span className="text-[10px] text-slate-400">{payers.length} នាក់ក្នុងប្រព័ន្ធ</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('DATA')}
              className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-left transition active:scale-95 cursor-pointer shadow-xs"
            >
              <FileText className="w-4 h-4 text-emerald-600 mb-1" />
              <span className="font-bold text-xs text-slate-900 dark:text-white block">
                ទិន្នន័យ & របាយការណ៍
              </span>
              <span className="text-[10px] text-slate-400">Google Sheets Sync</span>
            </button>
          </div>

        </div>

      </div>

      {/* 3. Recent Batch Collections (កញ្ចប់ប្រមូលប្រាក់កាលពីថ្មីៗ) */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-500"></div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                RECENT BATCH COLLECTIONS • ការប្រមូលប្រាក់ជាក្រុមថ្មីៗ
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              ប្រវត្តិកញ្ចប់ដែលបាន Commit និង Sync ចូល Google Sheets / Firebase
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ស្វែងរកកញ្ចប់..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-40 sm:w-48 font-medium"
              />
            </div>

            <button
              type="button"
              onClick={() => onNavigate('COLLECTION')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center gap-1"
            >
              <span>មើលទាំងអស់</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Batch Cards Grid */}
        {recentBatches.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
            <Layers className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-500">មិនទាន់មានកញ្ចប់ប្រមូលប្រាក់នៅឡើយទេ</p>
            <button
              type="button"
              onClick={() => onNavigate('COLLECTION')}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition cursor-pointer shadow-sm"
            >
              បង្កើតកញ្ចប់ដំបូង
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentBatches.map((batch, idx) => {
              const uniquePayers = Array.from(new Set((batch.items || []).map(i => i.name?.trim()).filter(Boolean)));
              const payerDisplay = uniquePayers.length > 0 ? uniquePayers.join(', ') : 'អតិថិជនទូទៅ';
              const isBalanced = batch.reconciliation?.includes('គ្រប់ចំនួន') || batch.reconciliation?.includes('Balanced');

              return (
                <div
                  key={batch.id || idx}
                  className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-800 hover:border-cyan-500/50 transition duration-150 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-black text-slate-900 dark:text-white block">
                        {batch.batchNumber}
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {new Date(batch.createdAt).toLocaleString('km-KH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                      </span>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isBalanced
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isBalanced ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                      <span>{isBalanced ? 'Completed' : 'Pending'}</span>
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">អ្នកប្រគល់ប្រាក់៖</span>
                    <span className="font-semibold truncate block text-blue-600 dark:text-blue-400">
                      {payerDisplay}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between font-mono">
                    <div className="text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">
                        ${Number(batch.totalUSD || 0).toFixed(2)}
                      </span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-500">
                        {Number(batch.totalKHR || 0).toLocaleString()} ៛
                      </span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                      {batch.totalItems || batch.items?.length || 0} items
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Top Payers & Quick Reconciliation Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Top Payers Card */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-600" />
              <span>អ្នកប្រគល់ប្រាក់សកម្មបំផុត (Top Payers)</span>
            </h4>
            <button
              type="button"
              onClick={() => onNavigate('PAYERS')}
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              គ្រប់គ្រង ➔
            </button>
          </div>

          <div className="space-y-2">
            {topPayers.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">មិនទាន់មានទិន្នន័យ</p>
            ) : (
              topPayers.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[10px]">
                      {i + 1}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                      {p.name}
                    </span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-cyan-600 dark:text-cyan-400">${p.totalUSD.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400 ml-1.5">({p.count} មុខ)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Payment Methods Distribution Card */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
              <Banknote className="w-4 h-4 text-emerald-600" />
              <span>ការទូទាត់ ធនាគារ VS ប្រាក់សុទ្ធ (Bank & Cash)</span>
            </h4>
          </div>

          <div className="space-y-2.5">
            <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> ធនាគារ (Bank Transfer)
                </span>
                <span className="font-mono font-black text-blue-600 dark:text-blue-400">
                  ${metrics.totalBankUSD.toFixed(2)} | {metrics.totalBankKHR.toLocaleString()} ៛
                </span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5" /> ប្រាក់សុទ្ធ (Cash in Hand)
                </span>
                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                  ${metrics.totalCashUSD.toFixed(2)} | {metrics.totalCashKHR.toLocaleString()} ៛
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
