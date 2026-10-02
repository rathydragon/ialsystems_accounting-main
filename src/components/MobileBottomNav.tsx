import React from 'react';
import { ScanLine, Database, FileSpreadsheet, Fuel, ClipboardCheck, Receipt } from 'lucide-react';
import { NavView, AuthUser, UserPermission } from '../types';
import { canUserAccessPage } from '../services/userPermissionService';

interface MobileBottomNavProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenSettings?: () => void;
  user?: AuthUser | null;
  permissions?: UserPermission[];
  userRole?: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onNavigate,
  user,
  permissions,
  userRole,
}) => {
  // If Delivery role or only has Bank Slips, show dedicated Bank Slips navigation
  const canCollection = canUserAccessPage('COLLECTION', user, permissions);
  const canBankSlips = canUserAccessPage('BANK_SLIPS', user, permissions);
  const canData = canUserAccessPage('DATA', user, permissions);
  const canDataBm = canUserAccessPage('DATA_BM', user, permissions);
  const canFollowUpBm = canUserAccessPage('FOLLOWUP_BM', user, permissions);
  const canSokimex = canUserAccessPage('SOKIMEX_POSTPAID', user, permissions);

  if (userRole === 'DELIVERY' || (canBankSlips && !canCollection && !canData)) {
    return (
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0a0f1d]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800/80 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] select-none">
        <div className="max-w-md mx-auto px-4 flex items-center justify-center h-16 pb-[env(safe-area-inset-bottom,0px)]">
          <button
            type="button"
            onClick={() => onNavigate('BANK_SLIPS')}
            className="relative flex items-center justify-center gap-2 py-2 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-500/30 cursor-pointer active:scale-95 transition"
          >
            <Receipt className="w-5 h-5" />
            <span>បង្កាន់ដៃធនាគារ (Bank Slips & AWBN)</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0a0f1d]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800/80 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] select-none">
      <div className="max-w-lg mx-auto px-1 sm:px-3 flex items-center justify-around h-16 pb-[env(safe-area-inset-bottom,0px)]">
        
        {/* 1. Scan / ទទួលប្រាក់ */}
        {canCollection && (
          <button
            type="button"
            onClick={() => onNavigate('COLLECTION')}
            className="relative flex-1 flex flex-col items-center justify-center py-1 transition-all group cursor-pointer"
          >
            {currentView === 'COLLECTION' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-emerald-500 dark:bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
            )}
            <div className={`p-1 rounded-xl transition-all ${
              currentView === 'COLLECTION'
                ? 'text-emerald-600 dark:text-emerald-400 scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
            }`}>
              <ScanLine className="w-5 h-5" />
            </div>
            <span className={`text-[11px] sm:text-xs font-semibold tracking-tight mt-0.5 transition-colors whitespace-nowrap ${
              currentView === 'COLLECTION'
                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              ទទួលប្រាក់
            </span>
          </button>
        )}

        {/* 2. ទិន្នន័យ */}
        {canData && (
          <button
            type="button"
            onClick={() => onNavigate('DATA')}
            className="relative flex-1 flex flex-col items-center justify-center py-1 transition-all group cursor-pointer"
          >
            {currentView === 'DATA' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-emerald-500 dark:bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
            )}
            <div className={`p-1 rounded-xl transition-all ${
              currentView === 'DATA'
                ? 'text-emerald-600 dark:text-emerald-400 scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <span className={`text-[11px] sm:text-xs font-semibold tracking-tight mt-0.5 transition-colors whitespace-nowrap ${
              currentView === 'DATA'
                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              ទិន្នន័យ
            </span>
          </button>
        )}

        {/* 3. Data BM */}
        {canDataBm && (
          <button
            type="button"
            onClick={() => onNavigate('DATA_BM')}
            className="relative flex-1 flex flex-col items-center justify-center py-1 transition-all group cursor-pointer"
          >
            {currentView === 'DATA_BM' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-blue-600 dark:bg-blue-400 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.9)]" />
            )}
            <div className={`p-1 rounded-xl transition-all ${
              currentView === 'DATA_BM'
                ? 'text-blue-600 dark:text-blue-400 scale-110 drop-shadow-[0_0_8px_rgba(37,99,235,0.5)]'
                : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
            }`}>
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <span className={`text-[11px] sm:text-xs font-semibold tracking-tight mt-0.5 transition-colors whitespace-nowrap ${
              currentView === 'DATA_BM'
                ? 'text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              Pending BM
            </span>
          </button>
        )}

        {/* 4. Bank Slips (បង្កាន់ដៃ) */}
        {canBankSlips && (
          <button
            type="button"
            onClick={() => onNavigate('BANK_SLIPS')}
            className="relative flex-1 flex flex-col items-center justify-center py-1 transition-all group cursor-pointer"
          >
            {currentView === 'BANK_SLIPS' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.9)]" />
            )}
            <div className={`p-1 rounded-xl transition-all ${
              currentView === 'BANK_SLIPS'
                ? 'text-cyan-600 dark:text-cyan-400 scale-110 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
            }`}>
              <Receipt className="w-5 h-5" />
            </div>
            <span className={`text-[11px] sm:text-xs font-semibold tracking-tight mt-0.5 transition-colors whitespace-nowrap ${
              currentView === 'BANK_SLIPS'
                ? 'text-cyan-600 dark:text-cyan-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              បង្កាន់ដៃ
            </span>
          </button>
        )}

        {/* 5. FollowUp BM */}
        {canFollowUpBm && (
          <button
            type="button"
            onClick={() => onNavigate('FOLLOWUP_BM')}
            className="relative flex-1 flex flex-col items-center justify-center py-1 transition-all group cursor-pointer"
          >
            {currentView === 'FOLLOWUP_BM' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-purple-600 dark:bg-purple-400 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.9)]" />
            )}
            <div className={`p-1 rounded-xl transition-all ${
              currentView === 'FOLLOWUP_BM'
                ? 'text-purple-600 dark:text-purple-400 scale-110 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]'
                : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
            }`}>
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <span className={`text-[11px] sm:text-xs font-semibold tracking-tight mt-0.5 transition-colors whitespace-nowrap ${
              currentView === 'FOLLOWUP_BM'
                ? 'text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              FollowUp
            </span>
          </button>
        )}

        {/* 6. Sokimex Postpaid */}
        {canSokimex && (
          <button
            type="button"
            onClick={() => onNavigate('SOKIMEX_POSTPAID')}
            className="relative flex-1 flex flex-col items-center justify-center py-1 transition-all group cursor-pointer"
          >
            {currentView === 'SOKIMEX_POSTPAID' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-orange-600 dark:bg-orange-400 rounded-full shadow-[0_0_10px_rgba(234,88,12,0.9)]" />
            )}
            <div className={`p-1 rounded-xl transition-all ${
              currentView === 'SOKIMEX_POSTPAID'
                ? 'text-orange-600 dark:text-orange-400 scale-110 drop-shadow-[0_0_8px_rgba(234,88,12,0.5)]'
                : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
            }`}>
              <Fuel className="w-5 h-5" />
            </div>
            <span className={`text-[11px] sm:text-xs font-semibold tracking-tight mt-0.5 transition-colors whitespace-nowrap ${
              currentView === 'SOKIMEX_POSTPAID'
                ? 'text-orange-600 dark:text-orange-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              Sokimex
            </span>
          </button>
        )}

      </div>
    </div>
  );
};
