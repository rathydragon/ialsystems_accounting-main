import React, { useState } from 'react';
import { 
  Sun, 
  Moon, 
  Settings, 
  Send, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  LayoutDashboard,
  Users,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Database,
  FileSpreadsheet,
  Fuel,
  ClipboardCheck,
  Receipt,
  BarChart3
} from 'lucide-react';
import { AppSettings, AuthUser, NavView, normalizeUserRole } from '../types';

interface SidebarProps {
  settings: AppSettings;
  user?: AuthUser | null;
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  onLogout?: () => void;
  onOpenSettings: () => void;
  onOpenTelegramPreview: () => void;
  onToggleTheme: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  settings,
  user,
  currentView,
  onNavigate,
  onLogout,
  onOpenSettings,
  onOpenTelegramPreview,
  onToggleTheme,
  isCollapsed,
  onToggleCollapse
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isConnected = !!settings.webAppUrl?.trim();

  const isDelivery = user?.role === 'DELIVERY';

  const allNavItems = [
    {
      id: 'COLLECTION' as const,
      label: 'Collection',
      shortLabel: 'Collection',
      icon: LayoutDashboard,
      badge: undefined
    },
    {
      id: 'PAYERS' as const,
      label: 'Company Staff',
      shortLabel: 'Company Staff',
      icon: Users,
      badge: undefined
    },
    {
      id: 'DATA' as const,
      label: 'Data',
      shortLabel: 'Data',
      icon: Database,
      badge: undefined
    },
    {
      id: 'DATA_BM' as const,
      label: 'Pending BM',
      shortLabel: 'Pending BM',
      icon: FileSpreadsheet,
      badge: undefined
    },
    {
      id: 'FOLLOWUP_BM' as const,
      label: 'FollowUp BM',
      shortLabel: 'FollowUp BM',
      icon: ClipboardCheck,
      badge: undefined
    },
    {
      id: 'SOKIMEX_POSTPAID' as const,
      label: 'SOKIMEX POSTPAID',
      shortLabel: 'SOKIMEX POSTPAID',
      icon: Fuel,
      badge: undefined
    },
    {
      id: 'BANK_SLIPS' as const,
      label: 'Bank Slips',
      shortLabel: 'Bank Slips',
      icon: Receipt,
      badge: undefined
    },
    {
      id: 'DATA_REPORT' as const,
      label: 'Data Report',
      shortLabel: 'Data Report',
      icon: BarChart3,
      badge: undefined
    },
    ...(user?.role === 'ADMIN' ? [
      {
        id: 'PERMISSIONS' as const,
        label: 'Permissions',
        shortLabel: 'Permissions',
        icon: ShieldCheck,
        badge: undefined
      },
      {
        id: 'SETTINGS' as const,
        label: 'Settings',
        shortLabel: 'Settings',
        icon: Settings,
        badge: undefined
      }
    ] : [])
  ];

  // បញ្ជាក់៖ Delivery ប្រើប្រាស់ និងមើលឃើញ បានតែ បង្កាន់ដៃធនាគារ (Bank Slips & AWBN) Page ប៉ុណ្ណោះ
  const navItems = isDelivery
    ? allNavItems.filter(item => item.id === 'BANK_SLIPS')
    : allNavItems;

