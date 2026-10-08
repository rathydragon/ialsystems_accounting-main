import React, { useState, useEffect, useRef } from 'react';
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
  RotateCcw
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
}

export const ScannerSoundSettingsPopover: React.FC<ScannerSoundSettingsPopoverProps> = ({ className = '' }) => {
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

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const updateConfig = (patch: Partial<ScannerSoundConfig>) => {
    const updated = { ...config, ...patch };
    setConfig(updated);
    saveScannerSoundConfig(updated);
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

  const scanToneOptions: { id: ScanToneType; label: string; desc: string }[] = [
    { id: 'beep', label: 'Classic Beep', desc: 'សំឡេងម៉ាស៊ីនស្កេនស្តង់ដារ' },
    { id: 'chime', label: 'Soft Chime', desc: 'សំឡេងជួងទន់ភ្លន់ ពីរតុង' },
    { id: 'laser', label: 'Laser Sweep', desc: 'សំឡេងឡាស៊ែររហ័ស ទំនើប' },
    { id: 'success', label: 'Melodic Success', desc: 'សំឡេងជោគជ័យស្រទន់' },
    { id: 'kaching', label: 'Ka-Ching', desc: 'សំឡេងកាក់លុយភ្លឺច្បាស់' }
  ];

  const errorToneOptions: { id: ErrorToneType; label: string; desc: string }[] = [
    { id: 'buzzer', label: 'Buzzer', desc: 'សំឡេងព្រមានស្តង់ដារ' },
    { id: 'pulse', label: 'Triple Pulse', desc: 'សំឡេងរោទ៍ ៣ ដងខ្លីៗ' },
    { id: 'subtle', label: 'Subtle Thud', desc: 'សំឡេងស្រាល មិនរំខាន' }
  ];

  const volumePercent = Math.round(config.volume * 100);

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Trigger Button with Speaker Icon */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-8 px-2 sm:px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs select-none ${
          config.enabled
            ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
        }`}
        title="កំណត់សំឡេងស្កេន (ចុចដើម្បីបើកផ្ទាំងសារ៉េសំឡេង)"
      >
        {config.enabled ? (
          config.volume < 0.4 ? (
            <Volume1 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          )
        ) : (
          <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        <span className="hidden xl:inline text-[11px] font-medium">
          {config.enabled ? `${volumePercent}%` : 'បិទ'}
        </span>
      </button>

      {/* Popover Settings Dropdown */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-80 sm:w-88 max-w-[90vw] p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100"
          style={{ transformOrigin: 'top right' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold leading-tight">កំណត់សំឡេងស្កេន</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Scanner Sound & Tones</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleReset}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
                title="កំណត់ឡើងវិញ (Reset)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* Toggle Enable/Disable Sound */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {config.enabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
                <span className="font-semibold text-xs">
                  {config.enabled ? 'សំឡេងកំពុងបើក' : 'សំឡេងត្រូវបានបិទ'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => updateConfig({ enabled: !config.enabled })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  config.enabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    config.enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Volume Slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                  កម្រិតសំឡេង (Volume)
                </span>
                <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                  {volumePercent}%
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={config.volume}
                disabled={!config.enabled}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateConfig({ volume: val });
                }}
                className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none disabled:opacity-40"
              />
            </div>

            {/* Scan Success Tone Options */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  សំឡេងស្កេនជាប់ (Success Tone)
                </span>
                <button
                  type="button"
                  disabled={!config.enabled}
                  onClick={() => handleTestScan()}
                  className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-200 transition disabled:opacity-40 cursor-pointer"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  តេស្ត
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1">
                {scanToneOptions.map((tone) => {
                  const isSelected = config.scanTone === tone.id;
                  return (
                    <div
                      key={tone.id}
                      onClick={() => {
                        if (!config.enabled) return;
                        updateConfig({ scanTone: tone.id });
                        handleTestScan(tone.id);
                      }}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer transition ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                          : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                      } ${!config.enabled ? 'opacity-40 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <div>
                          <p className="leading-tight text-[11px] font-medium">{tone.label}</p>
                          <p className="text-[9px] text-slate-400 leading-none">{tone.desc}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestScan(tone.id);
                        }}
                        className="p-1 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-slate-400 hover:text-emerald-600 transition"
                        title="ស្តាប់សំឡេងនេះ"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error / Warning Tone Options */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  សំឡេងពេល Error / ស្កេនជាន់ (Warning Tone)
                </span>
                <button
                  type="button"
                  disabled={!config.enabled}
                  onClick={() => handleTestWarning()}
                  className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold flex items-center gap-1 hover:bg-rose-200 transition disabled:opacity-40 cursor-pointer"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  តេស្ត
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1">
                {errorToneOptions.map((tone) => {
                  const isSelected = config.errorTone === tone.id;
                  return (
                    <div
                      key={tone.id}
                      onClick={() => {
                        if (!config.enabled) return;
                        updateConfig({ errorTone: tone.id });
                        handleTestWarning(tone.id);
                      }}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer transition ${
                        isSelected
                          ? 'border-rose-400 bg-rose-50/80 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-semibold'
                          : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                      } ${!config.enabled ? 'opacity-40 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-rose-600 bg-rose-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <div>
                          <p className="leading-tight text-[11px] font-medium">{tone.label}</p>
                          <p className="text-[9px] text-slate-400 leading-none">{tone.desc}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestWarning(tone.id);
                        }}
                        className="p-1 rounded-md hover:bg-rose-100 dark:hover:bg-rose-900/50 text-slate-400 hover:text-rose-600 transition"
                        title="ស្តាប់សំឡេងនេះ"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Voice Speech (TTS) Option */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-purple-600" />
                <div>
                  <span className="font-semibold text-xs block leading-tight">អានជាសំឡេងនិយាយ</span>
                  <span className="text-[9px] text-slate-400">អានពាក្យ "ជោគជ័យ" ឬ "កំហុស"</span>
                </div>
              </div>
              <button
                type="button"
                disabled={!config.enabled}
                onClick={() => updateConfig({ voiceSpeech: !config.voiceSpeech })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-40 ${
                  config.voiceSpeech ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    config.voiceSpeech ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
