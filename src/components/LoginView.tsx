import React, { useEffect, useState, useRef } from 'react';
import { AuthUser, AppSettings } from '../types';
import { 
  ShieldCheck, 
  LogIn, 
  Sparkles, 
  Lock, 
  Sun, 
  Moon, 
  CheckCircle2, 
  AlertCircle, 
  Settings, 
  ExternalLink,
  Users,
  BookOpen,
  Eye,
  EyeOff,
  Zap,
  UserCheck,
  Smartphone
} from 'lucide-react';

interface LoginViewProps {
  settings: AppSettings;
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
  onUpdateSettings,
  onLoginSuccess,
  onOpenGuide,
  darkMode,
  onToggleDarkMode,
}) => {
  const [activeTab, setActiveTab] = useState<'PIN' | 'GOOGLE'>('PIN');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  
  // Quick / PIN Login States
  const [directEmail, setDirectEmail] = useState('rathykim34@gmail.com');
  const [directName, setDirectName] = useState('KEUN RATHY');
  const [directPin, setDirectPin] = useState('123456');
  const [directPinError, setDirectPinError] = useState<string | null>(null);
  const [showPinPassword, setShowPinPassword] = useState(false);
  
  // Settings Config
  const [tempClientId, setTempClientId] = useState(settings.googleClientId || '');
  const [tempAllowedEmails, setTempAllowedEmails] = useState(settings.allowedEmails || '');
  const [isGsiLoaded, setIsGsiLoaded] = useState(false);
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  // Check if Google GSI script is loaded
  useEffect(() => {
    const checkGsi = () => {
      if (window.google?.accounts?.id) {
        setIsGsiLoaded(true);
      }
    };
    checkGsi();
    const timer = setInterval(checkGsi, 500);
    return () => clearInterval(timer);
  }, []);

  // Initialize and render Google Sign-In button if Google Tab is active
  useEffect(() => {
    if (!isGsiLoaded || !settings.googleClientId || !googleBtnContainerRef.current) return;

    try {
      window.google?.accounts.id.initialize({
        client_id: settings.googleClientId.trim(),
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

          // Check Allowed Emails Whitelist
          if (settings.allowedEmails && settings.allowedEmails.trim()) {
            const allowed = settings.allowedEmails
              .split(',')
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean);

            if (allowed.length > 0 && !allowed.includes(payload.email.toLowerCase())) {
              setErrorMsg(
                `អ៊ីមែល ${payload.email} មិនត្រូវបានអនុញ្ញាតឱ្យចូលប្រើប្រព័ន្ធនេះឡើយ។ សូមទាក់ទង Admin!`
              );
              return;
            }
          }

          const user: AuthUser = {
            id: payload.sub || `google-${Date.now()}`,
            name: payload.name || payload.email.split('@')[0],
            email: payload.email,
            picture: payload.picture,
            role: 'ADMIN',
          };

          setErrorMsg(null);
          onLoginSuccess(user);
        },
      });

      // Clear container and render button
      googleBtnContainerRef.current.innerHTML = '';
      window.google?.accounts.id.renderButton(googleBtnContainerRef.current, {
        theme: darkMode ? 'filled_black' : 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 320,
        logo_alignment: 'left',
      });
    } catch (err: any) {
      console.error('Error rendering Google Button:', err);
    }
  }, [isGsiLoaded, settings.googleClientId, settings.allowedEmails, darkMode, activeTab, onLoginSuccess]);

  // 1-Click Instant Login (Zero Hassle)
  const handleInstantLogin = () => {
    const user: AuthUser = {
      id: 'admin-' + Date.now(),
      name: directName.trim() || 'KEUN RATHY',
      email: directEmail.trim() || 'rathykim34@gmail.com',
      role: 'ADMIN',
    };
    onLoginSuccess(user);
  };

  // PIN Form Submit
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDirectPinError(null);

    const configuredPin = settings.adminPin?.trim() || '123456';
    if (directPin.trim() !== configuredPin) {
      setDirectPinError('❌ លេខសម្ងាត់ PIN មិនត្រឹមត្រូវឡើយ! (លេខកូដលំនាំដើម: 123456)');
      return;
    }

    const user: AuthUser = {
      id: 'admin-pin-' + Date.now(),
      name: directName.trim() || 'KEUN RATHY',
      email: directEmail.trim() || 'rathykim34@gmail.com',
      role: 'ADMIN',
    };
    onLoginSuccess(user);
  };

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
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl dark:shadow-2xl shadow-slate-200/50 dark:shadow-black/50 space-y-5">
          
          {/* Card Header */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 mb-1 shadow-xs">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              ចូលប្រើប្រព័ន្ធ (Sign In)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              ជ្រើសរើសវិធីចូលប្រើប្រាស់គណនេយ្យរបស់អ្នក
            </p>
          </div>

          {/* Login Mode Tabs */}
          <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200/60 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => {
                setActiveTab('PIN');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'PIN'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>ចូលរហ័ស (PIN Login)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('GOOGLE');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'GOOGLE'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>គណនី Google</span>
            </button>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: QUICK / PIN LOGIN (100% RELIABLE ON ANY PHONE & PC) */}
          {activeTab === 'PIN' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Profile Card Banner */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-100 dark:border-blue-900/60 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                  KR
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                      {directName}
                    </h3>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-blue-600 text-white uppercase tracking-wider">
                      Admin
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {directEmail}
                  </p>
                </div>
              </div>

              {/* 1-Click Instant Login Button */}
              <button
                type="button"
                onClick={handleInstantLogin}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition active:scale-[0.98] cursor-pointer"
              >
                <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                <span>⚡ ចុចចូលប្រើប្រព័ន្ធភ្លាមៗ (1-Click Instant Login)</span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                <span className="flex-shrink mx-2 text-[10px] uppercase font-bold text-slate-400">
                  ឬ ផ្ទៀងផ្ទាត់ដោយលេខកូដ PIN
                </span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              </div>

              {/* PIN Code Verification Form */}
              <form onSubmit={handlePinSubmit} className="space-y-3">
                {directPinError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{directPinError}</span>
                  </div>
                )}

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPinPassword ? 'text' : 'password'}
                    required
                    value={directPin}
                    onChange={(e) => {
                      setDirectPin(e.target.value);
                      setDirectPinError(null);
                    }}
                    placeholder="បញ្ចូលលេខសម្ងាត់ PIN (លំនាំដើម: 123456)"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinPassword(!showPinPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  >
                    {showPinPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 text-blue-600" />
                  <span>ផ្ទៀងផ្ទាត់ PIN & ចូលប្រើ</span>
                </button>
              </form>

              <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>ដំណើរការ ១០០% គ្រប់ទូរស័ព្ទ កុំព្យូទ័រ និងបណ្តាញ Wi-Fi ផ្សេងៗ</span>
              </div>
            </div>
          )}

          {/* TAB 2: GOOGLE SIGN IN */}
          {activeTab === 'GOOGLE' && (
            <div className="space-y-4 pt-1 animate-in fade-in duration-200">
              {settings.googleClientId ? (
                <div className="flex flex-col items-center justify-center gap-3">
                  <div ref={googleBtnContainerRef} className="min-h-[44px] flex items-center justify-center w-full" />
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    Google Identity Services
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/60 text-center space-y-3">
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

              {/* Helpful notice for Google Mobile issues */}
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                  <span>បើ Google Login លើ Phone គាំង ឬចេញផ្ទាំងស៖</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  សូមចុចលើផ្ទាំង <b>"ចូលរហ័ស (PIN Login)"</b> នៅខាងលើ រួចចុចប៊ូតុងពណ៌ខៀវ ដើម្បីចូលប្រើបានភ្លាមៗ ១០០% ដោយមិនបាច់រង់ចាំ Google ឡើយ!
                </p>
              </div>
            </div>
          )}

          {/* System Security Features Preview */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>ភ្ជាប់ទិន្នន័យផ្ទាល់ជាមួយ Google Sheets & Google Drive</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>ស្កេនកូដ QR & Barcode តាម Camera ទូរស័ព្ទភ្លាមៗ</span>
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
