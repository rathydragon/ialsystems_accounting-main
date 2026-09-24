import React from 'react';
import { ScanLine, Users, Database, Settings, FileSpreadsheet } from 'lucide-react';
import { NavView } from '../types';

interface MobileBottomNavProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenSettings: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onNavigate,
  onOpenSettings,
}) => {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0a0f1d]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800/80 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] select-none">
      <div className="max-w-md mx-auto px-2 flex items-center justify-around h-16 pb-[env(safe-area-inset-bottom,0px)]">
        
        {/* 1. Scan / ទទួលប្រាក់ */}
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
          <span className={`text-[10px] font-medium tracking-tight mt-0.5 transition-colors ${
            currentView === 'COLLECTION'
              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}>
            ទទួលប្រាក់
          </span>
        </button>

        {/* 2. អ្នកប្រគល់ */}
        <button
          type="button"
          onClick={() => onNavigate('PAYERS')}
          className="relative flex-1 flex flex-col items-center justify-center py-1 transition-all group cursor-pointer"
        >
          {currentView === 'PAYERS' && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-emerald-500 dark:bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
          )}
          <div className={`p-1 rounded-xl transition-all ${
            currentView === 'PAYERS'
              ? 'text-emerald-600 dark:text-emerald-400 scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'
              : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
          }`}>
            <Users className="w-5 h-5" />
          </div>
          <span className={`text-[10px] font-medium tracking-tight mt-0.5 transition-colors ${
            currentView === 'PAYERS'
              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}>
            អ្នកប្រគល់
          </span>
        </button>

        {/* 3. ទិន្នន័យ */}
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
          <span className={`text-[10px] font-medium tracking-tight mt-0.5 transition-colors ${
            currentView === 'DATA'
              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}>
            ទិន្នន័យ
          </span>
        </button>

        {/* 4. Data BM */}
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
          <span className={`text-[10px] font-medium tracking-tight mt-0.5 transition-colors ${
            currentView === 'DATA_BM'
              ? 'text-blue-600 dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}>
            Data BM
          </span>
        </button>

        {/* 4. ការកំណត់ */}
        <button
          type="button"
          onClick={() => onNavigate('SETTINGS')}
          className="relative flex-1 flex flex-col items-center justify-center py-1 transition-all group cursor-pointer active:scale-95"
        >
          {currentView === 'SETTINGS' && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-blue-600 dark:bg-blue-400 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.9)]" />
          )}
          <div className={`p-1 rounded-xl transition-all ${
            currentView === 'SETTINGS'
              ? 'text-blue-600 dark:text-blue-400 scale-110 drop-shadow-[0_0_8px_rgba(37,99,235,0.5)]'
              : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
          }`}>
            <Settings className={`w-5 h-5 transition-transform duration-300 ${currentView === 'SETTINGS' ? 'rotate-45' : 'group-hover:rotate-45'}`} />
          </div>
          <span className={`text-[10.5px] font-medium tracking-tight mt-0.5 transition-colors ${
            currentView === 'SETTINGS'
              ? 'text-blue-600 dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}>
            ការកំណត់
          </span>
        </button>

      </div>
    </div>
  );
};
