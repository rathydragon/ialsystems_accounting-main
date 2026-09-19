import React, { useState, useMemo, useEffect } from 'react';
import { 
  ShieldCheck, 
  UserPlus, 
  Search, 
  Trash2, 
  Check, 
  X, 
  ShieldAlert, 
  Users, 
  UserCheck, 
  Eye, 
  Briefcase, 
  Crown,
  Calendar,
  Sparkles,
  Info,
  AlertCircle,
  Lock,
  RefreshCw,
  History,
  Clock,
  Download,
  Activity,
  Filter,
  LogIn,
  LogOut,
  Send,
  AlertTriangle,
  FileSpreadsheet,
  Database
} from 'lucide-react';
import { UserPermission, UserRole, AuthUser, UserActivityLog, ActivityActionType } from '../types';
import { subscribeToActivityLogs, exportActivityLogsToCSV, syncActivityLogsToGoogleSheets } from '../services/activityLogService';

export const MASTER_ADMIN_EMAIL = 'rathykim34@gmail.com';
export const isMasterAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  return email.toLowerCase().trim() === MASTER_ADMIN_EMAIL;
};

interface UserManagementPageProps {
  users: UserPermission[];
  currentUser: AuthUser | null;
  webAppUrl?: string;
  onAddUser: (newUser: Omit<UserPermission, 'id' | 'createdAt'>) => boolean;
  onUpdateRole: (id: string, newRole: UserRole) => void;
  onToggleStatus: (id: string) => void;
  onDeleteUser: (id: string, email?: string) => void;
  onSyncGooglePermissions?: () => Promise<boolean | void>;
  onSyncFirebasePermissions?: () => Promise<any>;
}

