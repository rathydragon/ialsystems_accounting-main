import React from 'react';
import { 
  Sun, 
  Moon, 
  Settings, 
  Send, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  LayoutDashboard,
  ShieldCheck
} from 'lucide-react';
import { AppSettings, AuthUser } from '../types';

interface NavbarProps {
  settings: AppSettings;
  user?: AuthUser | null;
  currentView: 'COLLECTION' | 'PERMISSIONS';
  onNavigate: (view: 'COLLECTION' | 'PERMISSIONS') => void;
  onLogout?: () => void;
  onOpenSettings: () => void;
  onOpenTelegramPreview: () => void;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  user,
  currentView,
  onNavigate,
  onLogout,
  onOpenSettings,
  onOpenTelegramPreview,
  onToggleTheme
}) => {
  const isConnected = !!settings.webAppUrl.trim();

  return (
    <header className="bg-white dark:bg-[#0b1329] border-b-2 border-red-600/90 dark:border-red-700/80 sticky top-0 z-30 transition-colors shadow-xs w-full">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Logo & Status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#0d1b3e] dark:bg-[#122452] border border-red-500/40 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
              <span className="text-red-500 font-black">$</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-[#0c1a3a] dark:text-white tracking-tight truncate">
                  Accounting & Receipts
                </h1>
                <span 
                  className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isConnected 
                      ? 'bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-800' 
                      : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/80 dark:text-red-200 dark:border-red-800'
                  }`}
                >
                  {isConnected ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-blue-800 dark:text-blue-300" />
                      Google Sync Active
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3 text-red-600" />
                      Demo / Local Mode
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                Google Sheets • Drive WebP Storage • Telegram Bot Alerts
              </p>
            </div>
          </div>

          {/* Navigation Tabs (Collection vs Permissions) */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onNavigate('COLLECTION')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                currentView === 'COLLECTION'
                  ? 'bg-white dark:bg-slate-800 text-blue-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>ទទួលប្រាក់ (Collection)</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('PERMISSIONS')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                currentView === 'PERMISSIONS'
                  ? 'bg-white dark:bg-slate-800 text-blue-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>សិទ្ធិប្រើប្រាស់</span>
            </button>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            


            {/* Telegram Preview */}
            <button
              id="btn-nav-telegram"
              onClick={onOpenTelegramPreview}
              title="Preview Telegram Bot Message"
              className="p-2 sm:px-3 sm:py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-900 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-800 transition flex items-center gap-1.5"
            >
              <Send className="w-4 h-4 text-blue-800 dark:text-blue-400" />
              <span className="hidden md:inline">Telegram Alert</span>
            </button>



            {/* Settings */}
            <button
              id="btn-nav-settings"
              onClick={onOpenSettings}
              title="API & Connection Settings"
              className="p-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition relative"
            >
              <Settings className="w-4 h-4" />
              {!isConnected && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-600"></span>
              )}
            </button>

            {/* Dark / Light Toggle */}
            <button
              id="btn-nav-theme"
              type="button"
              onClick={onToggleTheme}
              title={settings.darkMode ? "Switch to Light Mode (ប្តូរទៅពន្លឺ)" : "Switch to Dark Mode (ប្តូរទៅងងឹត)"}
              className="p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            >
              {settings.darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#0d1b3e] dark:text-slate-200" />
              )}
            </button>

            {/* Authenticated User Profile & Sign Out */}
            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 ml-1">
                <div className="flex items-center gap-2 max-w-[180px] sm:max-w-[220px]" title={`${user.name} (${user.email})`}>
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="hidden xl:block min-w-0 text-left">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 truncate">
                      <span className="truncate">{user.name}</span>
                      {user.role && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                          {user.role}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate leading-tight">
                      {user.email}
                    </div>
                  </div>
                </div>

                {onLogout && (
                  <button
                    id="btn-nav-logout"
                    type="button"
                    onClick={onLogout}
                    title="Sign Out (ចាកចេញ)"
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-800 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
