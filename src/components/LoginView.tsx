import React, { useEffect, useState, useRef } from 'react';
import { AuthUser, AppSettings, UserPermission } from '../types';
import { isMasterAdmin, resolveOperator, IAL_ACCOUNTING_EMAIL } from '../services/userPermissionService';
import { 
  ShieldCheck, 
  Sparkles, 
  Sun, 
  Moon, 
  AlertCircle, 
  Settings, 
  ExternalLink,
  BookOpen,
  Loader2,
  CheckCircle2
} from 'lucide-react';

interface LoginViewProps {
  settings: AppSettings;
  permissions?: UserPermission[];
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onLoginSuccess: (user: AuthUser) => void;
  onOpenGuide?: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

// Helper to decode Google JWT token safely with base64 padding
function parseGoogleJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) {
      base64 += '='.repeat(4 - pad);
    }
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to parse Google JWT:', e);
    try {
      const base64Url = token.split('.')[1];
      let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad) base64 += '='.repeat(4 - pad);
      return JSON.parse(window.atob(base64));
    } catch (err2) {
      console.error('Fallback JWT parse failed:', err2);
      return null;
    }
  }
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export const LoginView: React.FC<LoginViewProps> = ({
  settings,
  permissions = [],
  onUpdateSettings,
  onLoginSuccess,
  onOpenGuide,
  darkMode,
  onToggleDarkMode,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  
  // Settings Config
  const [tempClientId, setTempClientId] = useState(settings.googleClientId || '');
  const [tempAllowedEmails, setTempAllowedEmails] = useState(settings.allowedEmails || '');
  const [isGsiLoaded, setIsGsiLoaded] = useState(false);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);
  const onLoginSuccessRef = useRef(onLoginSuccess);
  const settingsRef = useRef(settings);
  const permissionsRef = useRef(permissions);

  useEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess;
    settingsRef.current = settings;
    permissionsRef.current = permissions;
  });

  // Check if Google GSI script is loaded
  useEffect(() => {
    const checkGsi = () => {
      if (window.google?.accounts?.id) {
        setIsGsiLoaded(true);
      }
    };
    checkGsi();
    const timer = setInterval(checkGsi, 300);
    return () => clearInterval(timer);
  }, []);

  // Initialize Google Sign-In only when Client ID changes or GSI first loads
  useEffect(() => {
    if (!isGsiLoaded || !settings.googleClientId) return;

    try {
      window.google?.accounts.id.initialize({
        client_id: settings.googleClientId.trim(),
        auto_select: false,
        itp_support: true,
        use_fedcm_for_prompt: true,
        callback: (response: any) => {
          if (!response.credential) {
            setErrorMsg('បរាជ័យក្នុងការទទួលបាន Credential ពី Google។');
            return;
          }
          const payload = parseGoogleJwt(response.credential);
          if (!payload || !payload.email) {
            setErrorMsg('មិនអាចទាញយកទិន្នន័យពីគណនី Google នេះបានឡើយ។');
            return;
          }

          const emailClean = payload.email.toLowerCase().trim();
          const isMaster = isMasterAdmin(emailClean);

          // 1. Strict Whitelist Check: Must be Master Admin or pre-registered in Permissions
          const curPermissions = permissionsRef.current || [];
          const existingPerm = curPermissions.find(p => p.email.toLowerCase().trim() === emailClean);

          if (!isMaster) {
            if (!existingPerm) {
              setErrorMsg(
                `⚠️ គណនី «${payload.email}» មិនទាន់ត្រូវបាន Admin បន្ថែមក្នុងប្រព័ន្ធកំណត់សិទ្ធិឡើយ! សូមទាក់ទង Admin ជាមុនសិន។`
              );
              return;
            }

            if (existingPerm.status === 'SUSPENDED') {
              setErrorMsg(
                `⚠️ គណនី «${payload.email}» ត្រូវបានផ្អាកការប្រើប្រាស់ជាបណ្តោះអាសន្ន (Account Suspended)។ សូមទាក់ទង Admin!`
              );
              return;
            }
          }

          // 2. Also check legacy Allowed Emails Whitelist if specified in Settings
          const curSettings = settingsRef.current;
          if (curSettings.allowedEmails && curSettings.allowedEmails.trim()) {
            const allowed = curSettings.allowedEmails
              .split(',')
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean);

            if (allowed.length > 0 && !allowed.includes(emailClean)) {
              setErrorMsg(
                `អ៊ីមែល ${payload.email} មិនត្រូវបានអនុញ្ញាតឱ្យចូលប្រើប្រព័ន្ធនេះឡើយ។ សូមទាក់ទង Admin!`
              );
              return;
            }
          }

          // Strict operator name resolution based on actual logged-in email
          const opInfo = resolveOperator({ email: payload.email, name: payload.name }, curPermissions);

          const user: AuthUser = {
            id: payload.sub || `google-${Date.now()}`,
            name: opInfo.name,
            email: payload.email,
            picture: payload.picture,
            role: isMaster ? 'ADMIN' : (existingPerm ? existingPerm.role : 'VIEWER'),
          };

          setErrorMsg(null);
          onLoginSuccessRef.current(user);
        },
      });
    } catch (err: any) {
      console.error('Error initializing Google GSI:', err);
    }
  }, [isGsiLoaded, settings.googleClientId]);

  // Render Google Sign-In button when container is ready or darkMode changes
  useEffect(() => {
    if (!isGsiLoaded || !settings.googleClientId || !googleBtnContainerRef.current) return;

    try {
      googleBtnContainerRef.current.innerHTML = '';
      window.google?.accounts.id.renderButton(googleBtnContainerRef.current, {
        theme: darkMode ? 'filled_black' : 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 300,
        logo_alignment: 'left',
      });
    } catch (err: any) {
      console.error('Error rendering Google Button:', err);
    }
  }, [isGsiLoaded, settings.googleClientId, darkMode]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      googleClientId: tempClientId.trim(),
      allowedEmails: tempAllowedEmails.trim(),
    });
    setShowConfigModal(false);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between relative overflow-hidden transition-colors duration-200">
      {/* Background Decorative Gradient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500/10 dark:bg-blue-600/15 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 dark:bg-emerald-600/15 blur-3xl pointer-events-none" />

      {/* Top Navbar Toolbar */}
      <header className="w-full max-w-7xl mx-auto px-4 py-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              Accounting System
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ប្រព័ន្ធគណនេយ្យ និងហិរញ្ញវត្ថុ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dark / Light Mode Toggle */}
          <button
            onClick={onToggleDarkMode}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Setup Guide Button */}
          {onOpenGuide && (
            <button
              onClick={onOpenGuide}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="សៀវភៅណែនាំរៀបចំ Google Sheets & Drive"
            >
              <BookOpen className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <span className="hidden sm:inline">Setup Guide</span>
            </button>
          )}

          {/* Config Google Client ID Button */}
          <button
            onClick={() => setShowConfigModal(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="កំណត់ Google OAuth Client ID"
          >
            <Settings className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">OAuth Setup</span>
          </button>
        </div>
      </header>

      {/* Center Auth Card */}
      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl dark:shadow-2xl shadow-slate-200/50 dark:shadow-black/50 space-y-6">
          
          {/* Card Header with Google Logo */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm mb-1">
              <svg className="w-7 h-7" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              ចូលប្រើប្រព័ន្ធ (Sign In)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
              សូមជ្រើសរើសគណនី Google របស់អ្នកដើម្បីចូលប្រើប្រព័ន្ធគណនេយ្យ
            </p>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* GOOGLE SIGN IN BUTTON CONTAINER */}
          <div className="py-3 flex flex-col items-center justify-center gap-3">
            {settings.googleClientId ? (
              <>
                <div 
                  ref={googleBtnContainerRef} 
                  className="min-h-[48px] flex items-center justify-center w-full"
                >
                  {!isGsiLoaded && (
                    <div className="flex items-center justify-center gap-2 py-3 px-6 rounded-full border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span>កំពុងភ្ជាប់ជាមួយ Google...</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="w-full p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/60 text-center space-y-3">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-200">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Google OAuth Client ID មិនទាន់កំណត់
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  សូមចុចប៊ូតុងខាងក្រោមដើម្បីកំណត់ <b>Google OAuth Client ID</b> ផ្លូវការរបស់អ្នកសម្រាប់ការ Sign In៖
                </p>
                <button
                  type="button"
                  onClick={() => setShowConfigModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>បញ្ចូល Google Client ID</span>
                </button>
              </div>
            )}
          </div>

          {/* Trust & Security Badges */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>សុវត្ថិភាពខ្ពស់ ផ្ទៀងផ្ទាត់ដោយ Google OAuth 2.0</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>តភ្ជាប់ទិន្នន័យផ្ទាល់ជាមួយ Google Sheets & Google Drive</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>ដំណើរការបានគ្រប់ទូរស័ព្ទ កុំព្យូទ័រ និងឧបករណ៍ឆ្លាតវៃ</span>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-slate-400 dark:text-slate-600 relative z-10">
        Personal & Business Accounting • Powered by Google Cloud & Google Workspace
      </footer>

      {/* Google OAuth Client ID Setup Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Settings className="w-4 h-4 text-blue-600" />
                <span>កំណត់ Google Sign-In (OAuth Setup)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold p-1 text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Google OAuth 2.0 Client ID
                </label>
                <input
                  type="text"
                  placeholder="ឧ. 1234567890-xxx.apps.googleusercontent.com"
                  value={tempClientId}
                  onChange={(e) => setTempClientId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-[11px] focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  បង្កើតបានដោយឥតគិតថ្លៃក្នុង{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-0.5"
                  >
                    Google Cloud Console <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Allowed Emails / Whitelist (ស្រេចចិត្ត)
                </label>
                <input
                  type="text"
                  placeholder="admin@gmail.com, accountant@gmail.com"
                  value={tempAllowedEmails}
                  onChange={(e) => setTempAllowedEmails(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  ញែកដោយសញ្ញាក្បៀស (,)។ ប្រសិនបើទុកចោលទទេ រាល់ Gmail ទាំងអស់អាច Login បាន។
                </p>
              </div>

              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-[11px] text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-semibold">💡 របៀបកំណត់ម្ដងប្រើបានរហូត (Permanent Setup)៖</p>
                <p>• បញ្ចូល Client ID ខាងលើ រួចចុច <b>រក្សាទុក</b> ប្រព័ន្ធនឹងចងចាំក្នុង Browser របស់អ្នករហូត។</p>
                <p>• ឬបើក file <code>.env</code> ក្នុង project រួចដាក់ <code>VITE_GOOGLE_CLIENT_ID="ID_របស់អ្នក"</code> វានឹងដំណើរការរហូតគ្រប់ទូរស័ព្ទ និងកុំព្យូទ័រទាំងអស់ដោយស្វ័យប្រវត្តិ!</p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs cursor-pointer"
                >
                  រក្សាទុក (Save)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
