import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Volume2,
  VolumeX,
  Volume1,
  Play,
  Check,
  X,
  Sparkles,
  Sliders,
  AlertTriangle,
  Mic,
  RotateCcw,
  ChevronDown,
  Info,
  ScanLine,
  Bell,
  Zap,
  Music,
  Coins,
  AlertOctagon,
  Activity,
  Feather
} from 'lucide-react';
import {
  ScannerSoundConfig,
  ScanToneType,
  ErrorToneType,
  getScannerSoundConfig,
  saveScannerSoundConfig,
  playScanSound,
  playWarningSound,
  DEFAULT_SOUND_CONFIG
} from '../utils/scannerSound';

interface ScannerSoundSettingsPopoverProps {
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'toolbar' | 'default';
  showLabel?: boolean;
}

export const ScannerSoundSettingsPopover: React.FC<ScannerSoundSettingsPopoverProps> = ({
  className = '',
  size = 'md',
  showLabel = true
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [config, setConfig] = useState<ScannerSoundConfig>(() => getScannerSoundConfig());
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Sync config when updated externally or mounted
  useEffect(() => {
    const handleUpdate = () => {
      setConfig(getScannerSoundConfig());
    };
    window.addEventListener('accounting_sound_config_changed', handleUpdate);
    return () => window.removeEventListener('accounting_sound_config_changed', handleUpdate);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const updateConfig = (patch: Partial<ScannerSoundConfig>, playPreview = false) => {
    const updated = { ...config, ...patch };
    setConfig(updated);
    saveScannerSoundConfig(updated);
    if (playPreview && updated.enabled) {
      playScanSound(updated);
    }
  };

  const handleTestScan = (tone?: ScanToneType) => {
    const testCfg: ScannerSoundConfig = {
      ...config,
      enabled: true,
      scanTone: tone || config.scanTone
    };
    playScanSound(testCfg);
  };

  const handleTestWarning = (tone?: ErrorToneType) => {
    const testCfg: ScannerSoundConfig = {
      ...config,
      enabled: true,
      errorTone: tone || config.errorTone
    };
    playWarningSound(testCfg);
  };

  const handleReset = () => {
    setConfig(DEFAULT_SOUND_CONFIG);
    saveScannerSoundConfig(DEFAULT_SOUND_CONFIG);
    playScanSound(DEFAULT_SOUND_CONFIG);
  };

  const scanToneOptions: { id: ScanToneType; label: string; desc: string; icon: React.ElementType }[] = [
    { id: 'beep', label: 'Classic Beep', desc: 'ម៉ាស៊ីនស្កេនស្តង់ដារ', icon: ScanLine },
    { id: 'chime', label: 'Soft Chime', desc: 'ជួងទន់ភ្លន់ ពីរតុង', icon: Bell },
    { id: 'laser', label: 'Laser Sweep', desc: 'ឡាស៊ែររហ័ស ទំនើប', icon: Zap },
    { id: 'success', label: 'Melodic', desc: 'ជោគជ័យស្រទន់', icon: Music },
    { id: 'kaching', label: 'Ka-Ching', desc: 'កាក់លុយភ្លឺច្បាស់', icon: Coins }
  ];

  const errorToneOptions: { id: ErrorToneType; label: string; desc: string; icon: React.ElementType }[] = [
    { id: 'buzzer', label: 'Buzzer', desc: 'ព្រមានស្តង់ដារ', icon: AlertOctagon },
    { id: 'pulse', label: 'Pulse', desc: 'រោទ៍ ៣ ដង', icon: Activity },
    { id: 'subtle', label: 'Subtle', desc: 'ស្រាល មិនរំខាន', icon: Feather }
  ];

  const volumePercent = Math.round(config.volume * 100);
  // Slider range is 10%–100%; map to 0–100% fill for the track gradient
  const volumeFill = ((config.volume - 0.1) / 0.9) * 100;
  const volumePresets = [0.25, 0.5, 0.75, 1];

  const renderSwitch = (on: boolean, onToggle: () => void, onClass: string, disabled = false) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? onClass : 'bg-slate-200 dark:bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );

  // Button height & padding classes based on size prop
  const isSm = size === 'sm';
  const buttonHeightClass = isSm ? 'h-7 px-2 text-[10.5px]' : 'h-7.5 px-2.5 text-[11px]';

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Trigger Button Harmonized with Header Toolbar Design */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`${buttonHeightClass} rounded-lg border font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs select-none shrink-0 ${
          config.enabled
            ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
            : 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/40 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title="កំណត់សំឡេងស្កេន (ចុចដើម្បីបើកផ្ទាំងសារ៉េសំឡេង)"
      >
        {config.enabled ? (
          config.volume < 0.4 ? (
            <Volume1 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
          )
        ) : (
          <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}

        {showLabel && (
          <span className="text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
            {config.enabled ? `${volumePercent}%` : 'បិទ'}
          </span>
        )}

        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Popover Settings Menu Rendered via Portal to Prevent Any Clipping */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[99999] pointer-events-auto flex items-center justify-center p-4">
            {/* Backdrop for click outside */}
            <div
              className="fixed inset-0 bg-slate-950/40 dark:bg-black/60 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150"
              onClick={() => setIsOpen(false)}
            />

            {/* Centered Modal Card */}
            <div
              ref={popoverRef}
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-[400px] max-h-[min(640px,calc(100vh-2rem))] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/30">
                    <Sliders className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-[13px] font-bold leading-tight text-slate-900 dark:text-white truncate">
                      កំណត់សំឡេងស្កេន
                    </h4>
                    <p className="text-[10.5px] text-slate-400 leading-tight mt-0.5 truncate">
                      Scanner Sound & Audio Feedback
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                    title="កំណត់ឡើងវិញ (Reset to Default)"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                    title="បិទ (Close)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-xs scrollbar-thin">
                {/* 1. Master on/off */}
                <div
                  className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-colors ${
                    config.enabled
                      ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200/70 dark:border-amber-800/40'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        config.enabled
                          ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                      }`}
                    >
                      {config.enabled ? <Volume2 className="w-4.5 h-4.5" /> : <VolumeX className="w-4.5 h-4.5" />}
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-[12.5px] block leading-tight text-slate-800 dark:text-slate-100">
                        {config.enabled ? 'សំឡេងកំពុងបើក' : 'សំឡេងត្រូវបានបិទ'}
                      </span>
                      <span className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-tight">
                        {config.enabled ? 'បញ្ចេញសំឡេងពេល Scan និង Save' : 'បើកដើម្បីកំណត់សំឡេងខាងក្រោម'}
                      </span>
                    </div>
                  </div>
                  {renderSwitch(config.enabled, () => updateConfig({ enabled: !config.enabled }, !config.enabled), 'bg-amber-500')}
                </div>

                <div className={`space-y-5 transition-opacity ${config.enabled ? '' : 'opacity-50 pointer-events-none select-none'}`}>
                  {/* 2. Volume */}
                  <section>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">
                        កម្រិតសំឡេង <span className="text-slate-400 font-normal">· Volume</span>
                      </span>
                      <span className="tabular-nums font-bold text-[12px] text-amber-600 dark:text-amber-400">
                        {volumePercent}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Volume1 className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={config.volume}
                        disabled={!config.enabled}
                        aria-label="Volume"
                        onChange={(e) => updateConfig({ volume: parseFloat(e.target.value) })}
                        onMouseUp={() => config.enabled && handleTestScan()}
                        onTouchEnd={() => config.enabled && handleTestScan()}
                        style={{
                          background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${volumeFill}%, var(--track-bg) ${volumeFill}%, var(--track-bg) 100%)`
                        }}
                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer [--track-bg:#e2e8f0] dark:[--track-bg:#334155] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-amber-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-amber-500"
                      />
                      <Volume2 className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 mt-3">
                      {volumePresets.map((v) => {
                        const active = Math.abs(config.volume - v) < 0.01;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => updateConfig({ volume: v }, true)}
                            className={`h-7 rounded-lg text-[11px] font-semibold tabular-nums transition cursor-pointer ${
                              active
                                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {Math.round(v * 100)}%
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <div className="h-px bg-slate-100 dark:bg-slate-800" />

                  {/* 3. Success tone */}
                  <section>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        សំឡេងស្កេនជាប់ <span className="text-slate-400 font-normal">· Success</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleTestScan()}
                        className="h-6 px-2.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10.5px] font-semibold flex items-center gap-1 hover:bg-amber-500/20 transition cursor-pointer"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        តេស្ត
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {scanToneOptions.map((tone) => {
                        const isSelected = config.scanTone === tone.id;
                        const Icon = tone.icon;
                        return (
                          <button
                            key={tone.id}
                            type="button"
                            onClick={() => {
                              updateConfig({ scanTone: tone.id });
                              handleTestScan(tone.id);
                            }}
                            className={`group relative flex items-center gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition select-none ${
                              isSelected
                                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-400/60'
                                : 'border-slate-200 dark:border-slate-700/70 hover:border-amber-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-amber-600'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-[11.5px] font-semibold leading-tight truncate ${isSelected ? 'text-amber-900 dark:text-amber-200' : 'text-slate-700 dark:text-slate-200'}`}>
                                {tone.label}
                              </p>
                              <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">{tone.desc}</p>
                            </div>
                            {isSelected && (
                              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* 4. Warning tone */}
                  <section>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        សំឡេង Error / ស្កេនជាន់
                      </span>
                      <button
                        type="button"
                        onClick={() => handleTestWarning()}
                        className="h-6 px-2.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[10.5px] font-semibold flex items-center gap-1 hover:bg-rose-500/20 transition cursor-pointer"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        តេស្ត
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70">
                      {errorToneOptions.map((tone) => {
                        const isSelected = config.errorTone === tone.id;
                        const Icon = tone.icon;
                        return (
                          <button
                            key={tone.id}
                            type="button"
                            onClick={() => {
                              updateConfig({ errorTone: tone.id });
                              handleTestWarning(tone.id);
                            }}
                            title={tone.desc}
                            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg cursor-pointer transition select-none ${
                              isSelected
                                ? 'bg-white dark:bg-slate-900 shadow-sm text-rose-600 dark:text-rose-400'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            <span className="text-[11px] font-semibold leading-none">{tone.label}</span>
                            <span className="text-[9.5px] text-slate-400 leading-none truncate max-w-full">{tone.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <div className="h-px bg-slate-100 dark:bg-slate-800" />

                  {/* 5. Voice speech */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Mic className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-[12px] block leading-tight text-slate-800 dark:text-slate-100">
                          អានជាសំឡេងនិយាយ
                        </span>
                        <span className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-tight">
                          អាន "ជោគជ័យ" ឬ "កំហុស / ស្ទួន"
                        </span>
                      </div>
                    </div>
                    {renderSwitch(
                      config.voiceSpeech,
                      () => updateConfig({ voiceSpeech: !config.voiceSpeech }, true),
                      'bg-indigo-600',
                      !config.enabled
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 text-[10.5px] text-slate-500 dark:text-slate-400 flex items-center gap-2 shrink-0">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>បន្លឺឡើងពេលស្កេន Barcode, រក្សាទុក ឬស្កេនស្ទួន · រក្សាទុកស្វ័យប្រវត្តិ</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
