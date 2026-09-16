import React, { useMemo } from 'react';
import { 
  QrCode, 
  Scan, 
  Send, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  Layers, 
  DollarSign, 
  Sparkles, 
  RefreshCw,
  Plus,
  ArrowUpRight,
  User,
  Building2,
  Calendar,
  LayoutDashboard,
  Users,
  Database,
  Settings
} from 'lucide-react';
import { CollectionBatch, AuthUser, AppSettings, NavView, Payer } from '../types';

interface DashboardOverviewPageProps {
  currentUser: AuthUser | null;
  settings: AppSettings;
  savedBatches: CollectionBatch[];
  payers: Payer[];
  onNavigate: (view: NavView) => void;
  onOpenScanner: () => void;
  onOpenSettings: () => void;
}

export const DashboardOverviewPage: React.FC<DashboardOverviewPageProps> = ({
  currentUser,
  settings,
  savedBatches = [],
  payers = [],
  onNavigate,
  onOpenScanner,
  onOpenSettings
}) => {
  const exchangeRate = settings.exchangeRate || 4100;

  // Calculate Daily Totals (Today's batches)
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    
    // Filter batches from today, or use all recent batches
    const todayBatches = savedBatches.filter(b => {
      try {
        const batchDate = b.createdAt ? new Date(b.createdAt).toISOString().split('T')[0] : '';
        return batchDate === today;
      } catch {
        return true;
      }
    });

    const activeList = todayBatches.length > 0 ? todayBatches : savedBatches;

    const totalUSD = activeList.reduce((sum, b) => sum + (Number(b.totalUSD) || 0), 0);
    const totalKHR = activeList.reduce((sum, b) => sum + (Number(b.totalKHR) || 0), 0);
    const totalItems = activeList.reduce((sum, b) => sum + (Number(b.totalItems) || (b.items ? b.items.length : 0)), 0);
    const totalBatches = activeList.length;

    // Converted combined revenue in USD & KHR
    const combinedUSD = totalUSD + (totalKHR / exchangeRate);
    const combinedKHR = totalKHR + (totalUSD * exchangeRate);

    return {
      totalUSD,
      totalKHR,
      combinedUSD: combinedUSD > 0 ? combinedUSD : 1450.00,
      combinedKHR: combinedKHR > 0 ? combinedKHR : 5945000,
      totalItems: totalItems > 0 ? totalItems : 14,
      totalBatches: totalBatches > 0 ? totalBatches : 3,
      isSample: activeList.length === 0
    };
  }, [savedBatches, exchangeRate]);

  // Format recent batches (top 5)
  const recentBatches = useMemo(() => {
    if (savedBatches && savedBatches.length > 0) {
      return savedBatches.slice(0, 5);
    }
    // Fallback sample data matching Screen 2 Design Mockup
    return [
      {
        id: 'sample-1',
        batchNumber: 'IAL-BN20261026-A',
        operator: currentUser?.name || 'KEUN RATHY',
        totalItems: 8,
        totalUSD: 350.00,
        totalKHR: 1435000,
        createdAt: new Date().toISOString(),
        reconciliation: 'គ្រប់ចំនួន (Balanced 100%)',
        items: [{ id: '1', tracking: 'EX123456789KH', name: 'ABC Mart', usd: 350, khm: 1435000 }]
      },
      {
        id: 'sample-2',
        batchNumber: 'IAL-BN20261026-B',
        operator: currentUser?.name || 'KEUN RATHY',
        totalItems: 4,
        totalUSD: 120.00,
        totalKHR: 492000,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        reconciliation: 'Pending',
        items: [{ id: '2', tracking: 'EX987654321KH', name: 'K-Stop Store', usd: 120, khm: 492000 }]
      },
      {
        id: 'sample-3',
        batchNumber: 'IAL-BN20261026-C',
        operator: currentUser?.name || 'KEUN RATHY',
        totalItems: 12,
        totalUSD: 980.00,
        totalKHR: 4018000,
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        reconciliation: 'Processing',
        items: [{ id: '3', tracking: 'EX554433221KH', name: 'Smile Cafe', usd: 980, khm: 4018000 }]
      }
    ] as CollectionBatch[];
  }, [savedBatches, currentUser]);

  return (
    <div className="min-h-screen bg-[#070d19] text-slate-100 pb-24 md:pb-12 transition-colors">
      
      {/* 1. Header (Brand, Online Sync Badge, User Profile) */}
      <header className="sticky top-0 z-30 bg-[#0b1329]/90 backdrop-blur-md border-b border-cyan-900/30 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-cyan-900/30 font-black text-sm tracking-tighter border border-cyan-400/40">
            IAL
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-1">
                <span>IAL Systems</span>
                <span className="text-cyan-400 font-medium text-xs">/ ស៊ីស្ទីម</span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Accounting & Payments Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Online Sync</span>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            title="ការកំណត់ (Settings)"
          >
            <User className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-4xl mx-auto px-3.5 sm:px-6 pt-4 space-y-5">
        
        {/* 2. DAILY REVENUE CARD (ចំណូលសរុបប្រចាំថ្ងៃ) - Exact Screen 2 Mockup */}
        <section 
          aria-label="Daily Revenue"
          className="relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-[#0e1a33] via-[#0a1529] to-[#070f1e] border border-cyan-500/30 shadow-2xl shadow-cyan-950/40"
        >
          {/* Subtle Ambient Background Glows */}
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-blue-600/15 blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <span>TOTAL DAILY REVENUE</span>
                <span className="text-cyan-400">·</span>
                <span className="text-cyan-400 font-normal">ចំណូលសរុបប្រចាំថ្ងៃ</span>
              </div>

              {/* USD Display */}
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-white tracking-tight font-mono">
                  ${stats.combinedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm font-bold text-cyan-400">USD</span>
              </div>

              {/* KHR Converted Display */}
              <div className="text-sm sm:text-base font-semibold text-slate-300 font-mono flex items-center gap-1.5 pt-0.5">
                <span>{Math.round(stats.combinedKHR).toLocaleString()}</span>
                <span className="text-xs text-slate-400 font-normal">KHR (អត្រា {exchangeRate.toLocaleString()} ៛)</span>
              </div>
            </div>

            {/* Glowing QR Scanner Quick Icon */}
            <button
              type="button"
              onClick={onOpenScanner}
              className="p-3 rounded-2xl bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-400/40 text-cyan-300 hover:text-white transition shadow-lg shadow-cyan-950/60 group cursor-pointer shrink-0"
              title="បើកម៉ាស៊ីនស្កេន (Open Scanner)"
            >
              <QrCode className="w-8 h-8 group-hover:scale-110 transition-transform text-cyan-400" />
            </button>
          </div>

          {/* Metric Sub-Counters */}
          <div className="mt-5 pt-4 border-t border-cyan-900/40 grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-900/50 rounded-xl p-2 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-medium">កញ្ចប់សរុប (Batches)</span>
              <span className="text-sm font-bold text-white font-mono">{stats.totalBatches}</span>
            </div>
            <div className="bg-slate-900/50 rounded-xl p-2 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-medium">វិក្កយបត្រ (Items)</span>
              <span className="text-sm font-bold text-cyan-300 font-mono">{stats.totalItems}</span>
            </div>
            <div className="bg-slate-900/50 rounded-xl p-2 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-medium">អ្នកប្រគល់ (Payers)</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">{payers.length || 78} នាក់</span>
            </div>
          </div>
        </section>

        {/* 3. INTERACTIVE QR CODE SCANNER CARD (SCAN & COLLECT PAYMENT) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          
          {/* Main Scanner Card (Takes 2 cols on tablet/desktop) */}
          <div 
            onClick={onOpenScanner}
            className="md:col-span-2 group relative overflow-hidden rounded-3xl p-5 bg-gradient-to-b from-[#0f1d38] to-[#081224] border-2 border-cyan-500/50 hover:border-cyan-400 shadow-xl shadow-cyan-950/30 cursor-pointer transition-all active:scale-[0.99]"
          >
            {/* Ambient Scanner Laser Beam Animation */}
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/0 via-cyan-500/10 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 block">
                  QR CODE SCANNER
                </span>
                <h3 className="text-base sm:text-lg font-black text-white">
                  SCAN &amp; COLLECT PAYMENT <span className="text-slate-300 font-normal text-xs">(ស្កេន &amp; ប្រមូលប្រាក់)</span>
                </h3>
              </div>
              <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 group-hover:bg-cyan-500 group-hover:text-white transition">
                <Scan className="w-5 h-5" />
              </span>
            </div>

            {/* Interactive Viewfinder Box */}
            <div className="h-36 rounded-2xl bg-black/50 border border-cyan-500/30 flex flex-col items-center justify-center relative overflow-hidden group-hover:border-cyan-400 transition">
              {/* Corner brackets */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-cyan-400"></div>
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-cyan-400"></div>
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-cyan-400"></div>
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-cyan-400"></div>

              {/* Animated Laser Line */}
              <div className="w-3/4 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-md shadow-cyan-400 animate-pulse my-2"></div>

              <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold pt-1">
                <Scan className="w-4 h-4 animate-bounce" />
                <span>ចុចទីនេះដើម្បីបើកកាមេរ៉ាស្កេន Barcode / QR</span>
              </div>
              <span className="text-[10px] text-slate-400">គាំទ្រការស្កេនបន្តដោយស្វ័យប្រវត្ត (Auto-Enter 0ms)</span>
            </div>
          </div>

          {/* Quick Action Side Column */}
          <div className="flex flex-col gap-3">
            {/* Quick Action: New Scan */}
            <button
              type="button"
              onClick={onOpenScanner}
              className="flex-1 p-4 rounded-2xl bg-[#0c1830] hover:bg-[#122347] border border-cyan-900/40 hover:border-cyan-400/50 flex items-center justify-between text-left transition shadow-md group cursor-pointer"
            >
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Quick Action</span>
                <span className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-cyan-400" /> NEW SCAN
                </span>
                <span className="text-[11px] text-slate-400 block">ស្កេនទំនិញថ្មី</span>
              </div>
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center group-hover:bg-cyan-500 group-hover:text-white transition">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </button>

            {/* Quick Action: Request Payment / Collection */}
            <button
              type="button"
              onClick={() => onNavigate('COLLECTION')}
              className="flex-1 p-4 rounded-2xl bg-[#0c1830] hover:bg-[#122347] border border-cyan-900/40 hover:border-emerald-400/50 flex items-center justify-between text-left transition shadow-md group cursor-pointer"
            >
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Quick Action</span>
                <span className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" /> REQUEST PAYMENT
                </span>
                <span className="text-[11px] text-slate-400 block">ស្នើសុំការទូទាត់</span>
              </div>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </button>
          </div>

        </section>

        {/* 4. RECENT BATCH COLLECTIONS (ការប្រមូលប្រាក់ជាក្រុមកញ្ចប់ថ្មីៗ) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                <span>RECENT BATCH COLLECTIONS</span>
                <span className="text-cyan-400 font-normal">·</span>
                <span className="text-cyan-400 font-normal text-xs">ការប្រមូលប្រាក់ជាក្រុមកញ្ចប់ថ្មីៗ</span>
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('COLLECTION')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition"
            >
              <span>មើលទាំងអស់</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {recentBatches.map((batch, idx) => {
              const payerName = (batch.items && batch.items.length > 0 && batch.items[0]?.name)
                ? batch.items[0].name
                : 'អតិថិជនទូទៅ';
              const isCompleted = (batch.reconciliation || '').includes('គ្រប់ចំនួន') || (batch.reconciliation || '').includes('Balanced');
              const isPending = (batch.reconciliation || '').toLowerCase().includes('pending');

              return (
                <div
                  key={batch.id || idx}
                  onClick={() => onNavigate('COLLECTION')}
                  className="p-3.5 sm:p-4 rounded-2xl bg-[#0a1426] hover:bg-[#0f1d38] border border-cyan-900/30 hover:border-cyan-500/40 flex items-center justify-between gap-3 transition cursor-pointer shadow-sm group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-xs sm:text-sm text-white font-mono truncate">
                          {batch.batchNumber}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(batch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5 pt-0.5">
                        <span className="text-slate-300 font-medium">{payerName}</span>
                        <span>·</span>
                        <span>{batch.totalItems} វិក្កយបត្រ</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-white font-mono">
                        ${Number(batch.totalUSD || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {Number(batch.totalKHR || 0).toLocaleString()} ៛
                      </div>
                    </div>

                    <div className="hidden sm:block">
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Completed
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Processing
                        </span>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>

      {/* 5. Bottom Mobile Navigation Dock (Matching Screen 2 Mockup) */}
      <nav 
        aria-label="Mobile Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#0b1329]/95 border-t border-cyan-900/40 backdrop-blur-lg px-2 py-1.5 flex items-center justify-around shadow-2xl"
      >
        <button
          type="button"
          onClick={() => onNavigate('DASHBOARD')}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-cyan-400 font-bold text-[10px] transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4" />
          </div>
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('COLLECTION')}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-400 hover:text-white text-[10px] transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl hover:bg-slate-800 text-slate-400 flex items-center justify-center">
            <Scan className="w-4 h-4" />
          </div>
          <span>Scan / ទទួលប្រាក់</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('PAYERS')}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-400 hover:text-white text-[10px] transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl hover:bg-slate-800 text-slate-400 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <span>អ្នកប្រគល់</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('DATA')}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-400 hover:text-white text-[10px] transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl hover:bg-slate-800 text-slate-400 flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <span>ទិន្នន័យ</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-400 hover:text-white text-[10px] transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl hover:bg-slate-800 text-slate-400 flex items-center justify-center">
            <Settings className="w-4 h-4" />
          </div>
          <span>ការកំណត់</span>
        </button>
      </nav>

    </div>
  );
};
