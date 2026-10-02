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
  Database,
  Globe,
  Truck,
  Headphones,
  Building2,
  Edit2
} from 'lucide-react';
import { UserPermission, UserRole, AuthUser, UserActivityLog, ActivityActionType, normalizeUserRole } from '../types';
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
  onToggleViewOnlyOwn?: (id: string) => void;
  onDeleteUser: (id: string, email?: string) => void;
  onEditUser?: (updatedUser: UserPermission) => void;
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
  onToggleViewOnlyOwn,
  onDeleteUser,
  onEditUser,
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

  // Form states for Edit User (ONLY for Admin)
  const [userToEdit, setUserToEdit] = useState<UserPermission | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('ACCOUNTANT');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [editViewOnlyOwn, setEditViewOnlyOwn] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleOpenEditModal = (user: UserPermission) => {
    setUserToEdit(user);
    setEditName(user.name || '');
    setEditEmail(user.email);
    setEditRole(normalizeUserRole(user.role));
    setEditStatus(user.status || 'ACTIVE');
    setEditViewOnlyOwn(Boolean(user.viewOnlyOwn));
    setEditError(null);
  };

  const handleSaveEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToEdit) return;

    if (!editEmail.trim() || !editEmail.includes('@')) {
      setEditError('សូមបញ្ចូល Email ឱ្យបានត្រឹមត្រូវ!');
      return;
    }

    const isMaster = isMasterAdmin(userToEdit.email);

    const updatedUser: UserPermission = {
      ...userToEdit,
      name: editName.trim() || userToEdit.email.split('@')[0],
      email: isMaster ? userToEdit.email : editEmail.trim().toLowerCase(),
      role: isMaster ? 'ADMIN' : editRole,
      status: isMaster ? 'ACTIVE' : editStatus,
      viewOnlyOwn: isMaster ? false : editViewOnlyOwn
    };

    if (onEditUser) {
      onEditUser(updatedUser);
    } else {
      if (updatedUser.role !== userToEdit.role) {
        onUpdateRole(userToEdit.id, updatedUser.role);
      }
      if (updatedUser.status !== userToEdit.status) {
        onToggleStatus(userToEdit.id);
      }
    }

    setUserToEdit(null);
  };

  // Form states for Add User
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('ACCOUNTANT');
  const [newStatus, setNewStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [newViewOnlyOwn, setNewViewOnlyOwn] = useState(false);
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
      const userRoleNorm = normalizeUserRole(user.role);
      const matchRole = roleFilter === 'ALL' || userRoleNorm === roleFilter || user.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, searchTerm, roleFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => normalizeUserRole(u.role) === 'ADMIN').length;
    const managers = users.filter(u => normalizeUserRole(u.role) === 'ACCOUNTANT_MANAGER').length;
    const accountants = users.filter(u => normalizeUserRole(u.role) === 'ACCOUNTANT').length;
    const csTeams = users.filter(u => normalizeUserRole(u.role) === 'CS_TEAMS').length;
    const csTeamsOpt = users.filter(u => normalizeUserRole(u.role) === 'CS_TEAMS_OPT').length;
    const deliveries = users.filter(u => normalizeUserRole(u.role) === 'DELIVERY').length;
    const deliveryOpts = users.filter(u => normalizeUserRole(u.role) === 'DELIVERY_OPT').length;
    const hubs = users.filter(u => normalizeUserRole(u.role) === 'HUB').length;
    const hubOpts = users.filter(u => normalizeUserRole(u.role) === 'HUB_OPT').length;
    const viewers = users.filter(u => normalizeUserRole(u.role) === 'VIEWER').length;
    const active = users.filter(u => u.status === 'ACTIVE').length;
    return {
      total,
      admins,
      managers,
      accountants,
      csTeams,
      csTeamsOpt,
      deliveries,
      deliveryOpts,
      hubs,
      hubOpts,
      viewers,
      active
    };
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
      status: newStatus,
      viewOnlyOwn: newViewOnlyOwn
    });

    if (success) {
      setNewEmail('');
      setNewName('');
      setNewRole('ACCOUNTANT');
      setNewStatus('ACTIVE');
      setNewViewOnlyOwn(false);
      setIsAddModalOpen(false);
    }
  };

  const getRoleBadge = (role: UserRole | string) => {
    const norm = normalizeUserRole(role);
    switch (norm) {
      case 'ADMIN':
        return {
          icon: Crown,
          label: 'Admin (អ្នកគ្រប់គ្រង)',
          shortLabel: 'Admin',
          className: 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
        };
      case 'ACCOUNTANT_MANAGER':
        return {
          icon: ShieldCheck,
          label: 'Accountant (manager)',
          shortLabel: 'Acc (mgr)',
          className: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
        };
      case 'ACCOUNTANT':
        return {
          icon: Briefcase,
          label: 'Accountant (គណនេយ្យករ)',
          shortLabel: 'Accountant',
          className: 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
        };
      case 'CS_TEAMS':
        return {
          icon: Headphones,
          label: 'Cs Teams (ផ្នែកបម្រើអតិថិជន)',
          shortLabel: 'Cs Teams',
          className: 'bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800'
        };
      case 'CS_TEAMS_OPT':
        return {
          icon: Headphones,
          label: 'Cs Teams(Opt) (ប្រតិបត្តិការ CS)',
          shortLabel: 'Cs Teams(Opt)',
          className: 'bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800'
        };
      case 'DELIVERY':
        return {
          icon: Truck,
          label: 'Delivery (អ្នកដឹកជញ្ជូន)',
          shortLabel: 'Delivery',
          className: 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
        };
      case 'DELIVERY_OPT':
        return {
          icon: Truck,
          label: 'Delivery(Opt) (ប្រតិបត្តិការដឹកជញ្ជូន)',
          shortLabel: 'Delivery(Opt)',
          className: 'bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800'
        };
      case 'HUB':
        return {
          icon: Building2,
          label: 'Hub (សាខា/ឃ្លាំង)',
          shortLabel: 'Hub',
          className: 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
        };
      case 'HUB_OPT':
        return {
          icon: Building2,
          label: 'Hub(Opt) (ប្រតិបត្តិការ Hub)',
          shortLabel: 'Hub(Opt)',
          className: 'bg-violet-100 dark:bg-violet-950/80 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800'
        };
      case 'VIEWER':
      default:
        return {
          icon: Eye,
          label: 'Viewer (អ្នកមើល)',
          shortLabel: 'Viewer',
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
    <div className="w-full space-y-3.5 animate-in fade-in duration-200 pb-24 lg:pb-8">

      {/* Page Header */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 bg-white dark:bg-slate-900 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold shrink-0">
            <ShieldCheck className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
              គ្រប់គ្រងអ្នកប្រើប្រាស់ និងកំណត់សិទ្ធិ
            </h2>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
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
                className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
                title="Sync សិទ្ធិអ្នកប្រើប្រាស់ពី Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 ${isSyncing ? 'animate-spin' : ''}`} />
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
                className="h-8 px-2.5 rounded-lg border border-amber-300/80 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
                title="សរសេរ និង Sync សិទ្ធិអ្នកប្រើប្រាស់ទៅកាន់ Firebase Firestore"
              >
                <Database className={`w-3.5 h-3.5 text-amber-600 dark:text-amber-400 ${isSyncingFirebase ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync Firebase</span>
              </button>
            )}
            <button
              id="btn-add-user"
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0 active:scale-[0.98]"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ បន្ថែមអ្នកប្រើ</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Tabs: Users & Permissions vs User Activity Logs */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-fit border border-slate-200/80 dark:border-slate-700/60">
        <button
          id="tab-btn-users"
          type="button"
          onClick={() => setActiveTab('USERS')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'USERS'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>បញ្ជីអ្នកប្រើប្រាស់ និងសិទ្ធិ ({users.length})</span>
        </button>

        <button
          id="tab-btn-logs"
          type="button"
          onClick={() => setActiveTab('LOGS')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'LOGS'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>កំណត់ត្រាសកម្មភាពអ្នកប្រើ (User Logs)</span>
          {activityLogs.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === 'LOGS'
                ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
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
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span><b>សិទ្ធិមើលប៉ុណ្ណោះ (View Only)៖</b> មានតែគណនីកម្រិត <b>Admin</b> ទើបអាចបន្ថែម កែប្រែ ឬលុបសិទ្ធិអ្នកប្រើប្រាស់បាន។</span>
            </div>
          )}

          {/* Stats Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
            {/* Total Users */}
            <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">អ្នកប្រើសរុប</div>
                <div className="text-xl font-black text-slate-900 dark:text-white leading-none mt-1">{stats.total}</div>
                <div className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">● {stats.active} គណនីសកម្ម</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
            </div>

            {/* Admins */}
            <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-purple-600 dark:text-purple-400">Admins</div>
                <div className="text-xl font-black text-purple-700 dark:text-purple-300 leading-none mt-1">{stats.admins}</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">សិទ្ធិពេញលេញ</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-900/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4" />
              </div>
            </div>

            {/* Accountants */}
            <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400">Accountants</div>
                <div className="text-xl font-black text-blue-700 dark:text-blue-300 leading-none mt-1">{stats.accountants}</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">កត់ត្រា & Sync</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>

            {/* Viewers */}
            <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Viewers</div>
                <div className="text-xl font-black text-slate-700 dark:text-slate-300 leading-none mt-1">{stats.viewers}</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">មើលរបាយការណ៍</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Eye className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ស្វែងរកតាម Email ឬ ឈ្មោះ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 h-8 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                  title="សម្អាត"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Role Filter Pills */}
            <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {(['ALL', 'ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS', 'CS_TEAMS_OPT', 'DELIVERY', 'DELIVERY_OPT', 'HUB', 'HUB_OPT', 'VIEWER'] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(role)}
                  className={`h-7.5 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer shrink-0 ${
                    roleFilter === role
                      ? 'bg-blue-600 text-white font-bold shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {role === 'ALL'
                    ? 'ទាំងអស់'
                    : role === 'ACCOUNTANT_MANAGER'
                      ? 'Acc (mgr)'
                      : role === 'ACCOUNTANT'
                        ? 'Accountant'
                        : role === 'CS_TEAMS'
                          ? 'Cs Teams'
                          : role === 'CS_TEAMS_OPT'
                            ? 'Cs Teams(Opt)'
                            : role === 'DELIVERY'
                              ? 'Delivery'
                              : role === 'DELIVERY_OPT'
                                ? 'Delivery(Opt)'
                                : role === 'HUB'
                                  ? 'Hub'
                                  : role === 'HUB_OPT'
                                    ? 'Hub(Opt)'
                                    : role === 'VIEWER'
                                      ? 'Viewer'
                                      : role}
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
                <th className="py-3 px-4">កម្រិតទិន្នន័យ (Data Scope)</th>
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
                              value={normalizeUserRole(user.role)}
                              onChange={(e) => onUpdateRole(user.id, e.target.value as UserRole)}
                              className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition cursor-pointer ${badge.className}`}
                            >
                              <option value="ADMIN">🛡️ Admin (ពេញលេញ)</option>
                              <option value="ACCOUNTANT_MANAGER">💼 Accountant (manager)</option>
                              <option value="ACCOUNTANT">📊 Accountant (គណនេយ្យករ)</option>
                              <option value="CS_TEAMS">🎧 Cs Teams</option>
                              <option value="CS_TEAMS_OPT">🎧 Cs Teams(Opt)</option>
                              <option value="DELIVERY">🚚 Delivery (អ្នកដឹកជញ្ជូន)</option>
                              <option value="DELIVERY_OPT">🚚 Delivery(Opt)</option>
                              <option value="HUB">🏢 Hub</option>
                              <option value="HUB_OPT">🏢 Hub(Opt)</option>
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

                      {/* Data Scope (View All vs View Own Only) */}
                      <td className="py-3.5 px-4">
                        {isMaster ? (
                          <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1.5">
                            <Globe className="w-3 h-3 text-blue-500" />
                            <span>មើលទាំងអស់</span>
                          </span>
                        ) : isAdmin && onToggleViewOnlyOwn ? (
                          <button
                            type="button"
                            onClick={() => onToggleViewOnlyOwn(user.id)}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border inline-flex items-center gap-1.5 transition cursor-pointer ${
                              user.viewOnlyOwn
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
                            }`}
                            title="ចុចដើម្បីប្តូរសិទ្ធិមើលទិន្នន័យ (មើលទាំងអស់ ឬ មើលតែរបស់ខ្លួនឯង)"
                          >
                            {user.viewOnlyOwn ? (
                              <>
                                <Lock className="w-3 h-3 text-amber-600" />
                                <span>តែរបស់ខ្លួន (Own Only)</span>
                              </>
                            ) : (
                              <>
                                <Globe className="w-3 h-3 text-blue-600" />
                                <span>មើលទាំងអស់ (All Data)</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border inline-flex items-center gap-1.5 ${
                            user.viewOnlyOwn
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                          }`}>
                            {user.viewOnlyOwn ? (
                              <>
                                <Lock className="w-3 h-3 text-amber-600" />
                                <span>តែរបស់ខ្លួន</span>
                              </>
                            ) : (
                              <>
                                <Globe className="w-3 h-3 text-blue-600" />
                                <span>មើលទាំងអស់</span>
                              </>
                            )}
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
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Button - ONLY for Admin */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(user)}
                              title={`កែប្រែព័ត៌មាន ${user.name || user.email}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-900/80 transition-all cursor-pointer shadow-2xs group"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-blue-500 group-hover:text-blue-700 transition" />
                              <span>កែប្រែ</span>
                            </button>

                            {isMaster ? (
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
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/80 transition-all cursor-pointer shadow-2xs group"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500 group-hover:text-rose-700 transition" />
                                <span>លុប</span>
                              </button>
                            )}
                          </div>
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

      </>
      )}

      {/* ========================================================================= */}
      {/* 📜 TAB 2: USER ACTIVITY LOGS (AUDIT TRAIL) */}
      {/* ========================================================================= */}
      {activeTab === 'LOGS' && (
        <div className="space-y-3.5 animate-in fade-in duration-150">
          {/* Logs Stats Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
            <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">កំណត់ត្រាសរុប</div>
                <div className="text-xl font-black text-slate-900 dark:text-white leading-none mt-1">{logStats.total}</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">សកម្មភាពទាំងអស់</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4" />
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">សកម្មភាពថ្ងៃនេះ</div>
                <div className="text-xl font-black text-slate-900 dark:text-white leading-none mt-1">{logStats.todayCount}</div>
                <div className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">● កត់ត្រាក្នុងថ្ងៃនេះ</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">កត់ត្រាកញ្ចប់ (Commits)</div>
                <div className="text-xl font-black text-slate-900 dark:text-white leading-none mt-1">{logStats.commitCount}</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">កញ្ចប់ទទួលប្រាក់</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-purple-600 dark:text-purple-400">អ្នកប្រតិបត្តិការ</div>
                <div className="text-xl font-black text-slate-900 dark:text-white leading-none mt-1">{logStats.uniqueOperators}</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">គណនីមានសកម្មភាព</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-900/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Search, Filter Bar, and Export */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="input-search-logs"
                type="text"
                placeholder="ស្វែងរកតាម ឈ្មោះ, Email, Batch..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full pl-8 pr-4 h-8 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
              {logSearch && (
                <button
                  type="button"
                  onClick={() => setLogSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                  title="សម្អាត"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Action Group Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 md:pb-0 shrink-0">
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
                  className={`h-7.5 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer shrink-0 ${
                    logFilterGroup === filter.key
                      ? 'bg-blue-600 text-white font-bold shadow-2xs'
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
                className="h-7.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs shrink-0"
                title="រក្សាទុក និង Sync កំណត់ត្រាទាំងអស់ទៅ Google Sheets (Tab: User_Logs)"
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 ${isSyncingLogs ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSyncingLogs ? 'កំពុង Sync...' : 'Sync Sheets'}</span>
              </button>

              {/* CSV Export Button */}
              <button
                type="button"
                onClick={() => exportActivityLogsToCSV(filteredLogs)}
                disabled={filteredLogs.length === 0}
                className="h-7.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs shrink-0"
                title="ទាញយកជាឯកសារ Excel/CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
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
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS', 'CS_TEAMS_OPT', 'DELIVERY', 'DELIVERY_OPT', 'HUB', 'HUB_OPT', 'VIEWER'] as const).map((r) => {
                    const badge = getRoleBadge(r);
                    const isSelected = newRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setNewRole(r)}
                        className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <badge.icon className="w-4 h-4" />
                        <span className="text-[11px] truncate">{badge.shortLabel}</span>
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

              {/* Data Viewing Scope (View Own Records Only) */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newViewOnlyOwn}
                    onChange={(e) => setNewViewOnlyOwn(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block">
                      🔒 កម្រិតសិទ្ធិមើលទិន្នន័យ៖ មើលបានតែទិន្នន័យផ្ទាល់ខ្លួន (View Own Records Only)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      បើបើកជម្រើសនេះ អ្នកប្រើប្រាស់រូបនេះនឹងមើលឃើញតែ Bank Slips និងប្រតិបត្តិការដែលខ្លួនឯងបានបញ្ចូលប៉ុណ្ណោះ។
                    </span>
                  </div>
                </label>
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

      {/* Edit User Modal - ONLY for Admin */}
      {isAdmin && userToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  កែប្រែព័ត៌មានអ្នកប្រើប្រាស់ និងសិទ្ធិ
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUserToEdit(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEditUser} className="p-5 space-y-4 text-xs">
              {editError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ឈ្មោះសម្គាល់ (Name / Label)
                </label>
                <input
                  type="text"
                  placeholder="ឧ. Ms. Kimsros"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email (Google Account)
                </label>
                <input
                  type="email"
                  disabled={isMasterAdmin(userToEdit.email)}
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                    isMasterAdmin(userToEdit.email)
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white'
                  }`}
                />
                {isMasterAdmin(userToEdit.email) && (
                  <p className="text-[10.5px] text-purple-600 dark:text-purple-400 mt-1">
                    * គណនី Master Admin ត្រូវបានការពារ Email
                  </p>
                )}
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  កម្រិតសិទ្ធិ (Role) {isMasterAdmin(userToEdit.email) ? '(អចិន្ត្រៃយ៍)' : ''}
                </label>
                {isMasterAdmin(userToEdit.email) ? (
                  <div className="p-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold flex items-center gap-2">
                    <Crown className="w-4 h-4" />
                    <span>Master Admin (ពេញលេញ - ការពារ)</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS', 'CS_TEAMS_OPT', 'DELIVERY', 'DELIVERY_OPT', 'HUB', 'HUB_OPT', 'VIEWER'] as const).map((r) => {
                      const badge = getRoleBadge(r);
                      const isSelected = editRole === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setEditRole(r)}
                          className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <badge.icon className="w-4 h-4" />
                          <span className="text-[11px] truncate">{badge.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status & Data Scope */}
              {!isMasterAdmin(userToEdit.email) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      ស្ថានភាព (Status)
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditStatus('ACTIVE')}
                        className={`flex-1 py-1.5 rounded-xl border font-bold text-[11px] transition cursor-pointer ${
                          editStatus === 'ACTIVE'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        ● សកម្ម
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditStatus('SUSPENDED')}
                        className={`flex-1 py-1.5 rounded-xl border font-bold text-[11px] transition cursor-pointer ${
                          editStatus === 'SUSPENDED'
                            ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        ● ផ្អាក
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      កម្រិតទិន្នន័យ (Data Scope)
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditViewOnlyOwn(false)}
                        className={`flex-1 py-1.5 rounded-xl border font-bold text-[11px] transition cursor-pointer ${
                          !editViewOnlyOwn
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        មើលទាំងអស់
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditViewOnlyOwn(true)}
                        className={`flex-1 py-1.5 rounded-xl border font-bold text-[11px] transition cursor-pointer ${
                          editViewOnlyOwn
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        តែរបស់ខ្លួន
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setUserToEdit(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition cursor-pointer"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>រក្សាទុកការកែប្រែ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
