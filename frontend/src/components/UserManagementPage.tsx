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
  Contact,
  AlertTriangle,
  FileSpreadsheet,
  Database,
  Globe,
  Truck,
  Headphones,
  Building2,
  Edit2,
  Plus,
  LayoutDashboard,
  Receipt,
  Fuel,
  ClipboardCheck,
  BarChart3,
  Layers,
  Boxes,
  Maximize2,
  Minimize2,
  ArrowDownToLine,
  ArrowUpFromLine,
  PackageCheck,
  Archive,
  PackageOpen,
  TrendingUp,
  Car,
  Undo2
} from 'lucide-react';
import { UserPermission, UserRole, AuthUser, UserActivityLog, ActivityActionType, normalizeUserRole, NavView, Payer } from '../types';
import { GridHeadGutter, GridRowGutter, GridObjectSelectionBar, useGridSelection } from './ui/DataGrid';
import { subscribeToActivityLogs, exportActivityLogsToCSV, syncActivityLogsToGoogleSheets } from '../services/activityLogService';
import { 
  ALL_CONFIGURABLE_NAV_PAGES, 
  getDefaultAllowedPages, 
  canUserAccessPage,
  CONFIGURABLE_NAV_PAGES_META,
  getAllObservedNavPages
} from '../services/userPermissionService';
import { CAMBODIA_PROVINCES } from './WarehouseManagementPage';

const NAV_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Receipt,
  FileSpreadsheet,
  ClipboardCheck,
  Fuel,
  ArrowDownToLine,
  ArrowUpFromLine,
  PackageCheck,
  Archive,
  PackageOpen,
  Truck,
  Database,
  BarChart3,
  Boxes,
  Users,
  Layers,
  Send,
  Contact,
  Undo2
};

export const MASTER_ADMIN_EMAIL = 'rathykim34@gmail.com';
export const isMasterAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  return email.toLowerCase().trim() === MASTER_ADMIN_EMAIL;
};