export const UserManagementPage: React.FC<UserManagementPageProps> = ({
  users,
  currentUser,
  webAppUrl,
  onAddUser,
  onUpdateRole,
  onToggleStatus,
  onDeleteUser,
  onSyncGooglePermissions,
  onSyncFirebasePermissions
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<'USERS' | 'LOGS'>('USERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserPermission | null>(null);

  // Form states for Add User
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('ACCOUNTANT');
  const [newStatus, setNewStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [formError, setFormError] = useState<string | null>(null);

  // Activity Logs state
  // Activity Logs state (pre-populate immediately from localStorage so UI is never blank or delayed)
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>(() => {
    try {
      const saved = localStorage.getItem('accounting_user_activity_logs_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  });
  const [logSearch, setLogSearch] = useState('');
  const [logFilterGroup, setLogFilterGroup] = useState<'ALL' | 'COMMITS' | 'LOGINS' | 'TELEGRAM' | 'PERMISSIONS' | 'DELETIONS'>('ALL');
  const [isSyncingLogs, setIsSyncingLogs] = useState(false);
  const [syncLogsToast, setSyncLogsToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSyncLogsToGoogle = async () => {
    let targetUrl = webAppUrl?.trim();
    if (!targetUrl) {
      try {
        const rawSettings = localStorage.getItem('accounting_app_settings');
        if (rawSettings) {
          const parsed = JSON.parse(rawSettings);
          targetUrl = parsed?.webAppUrl?.trim();
        }
      } catch (_) {}
    }

    if (!targetUrl) {
      alert('សូមភ្ជាប់ Google Sheets Web App URL ក្នុងផ្ទាំង Settings ជាមុនសិន!');
      return;
    }

    if (activityLogs.length === 0) {
      alert('មិនទាន់មានកំណត់ត្រាសកម្មភាពដើម្បី Sync ទេ!');
      return;
    }

    setIsSyncingLogs(true);
    setSyncLogsToast(null);
    try {
      const res = await syncActivityLogsToGoogleSheets(activityLogs, targetUrl);
      if (res.success) {
        setSyncLogsToast({
          message: `បានរក្សាទុក និង Sync កំណត់ត្រា ${activityLogs.length} ទៅ Google Sheets (Tab: "User_Logs") ជោគជ័យ!`,
          type: 'success'
        });
        setTimeout(() => setSyncLogsToast(null), 5000);
      } else {
        setSyncLogsToast({
          message: 'បរាជ័យក្នុងការ Sync ទៅ Google Sheets: ' + (res.error || 'Network error'),
          type: 'error'
        });
      }
    } catch (err: any) {
      setSyncLogsToast({
        message: 'បរាជ័យក្នុងការ Sync: ' + (err?.message || 'Error'),
        type: 'error'
      });
    } finally {
      setIsSyncingLogs(false);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToActivityLogs((logs) => {
      setActivityLogs(logs);
    });
    return () => unsubscribe();
  }, []);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return activityLogs.filter(log => {
      const q = logSearch.toLowerCase().trim();
      const op = String(log.operator || log.userName || '').toLowerCase();
      const opEmail = String(log.operatorEmail || log.userEmail || '').toLowerCase();
      const bNum = String(log.batchNumber || '').toLowerCase();
      const desc = String(log.description || log.details || '').toLowerCase();
      const targetEm = String(log.targetUserEmail || '').toLowerCase();

      const matchSearch = !q ||
        op.includes(q) ||
        opEmail.includes(q) ||
        bNum.includes(q) ||
        desc.includes(q) ||
        targetEm.includes(q);

      if (!matchSearch) return false;

      if (logFilterGroup === 'ALL') return true;
      if (logFilterGroup === 'COMMITS') return log.action === 'COMMIT_BATCH';
      if (logFilterGroup === 'LOGINS') return log.action === 'LOGIN' || log.action === 'LOGOUT';
      if (logFilterGroup === 'TELEGRAM') return log.action === 'RESEND_TELEGRAM';
      if (logFilterGroup === 'PERMISSIONS') return log.action === 'ADD_USER' || log.action === 'UPDATE_ROLE' || log.action === 'CHANGE_STATUS' || log.action === 'DELETE_USER';
      if (logFilterGroup === 'DELETIONS') return log.action === 'DELETE_BATCH' || log.action === 'DELETE_ALL_BATCHES' || log.action === 'DELETE_USER';
      return true;
    });
  }, [activityLogs, logSearch, logFilterGroup]);

  // Statistics for Logs
  const logStats = useMemo(() => {
    const total = activityLogs.length;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const todayCount = activityLogs.filter(l => l.timestamp && l.timestamp.startsWith(todayStr)).length;
    const commitCount = activityLogs.filter(l => l.action === 'COMMIT_BATCH').length;
    const uniqueOperators = new Set(activityLogs.map(l => l.operatorEmail || l.operator || 'Unknown')).size;
    return { total, todayCount, commitCount, uniqueOperators };
  }, [activityLogs]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchSearch = 
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchRole = roleFilter === 'ALL' || user.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, searchTerm, roleFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => u.role === 'ADMIN').length;
    const accountants = users.filter(u => u.role === 'ACCOUNTANT').length;
    const viewers = users.filter(u => u.role === 'VIEWER').length;
    const active = users.filter(u => u.status === 'ACTIVE').length;
    return { total, admins, accountants, viewers, active };
  }, [users]);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const emailTrimmed = newEmail.trim().toLowerCase();
    if (!emailTrimmed) {
      setFormError('សូមបញ្ចូលអាសយដ្ឋាន Email');
      return;
    }
    if (!emailTrimmed.includes('@') || !emailTrimmed.includes('.')) {
      setFormError('អាសយដ្ឋាន Email មិនត្រឹមត្រូវទេ');
      return;
    }
    if (users.some(u => u.email.toLowerCase() === emailTrimmed)) {
      setFormError('Email នេះមានរួចហើយនៅក្នុងប្រព័ន្ធ!');
      return;
    }
    if (isMasterAdmin(emailTrimmed)) {
      setFormError('Email នេះជា Master Admin ត្រូវបានការពារជាស្រេច!');
      return;
    }

    const success = onAddUser({
      email: emailTrimmed,
      name: newName.trim() || undefined,
      role: newRole,
      status: newStatus
    });

    if (success) {
      setNewEmail('');
      setNewName('');
      setNewRole('ACCOUNTANT');
      setNewStatus('ACTIVE');
      setIsAddModalOpen(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return {
          icon: Crown,
          label: 'Admin (អ្នកគ្រប់គ្រង)',
          className: 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
        };
      case 'ACCOUNTANT':
        return {
          icon: Briefcase,
          label: 'Accountant (គណនេយ្យករ)',
          className: 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
        };
      case 'VIEWER':
        return {
          icon: Eye,
          label: 'Viewer (អ្នកមើល)',
          className: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
        };
    }
  };

  const getActionBadge = (action: ActivityActionType) => {
    switch (action) {
      case 'COMMIT_BATCH':
        return {
          icon: Check,
          label: 'កត់ត្រាកញ្ចប់',
          className: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
        };
      case 'DELETE_BATCH':
      case 'DELETE_ALL_BATCHES':
        return {
          icon: Trash2,
          label: action === 'DELETE_ALL_BATCHES' ? 'សម្អាតកញ្ចប់ទាំងអស់' : 'លុបកញ្ចប់',
          className: 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
        };
      case 'LOGIN':
        return {
          icon: LogIn,
          label: 'ចូលប្រើប្រាស់',
          className: 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
        };
      case 'LOGOUT':
        return {
          icon: LogOut,
          label: 'ចាកចេញ',
          className: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
        };
      case 'RESEND_TELEGRAM':
        return {
          icon: Send,
          label: 'ផ្ញើ Telegram សារជាថ្មី',
          className: 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
        };
      case 'ADD_USER':
        return {
          icon: UserCheck,
          label: 'បន្ថែមអ្នកប្រើ',
          className: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
        };
      case 'UPDATE_ROLE':
        return {
          icon: Crown,
          label: 'ប្តូរសិទ្ធិ (Role)',
          className: 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
        };
      case 'CHANGE_STATUS':
        return {
          icon: AlertTriangle,
          label: 'ប្តូរស្ថានភាព',
          className: 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
        };
      case 'DELETE_USER':
        return {
          icon: Trash2,
          label: 'លុបអ្នកប្រើ',
          className: 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
        };
      default:
        return {
          icon: Activity,
          label: action || 'សកម្មភាព',
          className: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
        };
    }
  };

  const formatLogTime = (isoString?: string): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              គ្រប់គ្រងអ្នកប្រើប្រាស់ និងកំណត់សិទ្ធិ
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            កំណត់កម្រិតសិទ្ធិ (Roles) និងគ្រប់គ្រងគណនី (អ្នកប្រើប្រាស់ថ្មីនឹងទទួលបានសិទ្ធិត្រឹម VIEWER ដោយស្វ័យប្រវត្តិ)
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            {onSyncGooglePermissions && (
              <button
                id="btn-sync-permissions"
                type="button"
                disabled={isSyncing}
                onClick={async () => {
                  setIsSyncing(true);
                  try {
                    await onSyncGooglePermissions();
                  } finally {
                    setIsSyncing(false);
                  }
                }}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
                title="Sync សិទ្ធិអ្នកប្រើប្រាស់ពី Google Sheets"
              >
                <RefreshCw className={`w-4 h-4 text-slate-500 dark:text-slate-400 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync Sheets</span>
              </button>
            )}
            {onSyncFirebasePermissions && (
              <button
                id="btn-sync-firebase-permissions"
                type="button"
                disabled={isSyncingFirebase}
                onClick={async () => {
                  setIsSyncingFirebase(true);
                  try {
                    await onSyncFirebasePermissions();
                  } finally {
                    setIsSyncingFirebase(false);
                  }
                }}
                className="px-3.5 py-2.5 rounded-xl border border-amber-300/80 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-semibold text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
                title="សរសេរ និង Sync សិទ្ធិអ្នកប្រើប្រាស់ទៅកាន់ Firebase Firestore"
              >
                <Database className={`w-4 h-4 text-amber-600 dark:text-amber-400 ${isSyncingFirebase ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync Firebase</span>
              </button>
            )}
            <button
              id="btn-add-user"
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ បន្ថែមអ្នកប្រើប្រាស់ថ្មី</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Tabs: Users & Permissions vs User Activity Logs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          id="tab-btn-users"
          type="button"
          onClick={() => setActiveTab('USERS')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'USERS'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>👥 បញ្ជីអ្នកប្រើប្រាស់ និងសិទ្ធិ ({users.length})</span>
        </button>

        <button
          id="tab-btn-logs"
          type="button"
          onClick={() => setActiveTab('LOGS')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'LOGS'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>📜 កំណត់ត្រាសកម្មភាពអ្នកប្រើ (User Logs)</span>
          {activityLogs.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'LOGS'
                ? 'bg-white/25 text-white'
                : 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
            }`}>
              {activityLogs.length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 👥 TAB 1: USERS & PERMISSIONS */}
      {/* ========================================================================= */}
      {activeTab === 'USERS' && (
        <>
          {!isAdmin && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span><b>សិទ្ធិមើលប៉ុណ្ណោះ (View Only)៖</b> មានតែគណនីកម្រិត <b>Admin</b> ទើបអាចបន្ថែម កែប្រែ ឬលុបសិទ្ធិអ្នកប្រើប្រាស់បាន។</span>
            </div>
          )}

          {/* Stats Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        {/* Total Users */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">អ្នកប្រើសរុប</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
            ● {stats.active} គណនីសកម្ម
          </div>
        </div>

        {/* Admins */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400">Admins</span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Crown className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.admins}</div>
          <div className="text-[11px] text-slate-400 mt-1">សិទ្ធិពេញលេញ</div>
        </div>

        {/* Accountants */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Accountants</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Briefcase className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.accountants}</div>
          <div className="text-[11px] text-slate-400 mt-1">កត់ត្រា & ទាញទិន្នន័យ</div>
        </div>

        {/* Viewers */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Viewers</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
              <Eye className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{stats.viewers}</div>
          <div className="text-[11px] text-slate-400 mt-1">មើលរបាយការណ៍</div>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ស្វែងរកតាម Email ឬ ឈ្មោះ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {/* Role Filter Pills */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'ADMIN', 'ACCOUNTANT', 'VIEWER'] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
                roleFilter === role
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {role === 'ALL' ? 'ទាំងអស់' : role}
            </button>
          ))}
        </div>

      </div>

      {/* Users Permissions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">អ្នកប្រើប្រាស់ (User)</th>
                <th className="py-3 px-4">កម្រិតសិទ្ធិ (Role)</th>
                <th className="py-3 px-4">ស្ថានភាព (Status)</th>
                <th className="py-3 px-4 hidden md:table-cell">កាលបរិច្ឆេទ (Created)</th>
                <th className="py-3 px-4 text-right">សកម្មភាព (Actions)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold">មិនមានអ្នកប្រើប្រាស់ដែលត្រូវនឹងលក្ខខណ្ឌស្វែងរកឡើយ</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const badge = getRoleBadge(user.role);
                  const Icon = badge.icon;
                  const isCurrent = currentUser?.email.toLowerCase() === user.email.toLowerCase();
                  const isMaster = isMasterAdmin(user.email);

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      
                      {/* User details */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                            {(user.name || user.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate">
                              <span>{user.name || user.email.split('@')[0]}</span>
                              {isMaster && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold flex items-center gap-1 border border-purple-200 dark:border-purple-800">
                                  <Crown className="w-2.5 h-2.5" />
                                  Master Admin
                                </span>
                              )}
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                                  អ្នកបច្ចុប្បន្ន (You)
                                </span>
                              )}
                            </div>
                            <div className="text-slate-400 text-[11px] font-mono truncate">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role selection dropdown / Badge */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          {isAdmin && !isMaster ? (
                            <select
                              value={user.role}
                              onChange={(e) => onUpdateRole(user.id, e.target.value as UserRole)}
                              className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition cursor-pointer ${badge.className}`}
                            >
                              <option value="ADMIN">🛡️ Admin (ពេញលេញ)</option>
                              <option value="ACCOUNTANT">💼 Accountant (គណនេយ្យករ)</option>
                              <option value="VIEWER">👁️ Viewer (មើលប៉ុណ្ណោះ)</option>
                            </select>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 ${badge.className}`}>
                              {isMaster && <Lock className="w-3 h-3 text-purple-600 dark:text-purple-400" />}
                              <span>{isMaster ? 'Admin (ពេញលេញ - ការពារ)' : badge.label}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status toggle */}
                      <td className="py-3.5 px-4">
                        {isAdmin && !isMaster ? (
                          <button
                            type="button"
                            onClick={() => onToggleStatus(user.id)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer ${
                              user.status === 'ACTIVE'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span>{user.status === 'ACTIVE' ? 'សកម្ម (Active)' : 'ផ្អាក (Suspended)'}</span>
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" title={isMaster ? "គណនី Master Admin សកម្មជានិច្ច មិនអាចផ្អាកបានទេ" : undefined}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>សកម្ម (Active)</span>
                          </span>
                        )}
                      </td>

                      {/* Created date */}
                      <td className="py-3.5 px-4 text-slate-400 text-[11px] hidden md:table-cell">
                        {new Date(user.createdAt).toLocaleDateString('km-KH')}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        {isAdmin ? (
                          isMaster ? (
                            <span 
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded-lg select-none border border-slate-200 dark:border-slate-700"
                              title="គណនី Master Admin ការពារជាអចិន្ត្រៃយ៍ មិនអាចលុបបានឡើយ"
                            >
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>អចិន្ត្រៃយ៍</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setUserToDelete(user)}
                              title={`លុបគណនី ${user.email}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/80 transition-all cursor-pointer shadow-2xs group ml-auto"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500 group-hover:text-rose-700 transition" />
                              <span>លុប</span>
                            </button>
                          )
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                        )}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Matrix Explanation Card */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">
            តារាងពិពណ៌នាកម្រិតសិទ្ធិនីមួយៗ (Role Permissions Matrix)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          
          {/* Admin card */}
          <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-2">
            <div className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
              <Crown className="w-4 h-4" />
              <span>ADMIN (អ្នកគ្រប់គ្រង)</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              សិទ្ធិខ្ពស់បំផុតក្នុងប្រព័ន្ធ៖
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>កត់ត្រា និងលុបប្រតិបត្តិការទាំងអស់</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>កំណត់ Telegram Bot & Apps Script API</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>បន្ថែម កែប្រែ និងលុបសិទ្ធិអ្នកដទៃ</span>
              </li>
            </ul>
          </div>

          {/* Accountant card */}
          <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-2">
            <div className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4" />
              <span>ACCOUNTANT (គណនេយ្យករ)</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              សិទ្ធិប្រតិបត្តិការគណនេយ្យប្រចាំថ្ងៃ៖
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>កត់ត្រាចំណូល និងចំណាយ</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>បង្ហោះវិក្កយបត្រ និង Sync ទៅ Sheets</span>
              </li>
              <li className="flex items-center gap-1.5">
                <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>មិនអាចប្តូរការកំណត់ API & Users ឡើយ</span>
              </li>
            </ul>
          </div>

          {/* Viewer card */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-2">
            <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Eye className="w-4 h-4" />
              <span>VIEWER (អ្នកមើល)</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              សិទ្ធិត្រួតពិនិត្យរបាយការណ៍ (Read-Only)៖
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>មើលរបាយការណ៍ និងប្រតិបត្តិការ</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>ទាញយកទិន្នន័យជាឯកសារ Excel/CSV</span>
              </li>
              <li className="flex items-center gap-1.5">
                <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>មិនអាចកត់ត្រា ឬលុបទិន្នន័យបានទេ</span>
              </li>
            </ul>
          </div>

        </div>
      </div>
      </>
      )}

      {/* ========================================================================= */}
      {/* 📜 TAB 2: USER ACTIVITY LOGS (AUDIT TRAIL) */}
      {/* ========================================================================= */}
      {activeTab === 'LOGS' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Logs Stats Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">កំណត់ត្រាសរុប</span>
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{logStats.total}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                សកម្មភាពទាំងអស់ក្នុងប្រព័ន្ធ
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">សកម្មភាពថ្ងៃនេះ</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{logStats.todayCount}</div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                ● កត់ត្រាក្នុងថ្ងៃនេះ
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">កត់ត្រាកញ្ចប់ (Commits)</span>
                <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{logStats.commitCount}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                កញ្ចប់ទទួលប្រាក់
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">អ្នកប្រតិបត្តិការ (Users)</span>
                <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{logStats.uniqueOperators}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                គណនីមានសកម្មភាព
              </div>
            </div>
          </div>

          {/* Search, Filter Bar, and Export */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="input-search-logs"
                type="text"
                placeholder="ស្វែងរកតាម ឈ្មោះអ្នកកត់ត្រា, Email, Batch Number, ឬពិពណ៌នា..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Action Group Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {[
                { key: 'ALL', label: 'ទាំងអស់' },
                { key: 'COMMITS', label: 'កត់ត្រាកញ្ចប់' },
                { key: 'LOGINS', label: 'ចូល/ចេញ' },
                { key: 'TELEGRAM', label: 'Telegram' },
                { key: 'PERMISSIONS', label: 'សិទ្ធិ & User' },
                { key: 'DELETIONS', label: 'លុបទិន្នន័យ' }
              ].map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setLogFilterGroup(filter.key as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    logFilterGroup === filter.key
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {filter.label}
                </button>
              ))}

              {/* Sync to Google Sheets Button */}
              <button
                type="button"
                id="btn-sync-user-logs-google"
                onClick={handleSyncLogsToGoogle}
                disabled={isSyncingLogs || activityLogs.length === 0}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs shrink-0"
                title="រក្សាទុក និង Sync កំណត់ត្រាទាំងអស់ទៅ Google Sheets (Tab: User_Logs)"
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 ${isSyncingLogs ? 'animate-spin' : ''}`} />
                <span>{isSyncingLogs ? 'កំពុង Sync...' : 'Sync ទៅ Google Sheets'}</span>
              </button>

              {/* CSV Export Button */}
              <button
                type="button"
                onClick={() => exportActivityLogsToCSV(filteredLogs)}
                disabled={filteredLogs.length === 0}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs shrink-0"
                title="ទាញយកជាឯកសារ Excel/CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Sync Feedback Toast / Banner */}
          {syncLogsToast && (
            <div className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-xs animate-in fade-in duration-200 border ${
              syncLogsToast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}>
              <div className="flex items-center gap-2">
                {syncLogsToast.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{syncLogsToast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setSyncLogsToast(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs px-2 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Activity Logs Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-850/80 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">កាលបរិច្ឆេទ & ម៉ោង (TIMESTAMP)</th>
                    <th className="py-3 px-4">អ្នកប្រតិបត្តិការ (OPERATOR)</th>
                    <th className="py-3 px-4">សកម្មភាព (ACTION)</th>
                    <th className="py-3 px-4">ព័ត៌មានលម្អិត (DETAILS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        <History className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                        <div className="font-semibold text-sm">មិនមានកំណត់ត្រាសកម្មភាពឡើយ</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          នៅពេលអ្នកប្រើប្រាស់ Login, កត់ត្រាកញ្ចប់, ឬកែប្រែសិទ្ធិ នឹងមានកត់ត្រានៅទីនេះដោយស្វ័យប្រវត្តិ
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const badge = getActionBadge(log.action);
                      const BadgeIcon = badge.icon;
                      const initial = (log.operator || 'U').slice(0, 2).toUpperCase();

                      return (
                        <tr 
                          key={log.id} 
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Timestamp */}
                          <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{formatLogTime(log.timestamp)}</span>
                            </div>
                          </td>

                          {/* Operator */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-[10px] shrink-0">
                                {initial}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 dark:text-white leading-tight truncate">
                                  {log.operator}
                                </div>
                                {log.operatorEmail && (
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">
                                    {log.operatorEmail}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Action Badge */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badge.className}`}>
                              <BadgeIcon className="w-3 h-3" />
                              <span>{badge.label}</span>
                            </span>
                          </td>

                          {/* Details */}
                          <td className="py-3 px-4 text-slate-800 dark:text-slate-200">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium leading-relaxed">{log.description}</span>
                              {log.batchNumber && (
                                <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-bold border border-blue-200 dark:border-blue-900">
                                  {log.batchNumber}
                                </span>
                              )}
                              {log.targetUserEmail && (
                                <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-mono text-[10px] font-semibold border border-purple-200 dark:border-purple-900">
                                  {log.targetUserEmail}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Logs Footer Info */}
            <div className="py-2.5 px-4 bg-slate-50 dark:bg-slate-850/60 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-1.5">
              <div>បង្ហាញសរុប {filteredLogs.length} ក្នុងចំណោម {activityLogs.length} កំណត់ត្រា</div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Google Sheets Table: <strong className="text-slate-600 dark:text-slate-300 font-mono">User_Logs</strong> & Cloud Audit Trail</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  បន្ថែមអ្នកប្រើប្រាស់ និងកំណត់សិទ្ធិថ្មី
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateUser} className="p-5 space-y-4 text-xs">
              
              {formError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email អ្នកប្រើប្រាស់ (Google Account) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@gmail.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ឈ្មោះសម្គាល់ (Name / Label)
                </label>
                <input
                  type="text"
                  placeholder="ឧ. លោក សុខា (Accountant)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  កំណត់កម្រិតសិទ្ធិ (Role) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['ADMIN', 'ACCOUNTANT', 'VIEWER'] as const).map((r) => {
                    const badge = getRoleBadge(r);
                    const isSelected = newRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setNewRole(r)}
                        className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <badge.icon className="w-4 h-4" />
                        <span className="text-[11px]">{r}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ស្ថានភាពគណនី (Status)
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewStatus('ACTIVE')}
                    className={`flex-1 py-2 rounded-xl border font-bold text-xs transition cursor-pointer ${
                      newStatus === 'ACTIVE'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    ● សកម្ម (Active)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewStatus('SUSPENDED')}
                    className={`flex-1 py-2 rounded-xl border font-bold text-xs transition cursor-pointer ${
                      newStatus === 'SUSPENDED'
                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    ✕ ផ្អាក (Suspended)
                  </button>
                </div>
              </div>

              {/* Buttons */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm cursor-pointer"
                >
                  រក្សាទុកសិទ្ធិ
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 max-w-sm w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-5 animate-in zoom-in-95 duration-150 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1.5">
              តើអ្នកពិតជាចង់លុបគណនីនេះ?
            </h3>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-left mb-3 space-y-1">
              <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                {userToDelete.name || userToDelete.email.split('@')[0]}
              </div>
              <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px] truncate">
                {userToDelete.email}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              សកម្មភាពនេះនឹងដកសិទ្ធិគណនីនេះចេញពីប្រព័ន្ធ Firebase និង Google Sheets។
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = userToDelete;
                  setUserToDelete(null);
                  onDeleteUser(target.id, target.email);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer shadow-sm"
              >
                យល់ព្រមលុប
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
