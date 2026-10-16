import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Laptop, X, Sparkles, CheckCircle2, Share, Info } from 'lucide-react';

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already running in standalone PWA mode
    const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isRunningStandalone);

    // Check if device is iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Check if previously dismissed in session
    const isDismissed = sessionStorage.getItem('ial_pwa_dismissed') === 'true';
    if (isDismissed) setDismissed(true);

    // Listen for beforeinstallprompt (Chrome / Android / Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      console.log('✓ PWA beforeinstallprompt event captured');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for appinstalled
    window.addEventListener('appinstalled', () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
      console.log('✓ IAL PWA installed successfully');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
      return;
    }

    // If native prompt is not yet ready or on iOS/Desktop without prompt, show the universal guide
    setShowGuideModal(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('ial_pwa_dismissed', 'true');
  };

  // If already running inside standalone app, do not show
  if (isStandalone || dismissed) {
    return null;
  }

  return (
    <>
      {/* Floating Bottom PWA Install Banner Template */}
      <aside 
        id="pwa-install-banner"
        aria-label="PWA App Installation"
        className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-40 animate-in slide-in-from-bottom-5 duration-300"
      >
        <div className="bg-slate-900/95 text-white dark:bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-3 sm:p-3.5 shadow-2xl backdrop-blur-md flex items-center gap-3">
          <img 
            src="/pwa-192x192.png" 
            alt="IAL Logo" 
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl shrink-0 shadow-md border border-cyan-400/40 object-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-xs sm:text-sm text-white truncate">
                ដំឡើង IAL Accounting App
              </span>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Sparkles className="w-2.5 h-2.5" /> PWA
              </span>
            </div>
            <p className="text-[11px] text-slate-300 truncate">
              ដំឡើងលើទូរស័ព្ទ / កុំព្យូទ័រ ដើម្បីដំណើរការលឿន 0ms
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="btn-install-pwa"
              type="button"
              onClick={handleInstallClick}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/40 active:scale-95 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ដំឡើង</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="បិទ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Universal Installation Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 text-white rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-600 text-white flex items-center justify-center shadow-md">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">
                    របៀបដំឡើង IAL Accounting App (PWA)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    ដំណើរការដូចកម្មវិធី Native App លើទូរស័ព្ទ និងកុំព្យូទ័រ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Platform Selection Cards */}
            <div className="space-y-2.5 text-xs text-slate-300">
              {/* Desktop Chrome / Edge */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-cyan-400">
                  <Laptop className="w-4 h-4" />
                  <span>សម្រាប់កុំព្យូទ័រ (Desktop Chrome / Edge)៖</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  ក្រឡេកមើលទៅ **ខាងស្ដាំនៃរបារ Address Bar** (កន្លែងវាយ link URL) ➔ ចុចលើ **រូប Icon ដំឡើង (💻 / ⊕ «Install»)** ➔ ចុច **Install** ជាការស្រេច។
                </p>
              </div>

              {/* Android Chrome */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <Smartphone className="w-4 h-4" />
                  <span>សម្រាប់ Android (Chrome)៖</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  ចុចសញ្ញាចុច ៣ (<b>⋮</b>) នៅជ្រុងខាងលើស្ដាំ ➔ ជ្រើសយក <b>«Install app»</b> ឬ <b>«Add to Home screen»</b>។
                </p>
              </div>

              {/* iOS Safari */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-blue-400">
                  <Share className="w-4 h-4" />
                  <span>សម្រាប់ iPhone / iPad (Safari)៖</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  ចុចប៊ូតុង <b>Share</b> (<Share className="w-3 h-3 inline mx-0.5 text-blue-400" />) ➔ រំកិលចុះក្រោមជ្រើសយក <b>«Add to Home Screen»</b> ➔ ចុច <b>Add</b>។
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 font-bold text-xs text-white transition active:scale-95 shadow-md cursor-pointer"
              >
                យល់ព្រម
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
