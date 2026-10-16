import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Info
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

  // Position state for portal
  const [coords, setCoords] = useState<{
    top: number;
    right: number;
    width: number;
    maxHeight: number;
  }>({
    top: 0,
    right: 0,
    width: 360,
    maxHeight: 520
  });

  // Sync config when updated externally or mounted
  useEffect(() => {
    const handleUpdate = () => {
      setConfig(getScannerSoundConfig());
    };
    window.addEventListener('accounting_sound_config_changed', handleUpdate);
    return () => window.removeEventListener('accounting_sound_config_changed', handleUpdate);
  }, []);

  // Calculate coordinates relative to trigger button
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const padding = 12;
    const preferredWidth = Math.min(380, window.innerWidth - padding * 2);
    const popoverMaxHeight = Math.min(540, window.innerHeight - padding * 2);

    // Calculate vertical position
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;

    let top = rect.bottom + 6;
    let computedMaxHeight = Math.min(popoverMaxHeight, spaceBelow);

    // If space below is too small and space above is larger, flip upwards
    if (spaceBelow < 340 && spaceAbove > spaceBelow) {
      computedMaxHeight = Math.min(popoverMaxHeight, spaceAbove);
      top = Math.max(padding, rect.top - computedMaxHeight - 6);
    } else {
      computedMaxHeight = Math.max(260, Math.min(popoverMaxHeight, spaceBelow));
    }

    // Calculate horizontal position (align to right edge of button, clamp within screen)
    let right = window.innerWidth - rect.right;
    if (right < padding) right = padding;
    if (rect.right - preferredWidth < padding) {
      right = Math.max(padding, window.innerWidth - preferredWidth - padding);
    }

    setCoords({
      top,
      right,
      width: preferredWidth,
      maxHeight: computedMaxHeight
    });
  }, []);

  // Update position when opened
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

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
          <div className="fixed inset-0 z-[99999] pointer-events-auto">
            {/* Backdrop for click outside */}
            <div
              className="fixed inset-0 bg-slate-950/20 dark:bg-black/50 backdrop-blur-[0.5px] transition-opacity animate-in fade-in duration-100"
              onClick={() => setIsOpen(false)}
            />

            {/* Popover Floating Card */}
            <div
              ref={popoverRef}
              style={{
                position: 'fixed',
                top: `${coords.top}px`,
                right: `${coords.right}px`,
                width: `${coords.width}px`,
                maxHeight: `${coords.maxHeight}px`
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col z-[100000] overflow-hidden text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header (Sticky top) */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-200/50 dark:border-amber-700/30">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold leading-tight text-slate-900 dark:text-white">
                      កំណត់សំឡេងស្កេន
                    </h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 leading-none mt-0.5">
                      Scanner Sound & Audio Feedback
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                    title="កំណត់ឡើងវិញ (Reset to Default)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                    title="បិទ (Close)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin">
                {/* 1. Toggle Enable / Disable Sound */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        config.enabled
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {config.enabled ? (
                        <Volume2 className="w-4 h-4" />
                      ) : (
                        <VolumeX className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-xs block text-slate-800 dark:text-slate-200">
                        {config.enabled ? 'សំឡេងកំពុងបើកដំណើរការ' : 'សំឡេងត្រូវបានបិទ'}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {config.enabled ? 'បញ្ចេញសំឡេងពេល Scan និង Save' : 'ស្ងាត់គ្មានសំឡេង'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => updateConfig({ enabled: !config.enabled }, !config.enabled)}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      config.enabled ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        config.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 2. Volume Slider */}
                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                      កម្រិតសំឡេង (Volume)
                    </span>
                    <span className="font-mono font-bold text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200/50 dark:border-amber-800/50">
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
                    onMouseUp={() => {
                      if (config.enabled) handleTestScan();
                    }}
                    onTouchEnd={() => {
                      if (config.enabled) handleTestScan();
                    }}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none disabled:opacity-40"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                    <span>10% (ស្រាល)</span>
                    <span>50%</span>
                    <span>100% (ខ្លាំង)</span>
                  </div>
                </div>

                {/* 3. Scan Success Tone Options */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      សំឡេងស្កេនជាប់ (Success Tone)
                    </span>
                    <button
                      type="button"
                      disabled={!config.enabled}
                      onClick={() => handleTestScan()}
                      className="px-2.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 text-[10.5px] font-bold flex items-center gap-1 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition disabled:opacity-40 cursor-pointer"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      តេស្ត
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
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
                          className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs cursor-pointer transition select-none ${
                            isSelected
                              ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 font-semibold shadow-2xs'
                              : 'border-slate-150 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          } ${!config.enabled ? 'opacity-40 pointer-events-none' : ''}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                            <div>
                              <p className="leading-tight text-[11.5px] font-semibold">{tone.label}</p>
                              <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                                {tone.desc}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestScan(tone.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-amber-100/70 dark:hover:bg-amber-900/50 text-slate-400 hover:text-amber-600 dark:hover:text-amber-300 transition cursor-pointer"
                            title="ស្តាប់សំឡេងនេះ"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Error / Warning Tone Options */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                      សំឡេងពេល Error / ស្កេនជាន់ (Warning Tone)
                    </span>
                    <button
                      type="button"
                      disabled={!config.enabled}
                      onClick={() => handleTestWarning()}
                      className="px-2.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 text-[10.5px] font-bold flex items-center gap-1 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition disabled:opacity-40 cursor-pointer"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      តេស្ត
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
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
                          className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs cursor-pointer transition select-none ${
                            isSelected
                              ? 'border-rose-400 bg-rose-50/80 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-semibold shadow-2xs'
                              : 'border-slate-150 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          } ${!config.enabled ? 'opacity-40 pointer-events-none' : ''}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'border-rose-500 bg-rose-500 text-white shadow-xs'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                            <div>
                              <p className="leading-tight text-[11.5px] font-semibold">{tone.label}</p>
                              <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                                {tone.desc}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestWarning(tone.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-rose-100/70 dark:hover:bg-rose-900/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 transition cursor-pointer"
                            title="ស្តាប់សំឡេងនេះ"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Voice Speech (TTS) Option */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-xs block leading-tight text-slate-800 dark:text-slate-200">
                        អានជាសំឡេងនិយាយ (Voice Speech)
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        អានពាក្យ "ជោគជ័យ" ឬ "កំហុស / ស្ទួន"
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!config.enabled}
                    onClick={() => updateConfig({ voiceSpeech: !config.voiceSpeech }, true)}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-40 ${
                      config.voiceSpeech ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        config.voiceSpeech ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Footer info (Sticky bottom) */}
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>សំឡេងនឹងបន្លឺឡើងរាល់ពេលស្កេន Barcode, រក្សាទុក ឬស្កេនស្ទួន។</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
