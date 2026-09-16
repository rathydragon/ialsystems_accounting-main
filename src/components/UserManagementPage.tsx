import React, { useState, useMemo } from 'react';
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
  Lock
} from 'lucide-react';
import { UserPermission, UserRole, AuthUser } from '../types';

export const MASTER_ADMIN_EMAIL = 'rathykim34@gmail.com';
export const isMasterAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  return email.toLowerCase().trim() === MASTER_ADMIN_EMAIL;
};

interface UserManagementPageProps {
  users: UserPermission[];
  currentUser: AuthUser | null;
  onAddUser: (newUser: Omit<UserPermission, 'id' | 'createdAt'>) => boolean;
  onUpdateRole: (id: string, newRole: UserRole) => void;
  onToggleStatus: (id: string) => void;
  onDeleteUser: (id: string) => void;
}

export const UserManagementPage: React.FC<UserManagementPageProps> = ({
  users,
  currentUser,
  onAddUser,
  onUpdateRole,
  onToggleStatus,
  onDeleteUser,
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form states for Add User
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('ACCOUNTANT');
  const [newStatus, setNewStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [formError, setFormError] = useState<string | null>(null);

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
          <button
            id="btn-add-user"
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ បន្ថែមអ្នកប្រើប្រាស់ថ្មី</span>
          </button>
        )}
      </div>

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
                          <button
                            type="button"
                            disabled={isCurrent || isMaster}
                            onClick={() => {
                              if (isMaster) return;
                              if (window.confirm(`តើអ្នកពិតជាចង់លុបគណនី ${user.email} ដែរឬទេ?`)) {
                                onDeleteUser(user.id);
                              }
                            }}
                            title={
                              isMaster 
                                ? "គណនី Master Admin ត្រូវបានការពារ មិនអាចលុបបានដាច់ខាត" 
                                : isCurrent 
                                ? "មិនអាចលុបគណនីកំពុង Login បានទេ" 
                                : "លុបអ្នកប្រើប្រាស់"
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

    </div>
  );
};