  return (
    <>
      {/* Mobile Top Bar with Hamburger */}
      <div className="lg:hidden sticky top-0 z-40 bg-white dark:bg-[#0b1329] border-b border-slate-200 dark:border-slate-800 px-4 h-14 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0d1b3e] dark:bg-[#122452] border border-red-500/40 text-white flex items-center justify-center font-bold text-sm">
            <span className="text-red-500 font-black">$</span>
          </div>
          <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
            Accounting
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Open Menu"
        >
          {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-white dark:bg-[#0b1329] border-r border-slate-200 dark:border-slate-800 transition-all duration-300 shadow-sm
          ${isCollapsed ? 'w-[76px]' : 'w-[280px]'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-850 shrink-0">
          <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? 'justify-center w-full' : ''}`}>
            <div className="w-10 h-10 rounded-xl bg-[#0d1b3e] dark:bg-[#122452] border border-red-500/40 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
              <span className="text-red-500 font-black">$</span>
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold text-[#0c1a3a] dark:text-white tracking-tight truncate" title="Accounting & Receipts">
                  Accounting & Receipts
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="text-xs text-slate-400 truncate">
                    {isConnected ? 'Sheets Synced' : 'Local Mode'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          {!isCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
          )}
        </div>

        {/* Collapsed Re-expand Button for Desktop */}
        {isCollapsed && (
          <div className="hidden lg:flex justify-center py-2 border-b border-slate-100 dark:border-slate-850">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Expand Sidebar"
            >
              <ChevronRight className="w-4.5 h-4.5" />
            </button>
          </div>
        )}

        {/* Main Navigation Menu */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          
          {/* Main Links */}
          <div className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 text-xs font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase mb-2">
                Main Menu
              </div>
            )}

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id);
                    setIsMobileOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition group cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/20 dark:bg-blue-600'
                      : 'text-slate-600 dark:text-slate-300 font-normal hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                  title={item.label}
                >
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-700 dark:text-slate-400'}`} />
                  {!isCollapsed && (
                    <span className="truncate flex-1 text-left">
                      {item.label}
                    </span>
                  )}
                  {!isCollapsed && item.badge && (
                    <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                      isActive ? 'bg-white/20 text-white font-bold' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* System & Tools Section */}
          <div className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 text-xs font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase mb-2">
                System Tools
              </div>
            )}

            {/* Telegram Alert Modal Trigger */}
            <button
              id="btn-sidebar-telegram"
              type="button"
              onClick={() => {
                onOpenTelegramPreview();
                setIsMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-normal text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer ${
                isCollapsed ? 'justify-center' : ''
              }`}
              title="Telegram Alert & Bot Test"
            >
              <Send className="w-4.5 h-4.5 text-blue-500 shrink-0" />
              {!isCollapsed && <span className="truncate">Telegram Alert</span>}
            </button>


            {/* Theme Toggle Button */}
            <button
              id="btn-sidebar-theme"
              type="button"
              onClick={onToggleTheme}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-normal text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition cursor-pointer ${
                isCollapsed ? 'justify-center' : ''
              }`}
              title={settings.darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {settings.darkMode ? (
                <Sun className="w-4.5 h-4.5 text-amber-500 shrink-0" />
              ) : (
                <Moon className="w-4.5 h-4.5 text-indigo-500 shrink-0" />
              )}
              {!isCollapsed && (
                <span className="truncate">
                  {settings.darkMode ? 'Light Mode' : 'Dark Mode'}
                </span>
              )}
            </button>
          </div>

        </div>

        {/* User Profile & Logout Footer */}
        {user && (
          <div className="p-3 border-t border-slate-100 dark:border-slate-850 bg-slate-50/60 dark:bg-slate-950/40 shrink-0">
            <div className={`flex items-center gap-2.5 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
              
              <div className="flex items-center gap-2.5 min-w-0" title={`${user.name} (${user.email})`}>
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {!isCollapsed && (
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                      <span className="truncate">{user.name}</span>
                      {user.role && (() => {
                        const normRole = normalizeUserRole(user.role);
                        const roleColor = 
                          normRole === 'ADMIN' 
                            ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300' 
                            : normRole === 'ACCOUNTANT_MANAGER'
                              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                              : normRole === 'ACCOUNTANT'
                                ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                : normRole === 'CS_TEAMS'
                                  ? 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-300/40'
                                  : normRole === 'CS_TEAMS_OPT'
                                    ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-300/40'
                                    : normRole === 'DELIVERY'
                                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300/40'
                                      : normRole === 'DELIVERY_OPT'
                                        ? 'bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 border border-orange-300/40'
                                        : normRole === 'HUB'
                                          ? 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-300/40'
                                          : normRole === 'HUB_OPT'
                                            ? 'bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-300 border border-violet-300/40'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
                        
                        const roleText =
                          normRole === 'ACCOUNTANT_MANAGER'
                            ? 'Accountant (mgr)'
                            : normRole === 'CS_TEAMS'
                              ? 'Cs Teams'
                              : normRole === 'CS_TEAMS_OPT'
                                ? 'Cs Teams(Opt)'
                                : normRole === 'DELIVERY'
                                  ? 'Delivery'
                                  : normRole === 'DELIVERY_OPT'
                                    ? 'Delivery(Opt)'
                                    : normRole === 'HUB'
                                      ? 'Hub'
                                      : normRole === 'HUB_OPT'
                                        ? 'Hub(Opt)'
                                        : normRole === 'VIEWER'
                                          ? 'VIEWER (មើលប៉ុណ្ណោះ)'
                                          : user.role;

                        return (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${roleColor}`}>
                            {roleText}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {user.email}
                    </div>
                  </div>
                )}
              </div>

              {onLogout && !isCollapsed && (
                <button
                  id="btn-sidebar-logout"
                  type="button"
                  onClick={onLogout}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                  title="ចាកចេញ (Sign Out)"
                >
                  <LogOut className="w-4.5 h-4.5" />
                </button>
              )}

            </div>
          </div>
        )}

      </aside>
    </>
  );
};