export const getUserAvatarGradient = (email?: string, role?: string): string => {
  if (isMasterAdmin(email)) {
    return 'from-purple-600 via-indigo-600 to-pink-500 text-white shadow-purple-500/25 ring-2 ring-purple-300 dark:ring-purple-700/60';
  }
  const normalized = role ? normalizeUserRole(role as UserRole) : '';
  switch (normalized) {
    case 'ADMIN':
      return 'from-blue-600 to-indigo-700 text-white shadow-blue-500/20';
    case 'ACCOUNTANT_MANAGER':
      return 'from-emerald-600 to-teal-700 text-white shadow-emerald-500/20';
    case 'ACCOUNTANT':
      return 'from-teal-500 to-emerald-600 text-white shadow-teal-500/20';
    case 'CS_TEAMS':
    case 'CS_TEAMS_OPT':
      return 'from-sky-500 to-blue-600 text-white shadow-sky-500/20';
    case 'DELIVERY':
    case 'DELIVERY_OPT':
      return 'from-amber-500 to-orange-600 text-white shadow-amber-500/20';
    case 'HUB':
    case 'HUB_OPT':
      return 'from-violet-500 to-purple-600 text-white shadow-violet-500/20';
    case 'TAXI':
    case 'TAXI_OPT':
      return 'from-yellow-500 to-amber-600 text-white shadow-yellow-500/20';
    case 'SALE_REP':
    case 'SALE_GM':
      return 'from-rose-500 to-pink-600 text-white shadow-rose-500/20';
    case 'VIEWER':
      return 'from-slate-500 to-slate-700 text-white shadow-slate-500/20';
    default:
      return 'from-indigo-500 to-blue-600 text-white shadow-indigo-500/20';
  }
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
  onRefreshMasterData?: (silent?: boolean) => Promise<void>;
  payers?: Payer[];
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
  onRefreshMasterData,
  payers = []
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  // Staff name options from Company Staff page (ឈ្មោះអ្នកប្រគល់)
  const staffNameOptions = useMemo(() => {
    let list: Payer[] = payers;
    if (!list || list.length === 0) {
      try {
        const stored = localStorage.getItem('accounting_payers') || localStorage.getItem('payers');
        const parsed = stored ? JSON.parse(stored) : [];
        if (Array.isArray(parsed)) list = parsed;
      } catch {}
    }
    const names = list
      .filter((p) => p && p.status !== 'INACTIVE' && p.name && p.name.trim())
      .map((p) => p.name.trim());
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [payers]);
  const [activeTab, setActiveTab] = useState<'USERS' | 'LOGS'>('USERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingMaster, setIsRefreshingMaster] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserPermission | null>(null);

  // Form states for Edit User (ONLY for Admin)
  const [userToEdit, setUserToEdit] = useState<UserPermission | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('ACCOUNTANT');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [editViewOnlyOwn, setEditViewOnlyOwn] = useState(false);
  const [editCanCreate, setEditCanCreate] = useState(true);
  const [editCanEdit, setEditCanEdit] = useState(true);
  const [editCanDelete, setEditCanDelete] = useState(false);
  const [editAllowedPages, setEditAllowedPages] = useState<NavView[]>([]);
  const [editAllowedLocations, setEditAllowedLocations] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditModalFullscreen, setIsEditModalFullscreen] = useState<boolean>(false);
  const [isAddModalFullscreen, setIsAddModalFullscreen] = useState<boolean>(false);

  // Dynamic discovery of configurable navigation pages - automatically updates when any new page is added!
  const observedNavPages = useMemo(() => {
    return getAllObservedNavPages(users);
  }, [users]);

  const configurablePageDefinitions = useMemo(() => {
    return observedNavPages.map((pageId) => {
      const known = CONFIGURABLE_NAV_PAGES_META.find(p => p.id === pageId);
      if (known) {
        const IconComponent = NAV_ICON_MAP[known.iconName] || Layers;
        return {
          ...known,
          icon: IconComponent
        };
      }
      return {
        id: pageId as NavView,
        titleKm: pageId.replace(/_/g, ' '),
        desc: `ទំព័រ ${pageId}`,
        iconName: 'Layers',
        category: 'OTHER' as const,
        activeBg: 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/60',
        iconActive: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300',
        switchActive: 'bg-indigo-600',
        icon: Layers
      };
    });
  }, [observedNavPages]);

  const handleOpenEditModal = (user: UserPermission) => {
    setUserToEdit(user);
    setEditName(user.name || '');
    setEditEmail(user.email);
    setEditPassword(user.password || '');
    const uRole = normalizeUserRole(user.role);
    setEditRole(uRole);
    setEditStatus(user.status || 'ACTIVE');
    setEditViewOnlyOwn(Boolean(user.viewOnlyOwn));

    const isMaster = isMasterAdmin(user.email);
    const defaultCanCreate = uRole !== 'VIEWER';
    const defaultCanEdit = ['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'].includes(uRole);
    const defaultCanDelete = ['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'].includes(uRole);

    setEditCanCreate(isMaster ? true : (user.canCreate !== undefined ? Boolean(user.canCreate) : defaultCanCreate));
    setEditCanEdit(isMaster ? true : (user.canEdit !== undefined ? Boolean(user.canEdit) : defaultCanEdit));
    setEditCanDelete(isMaster ? true : (user.canDelete !== undefined ? Boolean(user.canDelete) : defaultCanDelete));

    const defaultPages = Array.isArray(user.allowedPages)
      ? user.allowedPages
      : getDefaultAllowedPages(user.role);
    setEditAllowedPages(isMaster ? [...observedNavPages] : defaultPages);
    setEditAllowedLocations(Array.isArray(user.allowedLocations) ? user.allowedLocations : []);

    setEditError(null);
  };

  const handleTogglePageAccess = (pageId: NavView) => {
    if (isMasterAdmin(userToEdit?.email)) return;
    setEditAllowedPages(prev => {
      if (prev.includes(pageId)) {
        return prev.filter(p => p !== pageId);
      } else {
        return [...prev, pageId];
      }
    });
  };

  const handleToggleLocation = (location: string) => {
    setEditAllowedLocations(prev => (prev.includes(location) ? prev.filter(l => l !== location) : [...prev, location]));
  };

  const handleSelectAllPages = () => {
    if (isMasterAdmin(userToEdit?.email)) return;
    setEditAllowedPages([...observedNavPages]);
  };

  const handleDeselectAllPages = () => {
    if (isMasterAdmin(userToEdit?.email)) return;
    setEditAllowedPages([]);
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
      password: editPassword.trim() ? editPassword.trim() : (userToEdit.password || '123456'),
      role: isMaster ? 'ADMIN' : editRole,
      status: isMaster ? 'ACTIVE' : editStatus,
      viewOnlyOwn: isMaster ? false : editViewOnlyOwn,
      canCreate: isMaster ? true : editCanCreate,
      canEdit: isMaster ? true : editCanEdit,
      canDelete: isMaster ? true : editCanDelete,
      allowedPages: isMaster ? [...observedNavPages] : editAllowedPages,
      allowedLocations: editAllowedLocations
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
  const [newPassword, setNewPassword] = useState('');
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
      if (logFilterGroup === 'DELETIONS') return /^(DELETE|CLEAR)/.test(String(log.action || ''));
      return true;
    });
  }, [activityLogs, logSearch, logFilterGroup]);

  const logSelection = useGridSelection(filteredLogs, (l: UserActivityLog) => l.id);

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

  const userSelection = useGridSelection(filteredUsers, (u: UserPermission) => u.id);

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
    const taxis = users.filter(u => normalizeUserRole(u.role) === 'TAXI').length;
    const taxiOpts = users.filter(u => normalizeUserRole(u.role) === 'TAXI_OPT').length;
    const saleReps = users.filter(u => normalizeUserRole(u.role) === 'SALE_REP').length;
    const saleGms = users.filter(u => normalizeUserRole(u.role) === 'SALE_GM').length;
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
      taxis,
      taxiOpts,
      saleReps,
      saleGms,
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
      password: newPassword.trim() || '123456',
      role: newRole,
      status: newStatus,
      viewOnlyOwn: newViewOnlyOwn
    });

    if (success) {
      setNewEmail('');
      setNewName('');
      setNewPassword('');
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
      case 'TAXI':
        return {
          icon: Car,
          label: 'Taxi (តាក់ស៊ី)',
          shortLabel: 'Taxi',
          className: 'bg-yellow-100 dark:bg-yellow-950/80 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800'
        };
      case 'TAXI_OPT':
        return {
          icon: Car,
          label: 'Taxi(Opt) (ប្រតិបត្តិការតាក់ស៊ី)',
          shortLabel: 'Taxi(Opt)',
          className: 'bg-lime-100 dark:bg-lime-950/80 text-lime-800 dark:text-lime-300 border-lime-200 dark:border-lime-800'
        };
      case 'SALE_REP':
        return {
          icon: TrendingUp,
          label: 'Sale REP (តំណាងផ្នែកលក់)',
          shortLabel: 'Sale REP',
          className: 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
        };
      case 'SALE_GM':
        return {
          icon: TrendingUp,
          label: 'Sale GM (ប្រធានផ្នែកលក់)',
          shortLabel: 'Sale GM',
          className: 'bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800'
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

  const SERVER_ACTION_LABELS: Record<string, string> = {
    SAVE_MEDICINE_BATCH: 'រក្សាទុកកញ្ចប់ថ្នាំ',
    DELETE_MEDICINE_BATCH: 'លុបកញ្ចប់ថ្នាំ',
    DELETE_ALL_MEDICINE_BATCHES: 'លុបកញ្ចប់ថ្នាំទាំងអស់',
    SAVE_COD_BATCH: 'រក្សាទុក COD',
    DELETE_COD_BATCH: 'លុប COD',
    DELETE_ALL_COD_BATCHES: 'លុប COD ទាំងអស់',
    SAVE_LIST_NAME: 'រក្សាទុកអ្នកបង់',
    DELETE_PAYER: 'លុបអ្នកបង់',
    SAVE_WAREHOUSE_SCAN: 'ស្កេនឃ្លាំង',
    DELETE_WAREHOUSE_SCAN: 'លុបការស្កេន',
    DELETE_WAREHOUSE_SCAN_BATCH: 'លុបបាច់ស្កេន',
    CLEAR_ALL_WAREHOUSE_SCANS: 'សម្អាតការស្កេន',
    SAVE_BANK_SLIP: 'រក្សាទុកស្លីប',
    DELETE_BANK_SLIP: 'លុបស្លីប',
    SAVE_PERMISSION: 'រក្សាទុកសិទ្ធិ',
    DELETE_PERMISSION: 'លុបសិទ្ធិ',
    SAVE_SETTINGS: 'កែការកំណត់',
    SAVE_APP_CONFIG: 'កែការកំណត់',
    SAVE_DISTRIBUTION_REPORTS: 'របាយការណ៍ចែកចាយ',
    SAVE_DISTRIBUTION_REPORT: 'របាយការណ៍ចែកចាយ',
    DELETE_DISTRIBUTION_REPORTS: 'លុបរបាយការណ៍',
    DELETE_DISTRIBUTION_REPORT: 'លុបរបាយការណ៍',
    SAVE_CUSTOMER: 'រក្សាទុកអតិថិជន',
    IMPORT_CUSTOMERS: 'នាំចូលអតិថិជន',
    DELETE_CUSTOMER: 'លុបអតិថិជន',
    DELETE_CUSTOMERS: 'លុបអតិថិជន',
    UPDATE_BOOKING: 'កែការកក់',
    NOTIFY_PICKUP: 'ជូនដំណឹងមកយក',
    DELETE_BOOKING: 'លុបការកក់',
    SAVE_TEAM_MEMBER: 'សមាជិកក្រុម',
    IMPORT_TEAM: 'នាំចូលក្រុម',
    DELETE_TEAM_MEMBER: 'លុបសមាជិកក្រុម',
    SAVE_CONFIG: 'កែការកំណត់ Booking',
    SET_WEBHOOK: 'កំណត់ Webhook',
    DELETE_WEBHOOK: 'លុប Webhook',
    BACKUP_POSTGRES: 'Backup',
    BACKUP_SCHEDULE: 'កាលវិភាគ Backup',
    POD_SYNC_CONTROL: 'POD Sync'
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
      default: {
        // Actions recorded by the server audit trail (e.g. SAVE_CUSTOMER, DELETE_WAREHOUSE_SCAN)
        const code = String(action || '');
        const label = SERVER_ACTION_LABELS[code] || code.replace(/_/g, ' ') || 'សកម្មភាព';
        if (/^(DELETE|CLEAR)/.test(code)) {
          return {
            icon: Trash2,
            label,
            className: 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
          };
        }
        if (/^(SAVE|IMPORT|UPDATE|SET|NOTIFY)/.test(code)) {
          return {
            icon: Check,
            label,
            className: 'bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800'
          };
        }
        return {
          icon: Activity,
          label,
          className: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
        };
      }
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
    <div className="page-fill w-full space-y-2 animate-in fade-in duration-200 pb-24 lg:pb-0">

      {/* Page Header: title + tabs + actions in one compact bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
            អ្នកប្រើប្រាស់ & សិទ្ធិ
          </h2>
          {/* Hostinger DB live indicator (details on hover) */}
          <span
            className="relative flex h-2 w-2 shrink-0"
            title="Hostinger DB Primary Live — ទិន្នន័យចម្បងផ្ទុកលើ Hostinger MySQL Primary Database (tbl_permissions) និង Auto-Sync ទៅកាន់ Google Sheets"
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>

        {/* Navigation Tabs: Users & Permissions vs User Activity Logs */}
        <div className="order-last sm:order-none w-full sm:w-auto flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 overflow-x-auto scrollbar-none">
          <button
            id="tab-btn-users"
            type="button"
            onClick={() => setActiveTab('USERS')}
            className={`h-7 px-2.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'USERS'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>អ្នកប្រើ</span>
            <span className={`px-1.5 py-px rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'USERS'
                ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`} title={`${stats.admins} Admin • ${stats.accountants} Accountant • ${stats.viewers} Viewer • ${stats.active} សកម្ម`}>
              {users.length}
            </span>
          </button>
          <button
            id="tab-btn-logs"
            type="button"
            onClick={() => setActiveTab('LOGS')}
            className={`h-7 px-2.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'LOGS'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>User Logs</span>
            {activityLogs.length > 0 && (
              <span className={`px-1.5 py-px rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'LOGS'
                  ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                {activityLogs.length}
              </span>
            )}
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {onRefreshMasterData && (
              <button
                id="btn-sync-master-permissions"
                type="button"
                disabled={isRefreshingMaster}
                onClick={async () => {
                  setIsRefreshingMaster(true);
                  try {
                    await onRefreshMasterData(false);
                  } finally {
                    setTimeout(() => setIsRefreshingMaster(false), 600);
                  }
                }}
                className="h-8 px-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
                title="ទាញទិន្នន័យសិទ្ធិអ្នកប្រើប្រាស់ថ្មីពី Hostinger Master Database ភ្លាមៗ (Instant Live Sync)"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMaster ? 'animate-spin text-emerald-600' : ''}`} />
                <span>Live</span>
              </button>
            )}

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
                className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
                title="ចុចដើម្បីទាញយកសិទ្ធិអ្នកប្រើប្រាស់ពី Google Sheets BackUp ភ្លាមៗ (Force Sync)"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sheets</span>
              </button>
            )}

            <button
              id="btn-add-user"
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="h-8 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0 active:scale-[0.98]"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>បន្ថែម</span>
            </button>
          </div>
        )}
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

          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row gap-2 items-center justify-between bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ស្វែងរកតាម Email ឬ ឈ្មោះ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 h-7 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                  title="សម្អាត"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Role Filter Pills */}
            <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {(['ALL', 'ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS', 'CS_TEAMS_OPT', 'DELIVERY', 'DELIVERY_OPT', 'HUB', 'HUB_OPT', 'TAXI', 'TAXI_OPT', 'SALE_REP', 'SALE_GM', 'VIEWER'] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(role)}
                  className={`h-6.5 px-2 rounded-lg text-[11px] font-semibold transition cursor-pointer shrink-0 ${
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
                                    : role === 'TAXI'
                                      ? 'Taxi'
                                      : role === 'TAXI_OPT'
                                        ? 'Taxi(Opt)'
                                    : role === 'SALE_REP'
                                      ? 'Sale REP'
                                      : role === 'SALE_GM'
                                        ? 'Sale GM'
                                    : role === 'VIEWER'
                                      ? 'Viewer'
                                      : role}
                </button>
              ))}
            </div>
          </div>

      {/* Users Permissions Table */}
      <div className="space-y-1.5">
      <GridObjectSelectionBar
        rows={userSelection.selectedRows}
        filename="users_selected"
        omit={['password']}
        onClear={userSelection.clear}
      />
      <div className="sb-grid-wrap">
        <div className="overflow-x-auto">
          <table className="sb-grid w-full text-left">
            <thead>
              <tr>
                <GridHeadGutter
                  checked={userSelection.allChecked}
                  indeterminate={userSelection.someChecked}
                  onToggleAll={userSelection.toggleAll}
                />
                <th className="py-2 px-3 font-bold">អ្នកប្រើប្រាស់ (User)</th>
                <th className="py-2 px-3 font-bold">កម្រិតសិទ្ធិ (Role)</th>
                <th className="py-2 px-3 font-bold text-center">ស្ថានភាព (Status)</th>
                <th className="py-2 px-3 font-bold">កម្រិតទិន្នន័យ (Data Scope)</th>
                <th className="py-2 px-3 font-bold">សិទ្ធិប្រតិបត្តិការ (Action Rights)</th>
                <th className="py-2 px-3 font-bold">ទំព័រអនុញ្ញាត (Allowed Pages)</th>
                <th className="py-2 px-3 font-bold hidden xl:table-cell">កាលបរិច្ឆេទ (Created)</th>
                <th className="py-2 px-3 font-bold text-right min-w-[120px]">សកម្មភាព (Actions)</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30 animate-pulse" />
                    <p className="font-semibold text-xs">មិនមានអ្នកប្រើប្រាស់ដែលត្រូវនឹងលក្ខខណ្ឌស្វែងរកឡើយ</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">សូមសាកល្បងផ្លាស់ប្តូរពាក្យស្វែងរក ឬតម្រងកម្រិតសិទ្ធិ</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, userIdx) => {
                  const badge = getRoleBadge(user.role);
                  const Icon = badge.icon;
                  const isCurrent = currentUser?.email.toLowerCase() === user.email.toLowerCase();
                  const isMaster = isMasterAdmin(user.email);
                  const avatarGradient = getUserAvatarGradient(user.email, user.role);

                  return (
                    <tr
                      key={user.id}
                      className={`group ${
                        userSelection.isSelected(user.id) ? 'sb-selected' : isCurrent ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                      }`}
                    >
                      <GridRowGutter
                        selected={userSelection.isSelected(user.id)}
                        rowNumber={userIdx + 1}
                        onToggle={() => userSelection.toggle(user.id)}
                      />
                      {/* User details */}
                      <td className="py-1 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`relative w-7.5 h-7.5 rounded-xl bg-gradient-to-tr ${avatarGradient} flex items-center justify-center font-bold text-xs shadow-xs shrink-0 select-none`}>
                            {(user.name || user.email).charAt(0).toUpperCase()}
                            {isMaster && (
                              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center shadow-xs ring-1 ring-white dark:ring-slate-900" title="Master Admin">
                                <Crown className="w-2 h-2" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 max-w-[200px] sm:max-w-none">
                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap leading-tight">
                              <span className="truncate text-xs">{user.name || user.email.split('@')[0]}</span>
                              {isMaster && (
                                <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 font-bold inline-flex items-center gap-0.5 border border-purple-200/70 dark:border-purple-800 shadow-2xs shrink-0">
                                  <Crown className="w-2 h-2 text-purple-600 dark:text-purple-400" />
                                  Master
                                </span>
                              )}
                              {isCurrent && (
                                <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200/70 dark:border-emerald-800 shadow-2xs shrink-0">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-slate-400 dark:text-slate-500 text-[10.5px] font-mono truncate">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role selection dropdown / Badge */}
                      <td className="py-1 px-3 whitespace-nowrap">
                        <div className="flex items-center">
                          {isAdmin && !isMaster ? (
                            <select
                              value={normalizeUserRole(user.role)}
                              onChange={(e) => onUpdateRole(user.id, e.target.value as UserRole)}
                              className={`h-7 px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer shadow-2xs hover:shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${badge.className}`}
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
                              <option value="TAXI">🚕 Taxi</option>
                              <option value="TAXI_OPT">🚕 Taxi(Opt)</option>
                              <option value="SALE_REP">📈 Sale REP</option>
                              <option value="SALE_GM">📈 Sale GM</option>
                              <option value="VIEWER">👁️ Viewer (មើលប៉ុណ្ណោះ)</option>
                            </select>
                          ) : (
                            <span className={`h-6.5 px-2 py-0.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 shadow-2xs select-none ${badge.className}`}>
                              {isMaster ? (
                                <>
                                  <Lock className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400" />
                                  <span>Admin (ពេញលេញ - ការពារ)</span>
                                </>
                              ) : (
                                <>
                                  <Icon className="w-3 h-3" />
                                  <span>{badge.label}</span>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status toggle */}
                      <td className="py-1 px-3 whitespace-nowrap text-center">
                        {isAdmin && !isMaster ? (
                          <button
                            type="button"
                            onClick={() => onToggleStatus(user.id)}
                            className={`h-6 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-98 ${
                              user.status === 'ACTIVE'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                            }`}
                            title="ចុចដើម្បីបិទ/បើកដំណើរការគណនី"
                          >
                            {user.status === 'ACTIVE' ? (
                              <>
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                <span>សកម្ម (Active)</span>
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                <span>ផ្អាក (Suspended)</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span 
                            className="h-6 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs select-none" 
                            title={isMaster ? "គណនី Master Admin សកម្មជានិច្ច មិនអាចផ្អាកបានទេ" : undefined}
                          >
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </span>
                            <span>សកម្ម (Active)</span>
                          </span>
                        )}
                      </td>

                      {/* Data Scope (View All vs View Own Only) */}
                      <td className="py-1 px-3 whitespace-nowrap">
                        {isMaster ? (
                          <span className="h-6.5 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 inline-flex items-center gap-1 shadow-2xs select-none">
                            <Globe className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            <span>មើលទាំងអស់ (All Data)</span>
                          </span>
                        ) : isAdmin && onToggleViewOnlyOwn ? (
                          <button
                            type="button"
                            onClick={() => onToggleViewOnlyOwn(user.id)}
                            className={`h-6.5 px-2 py-0.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-98 ${
                              user.viewOnlyOwn
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                            }`}
                            title="ចុចដើម្បីប្តូរសិទ្ធិមើលទិន្នន័យ (មើលទាំងអស់ ឬ មើលតែរបស់ខ្លួនឯង)"
                          >
                            {user.viewOnlyOwn ? (
                              <>
                                <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>តែរបស់ខ្លួន (Own Only)</span>
                              </>
                            ) : (
                              <>
                                <Globe className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                <span>មើលទាំងអស់ (All Data)</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className={`h-6.5 px-2 py-0.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 shadow-2xs select-none ${
                            user.viewOnlyOwn
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                          }`}>
                            {user.viewOnlyOwn ? (
                              <>
                                <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>តែរបស់ខ្លួន (Own Only)</span>
                              </>
                            ) : (
                              <>
                                <Globe className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                <span>មើលទាំងអស់ (All Data)</span>
                              </>
                            )}
                          </span>
                        )}
                      </td>

                      {/* Granular Action Rights Badges - SINGLE LINE COMPACT PILL */}
                      <td className="py-1 px-3 whitespace-nowrap">
                        {(() => {
                          const uRole = normalizeUserRole(user.role);
                          const canCreate = isMaster ? true : (user.canCreate !== undefined ? Boolean(user.canCreate) : (uRole !== 'VIEWER'));
                          const canEdit = isMaster ? true : (user.canEdit !== undefined ? Boolean(user.canEdit) : ['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'].includes(uRole));
                          const canDelete = isMaster ? true : (user.canDelete !== undefined ? Boolean(user.canDelete) : ['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'].includes(uRole));
                          return (
                            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                              {/* Create */}
                              <span
                                className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold inline-flex items-center gap-0.5 transition-all ${
                                  canCreate
                                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-2xs border border-emerald-200/80 dark:border-emerald-700/80'
                                    : 'text-slate-400 dark:text-slate-500 line-through opacity-45'
                                }`}
                                title={canCreate ? 'មានសិទ្ធិបង្កើត/បញ្ចូលថ្មី (Create)' : 'គ្មានសិទ្ធិបង្កើត/បញ្ចូលថ្មី'}
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>បញ្ចូល</span>
                              </span>

                              {/* Edit */}
                              <span
                                className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold inline-flex items-center gap-0.5 transition-all ${
                                  canEdit
                                    ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-2xs border border-blue-200/80 dark:border-blue-700/80'
                                    : 'text-slate-400 dark:text-slate-500 line-through opacity-45'
                                }`}
                                title={canEdit ? 'មានសិទ្ធិកែប្រែ (Edit)' : 'គ្មានសិទ្ធិកែប្រែ'}
                              >
                                <Edit2 className="w-2.5 h-2.5" />
                                <span>កែប្រែ</span>
                              </span>

                              {/* Delete */}
                              <span
                                className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold inline-flex items-center gap-0.5 transition-all ${
                                  canDelete
                                    ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-300 shadow-2xs border border-rose-200/80 dark:border-rose-700/80'
                                    : 'text-slate-400 dark:text-slate-500 line-through opacity-45'
                                }`}
                                title={canDelete ? 'មានសិទ្ធិលុប (Delete)' : 'គ្មានសិទ្ធិលុប'}
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                                <span>លុប</span>
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Allowed Pages Badge (Dynamic Update) */}
                      <td className="py-1 px-3 whitespace-nowrap">
                        {(() => {
                          const pages = isMaster
                            ? observedNavPages
                            : (Array.isArray(user.allowedPages) ? user.allowedPages : getDefaultAllowedPages(user.role));
                          const count = pages.length;
                          const total = observedNavPages.length;
                          const isFullAccess = count === total;
                          return (
                            <div className="inline-flex items-center">
                              <span
                                className={`h-6.5 px-2 py-0.5 rounded-lg text-[10.5px] font-bold border inline-flex items-center gap-1 shadow-2xs ${
                                  isFullAccess
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                    : count > 0
                                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                }`}
                                title={`ទំព័រដែលអនុញ្ញាត (${count}/${total}):\n${pages.join('\n')}`}
                              >
                                <Layers className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                                <span>{count}/{total} ទំព័រ</span>
                                {isFullAccess && <Check className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />}
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Created date */}
                      <td className="py-1 px-3 text-slate-400 dark:text-slate-500 text-[10.5px] font-medium whitespace-nowrap hidden xl:table-cell">
                        {new Date(user.createdAt).toLocaleDateString('km-KH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>

                      {/* Actions */}
                      <td className="py-1 px-3 text-right whitespace-nowrap">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-1">
                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(user)}
                              title={`កែប្រែព័ត៌មាន ${user.name || user.email}`}
                              className="inline-flex items-center gap-1 h-7 px-2.5 py-0.5 rounded-lg text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 bg-blue-50/80 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-900/80 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-97 whitespace-nowrap group"
                            >
                              <Edit2 className="w-3 h-3 text-blue-500 group-hover:scale-110 transition-transform" />
                              <span className="whitespace-nowrap">កែប្រែ</span>
                            </button>

                            {isMaster ? (
                              <span 
                                className="inline-flex items-center gap-1 h-7 text-[11px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-lg select-none border border-slate-200 dark:border-slate-700 whitespace-nowrap"
                                title="គណនី Master Admin ការពារជាអចិន្ត្រៃយ៍ មិនអាចលុបបានឡើយ"
                              >
                                <Lock className="w-3 h-3 text-slate-400" />
                                <span className="whitespace-nowrap">អចិន្ត្រៃយ៍</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setUserToDelete(user)}
                                title={`លុបគណនី ${user.email}`}
                                className="inline-flex items-center gap-1 h-7 px-2 py-0.5 rounded-lg text-[11px] font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 bg-rose-50/80 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 border border-rose-200/80 dark:border-rose-900/80 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-97 whitespace-nowrap group"
                              >
                                <Trash2 className="w-3 h-3 text-rose-500 group-hover:scale-110 transition-transform" />
                                <span className="whitespace-nowrap">លុប</span>
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
      </div>

      </>
      )}

      {/* ========================================================================= */}
      {/* 📜 TAB 2: USER ACTIVITY LOGS (AUDIT TRAIL) */}
      {/* ========================================================================= */}
      {activeTab === 'LOGS' && (
        <div className="page-fill-body space-y-3.5 animate-in fade-in duration-150">
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
          <GridObjectSelectionBar
            rows={logSelection.selectedRows}
            filename="activity_logs_selected"
            onClear={logSelection.clear}
          />
          <div className="page-fill-body sb-grid-wrap">
            <div className="page-fill-scroll overflow-x-auto max-h-[70vh] custom-scrollbar">
              <table className="sb-grid w-full text-left">
                <thead>
                  <tr>
                    <GridHeadGutter
                      checked={logSelection.allChecked}
                      indeterminate={logSelection.someChecked}
                      onToggleAll={logSelection.toggleAll}
                    />
                    <th className="py-3 px-4">កាលបរិច្ឆេទ & ម៉ោង (TIMESTAMP)</th>
                    <th className="py-3 px-4">អ្នកប្រតិបត្តិការ (OPERATOR)</th>
                    <th className="py-3 px-4">សកម្មភាព (ACTION)</th>
                    <th className="py-3 px-4">ព័ត៌មានលម្អិត (DETAILS)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        <History className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                        <div className="font-semibold text-sm">មិនមានកំណត់ត្រាសកម្មភាពឡើយ</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          នៅពេលអ្នកប្រើប្រាស់ Login, កត់ត្រាកញ្ចប់, ឬកែប្រែសិទ្ធិ នឹងមានកត់ត្រានៅទីនេះដោយស្វ័យប្រវត្តិ
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log, logIdx) => {
                      const badge = getActionBadge(log.action);
                      const BadgeIcon = badge.icon;
                      const initial = (log.operator || 'U').slice(0, 2).toUpperCase();

                      return (
                        <tr
                          key={log.id}
                          className={`group ${logSelection.isSelected(log.id) ? 'sb-selected' : ''}`}
                        >
                          <GridRowGutter
                            selected={logSelection.isSelected(log.id)}
                            rowNumber={logIdx + 1}
                            onToggle={() => logSelection.toggle(log.id)}
                          />
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
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className={`bg-white dark:bg-slate-900 w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col transition-all ${
            isAddModalFullscreen
              ? 'fixed inset-0 h-full max-w-none max-h-none rounded-none'
              : 'max-w-md max-h-[92vh]'
          }`}>
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  បន្ថែមអ្នកប្រើប្រាស់ និងកំណត់សិទ្ធិថ្មី
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalFullscreen(!isAddModalFullscreen)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title={isAddModalFullscreen ? 'បង្រួមតូច' : 'ពេញអេក្រង់ (Fullscreen)'}
                >
                  {isAddModalFullscreen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden sm:inline">បង្រួម</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden sm:inline">ពេញអេក្រង់</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setIsAddModalFullscreen(false);
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateUser} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              
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
                  list="staff-name-options"
                  placeholder="ជ្រើសរើសពីបញ្ជីបុគ្គលិក ឬវាយបញ្ចូល..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <datalist id="staff-name-options">
                  {staffNameOptions.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>

              {/* Password for Wi-Fi / Email Login */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ពាក្យសម្ងាត់ (Password សម្រាប់ Login Wi-Fi / LAN)
                </label>
                <input
                  type="text"
                  placeholder="ប្រសិនបើមិនបំពេញ នឹងប្រើ Default: 123456"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  * សម្រាប់ឱ្យបុគ្គលិក Login តាមរយៈ Email & Password លើ Wi-Fi (http://192.168.0.205:3000)
                </p>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  កំណត់កម្រិតសិទ្ធិ (Role) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS', 'CS_TEAMS_OPT', 'DELIVERY', 'DELIVERY_OPT', 'HUB', 'HUB_OPT', 'TAXI', 'TAXI_OPT', 'SALE_REP', 'SALE_GM', 'VIEWER'] as const).map((r) => {
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
              សកម្មភាពនេះនឹងដកសិទ្ធិគណនីនេះចេញពីប្រព័ន្ធ Google Sheets និង LocalStorage។
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
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className={`bg-white dark:bg-slate-900 w-full flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 transition-all ${
            isEditModalFullscreen
              ? 'fixed inset-0 h-full max-w-none max-h-none rounded-none'
              : 'max-w-4xl max-h-[92vh] rounded-2xl'
          }`}>
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 shrink-0">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                  កែប្រែព័ត៌មានអ្នកប្រើប្រាស់ និងសិទ្ធិ
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalFullscreen(!isEditModalFullscreen)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title={isEditModalFullscreen ? 'បង្រួមតូច' : 'ពេញអេក្រង់ (Fullscreen)'}
                >
                  {isEditModalFullscreen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden sm:inline">បង្រួម</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden sm:inline">ពេញអេក្រង់</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setUserToEdit(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEditUser} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
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
                  list="staff-name-options-edit"
                  placeholder="ជ្រើសរើសពីបញ្ជីបុគ្គលិក ឬវាយបញ្ចូល..."
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <datalist id="staff-name-options-edit">
                  {staffNameOptions.map((n) => <option key={n} value={n} />)}
                </datalist>
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

              {/* Password for Wi-Fi / Email Login */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ពាក្យសម្ងាត់ (Password សម្រាប់ Login Wi-Fi / LAN)
                </label>
                <input
                  type="text"
                  placeholder="កំណត់ពាក្យសម្ងាត់ថ្មី (Default: 123456)"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  * សម្រាប់ឱ្យបុគ្គលិក Login តាមរយៈ Email & Password លើ Wi-Fi (http://192.168.0.205:3000)
                </p>
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
                    {(['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS', 'CS_TEAMS_OPT', 'DELIVERY', 'DELIVERY_OPT', 'HUB', 'HUB_OPT', 'TAXI', 'TAXI_OPT', 'SALE_REP', 'SALE_GM', 'VIEWER'] as const).map((r) => {
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

              {/* Granular Action Permissions (Create, Edit, Delete) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-bold text-xs text-slate-700 dark:text-slate-300">
                    កំណត់សិទ្ធិប្រតិបត្តិការ (Action Permissions)
                  </label>
                  {isMasterAdmin(userToEdit.email) && (
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                      ពេញលេញ (Master Admin)
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {/* 1. Can Create */}
                  <div className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                    editCanCreate 
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60' 
                      : 'bg-slate-50 dark:bg-slate-850/60 border-slate-200 dark:border-slate-800'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                        editCanCreate
                          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                      }`}>
                        <Plus className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          សិទ្ធិបញ្ចូលថ្មី (Create / Add)
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          អនុញ្ញាតឱ្យបង្កើតទិន្នន័យ ឬរបាយការណ៍ថ្មីៗ
                        </div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={isMasterAdmin(userToEdit.email)}
                      onClick={() => setEditCanCreate(!editCanCreate)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out cursor-pointer focus:outline-none ${
                        isMasterAdmin(userToEdit.email) ? 'opacity-60 cursor-not-allowed' : ''
                      } ${editCanCreate ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                      role="switch"
                      aria-checked={editCanCreate}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                          editCanCreate ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 2. Can Edit */}
                  <div className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                    editCanEdit 
                      ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60' 
                      : 'bg-slate-50 dark:bg-slate-850/60 border-slate-200 dark:border-slate-800'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                        editCanEdit
                          ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                      }`}>
                        <Edit2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          សិទ្ធិកែប្រែ (Edit / Update)
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          អនុញ្ញាតឱ្យកែប្រែព័ត៌មាន និងទិន្នន័យដែលមានស្រាប់
                        </div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={isMasterAdmin(userToEdit.email)}
                      onClick={() => setEditCanEdit(!editCanEdit)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out cursor-pointer focus:outline-none ${
                        isMasterAdmin(userToEdit.email) ? 'opacity-60 cursor-not-allowed' : ''
                      } ${editCanEdit ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                      role="switch"
                      aria-checked={editCanEdit}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                          editCanEdit ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 3. Can Delete */}
                  <div className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                    editCanDelete 
                      ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60' 
                      : 'bg-slate-50 dark:bg-slate-850/60 border-slate-200 dark:border-slate-800'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                        editCanDelete
                          ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                      }`}>
                        <Trash2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          សិទ្ធិលុប (Delete / Remove)
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          អនុញ្ញាតឱ្យលុបទិន្នន័យ ឬរបាយការណ៍ចេញពីប្រព័ន្ធ
                        </div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={isMasterAdmin(userToEdit.email)}
                      onClick={() => setEditCanDelete(!editCanDelete)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out cursor-pointer focus:outline-none ${
                        isMasterAdmin(userToEdit.email) ? 'opacity-60 cursor-not-allowed' : ''
                      } ${editCanDelete ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                      role="switch"
                      aria-checked={editCanDelete}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                          editCanDelete ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Granular Page Access Permissions (9 Main Menu Pages) */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block font-bold text-xs text-slate-700 dark:text-slate-300">
                      កំណត់សិទ្ធិចូលមើលទំព័រ (Page Access Permissions)
                    </label>
                    <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                      បើក/បិទ ការចូលមើលទំព័រនីមួយៗនៅលើ Sidebar Menu
                    </span>
                  </div>
                  {!isMasterAdmin(userToEdit.email) ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSelectAllPages}
                        className="text-[10.5px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        ជ្រើសទាំងអស់
                      </button>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllPages}
                        className="text-[10.5px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:underline px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        ដកទាំងអស់
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                      {observedNavPages.length}/{observedNavPages.length} ទំព័រ (Master Admin)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {configurablePageDefinitions.map((page) => {
                    const isEnabled = isMasterAdmin(userToEdit.email) || editAllowedPages.includes(page.id);
                    const PageIcon = page.icon;
                    return (
                      <div
                        key={page.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                          isEnabled
                            ? page.activeBg
                            : 'bg-slate-50 dark:bg-slate-850/60 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                            isEnabled
                              ? page.iconActive
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                          }`}>
                            <PageIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {page.titleKm}
                            </div>
                            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                              {page.desc}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isMasterAdmin(userToEdit.email)}
                          onClick={() => handleTogglePageAccess(page.id)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out cursor-pointer focus:outline-none ${
                            isMasterAdmin(userToEdit.email) ? 'opacity-60 cursor-not-allowed' : ''
                          } ${isEnabled ? page.switchActive : 'bg-slate-300 dark:bg-slate-700'}`}
                          role="switch"
                          aria-checked={isEnabled}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                              isEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Receiving locations: Arrived Hub only shows OP-OUT sent to these Destinations */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block font-bold text-xs text-slate-700 dark:text-slate-300">
                      ទីតាំងប្រចាំការ (Hub Locations)
                    </label>
                    <span className="block text-[10.5px] text-slate-500 dark:text-slate-400">
                      បំពេញដោយស្វ័យប្រវត្តិ៖ ScanIn → DESTINATION, ScanOut → ORIGIN (១ ទីតាំង = ចាក់សោ)
                    </span>
                    <span className="block text-[10.5px] text-slate-500 dark:text-slate-400">
                      Arrived Hub: User មើលឃើញតែ OP-OUT ដែលបញ្ជូនមកទីតាំងទាំងនេះ
                    </span>
                  </div>
                  {isMasterAdmin(userToEdit.email) || editRole === 'ADMIN' ? (
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                      Admin មើលឃើញគ្រប់ទីតាំង
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300">{editAllowedLocations.length} ទីតាំង</span>
                      {editAllowedLocations.length > 0 && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <button
                            type="button"
                            onClick={() => setEditAllowedLocations([])}
                            className="text-[10.5px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:underline px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            ដកទាំងអស់
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {!(isMasterAdmin(userToEdit.email) || editRole === 'ADMIN') && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(new Set([...CAMBODIA_PROVINCES, ...editAllowedLocations])).map((location) => {
                        const selected = editAllowedLocations.includes(location);
                        return (
                          <button
                            key={location}
                            type="button"
                            onClick={() => handleToggleLocation(location)}
                            aria-pressed={selected}
                            className={`px-2 py-1 rounded-lg border text-[10.5px] font-semibold transition cursor-pointer ${
                              selected
                                ? 'bg-teal-600 border-teal-600 text-white'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-400'
                            }`}
                          >
                            {selected ? '✓ ' : ''}{location}
                          </button>
                        );
                      })}
                    </div>
                    {editAllowedLocations.length === 0 && (
                      <p className="mt-1.5 text-[10.5px] text-amber-700 dark:text-amber-400">
                        ⚠️ មិនទាន់កំណត់ទីតាំង — User នេះនឹងមិនឃើញ OP-OUT ណាមួយនៅ Arrived Hub ទេ។
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
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
