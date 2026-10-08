// Scanner sound feedback engine with configurable tones, volume, and speech

export type ScanToneType = 'beep' | 'chime' | 'laser' | 'success' | 'kaching';
export type ErrorToneType = 'buzzer' | 'pulse' | 'subtle';

export interface ScannerSoundConfig {
  enabled: boolean;
  volume: number; // 0.1 to 1.0
  scanTone: ScanToneType;
  errorTone: ErrorToneType;
  voiceSpeech: boolean;
}

const STORAGE_KEY = 'accounting_scanner_sound_settings';

export const DEFAULT_SOUND_CONFIG: ScannerSoundConfig = {
  enabled: true,
  volume: 0.8,
  scanTone: 'beep',
  errorTone: 'buzzer',
  voiceSpeech: false,
};

let cachedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!cachedAudioContext || cachedAudioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        cachedAudioContext = new AudioCtx();
      }
    }
    if (cachedAudioContext && cachedAudioContext.state === 'suspended') {
      cachedAudioContext.resume().catch(() => {});
    }
    return cachedAudioContext;
  } catch {
    return null;
  }
}

export function getScannerSoundConfig(): ScannerSoundConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SOUND_CONFIG.enabled,
        volume: typeof parsed.volume === 'number' && parsed.volume >= 0.05 && parsed.volume <= 1 ? parsed.volume : DEFAULT_SOUND_CONFIG.volume,
        scanTone: ['beep', 'chime', 'laser', 'success', 'kaching'].includes(parsed.scanTone) ? parsed.scanTone : DEFAULT_SOUND_CONFIG.scanTone,
        errorTone: ['buzzer', 'pulse', 'subtle'].includes(parsed.errorTone) ? parsed.errorTone : DEFAULT_SOUND_CONFIG.errorTone,
        voiceSpeech: typeof parsed.voiceSpeech === 'boolean' ? parsed.voiceSpeech : DEFAULT_SOUND_CONFIG.voiceSpeech,
      };
    }
  } catch (e) {
    console.debug('Failed to load scanner sound config:', e);
  }
  return { ...DEFAULT_SOUND_CONFIG };
}

export function saveScannerSoundConfig(config: ScannerSoundConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('accounting_sound_config_changed', { detail: config }));
  } catch (e) {
    console.debug('Failed to save scanner sound config:', e);
  }
}

/**
 * Play success scan sound
 */
export function playScanSound(customConfig?: ScannerSoundConfig): void {
  const cfg = customConfig || getScannerSoundConfig();
  if (!cfg.enabled) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterVolume = Math.max(0.05, Math.min(1, cfg.volume));

  try {
    switch (cfg.scanTone) {
      case 'chime': {
        // Soft dual-tone bell (E6: 1318.5Hz + G#6: 1661.2Hz)
        [1318.5, 1661.2].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.12 * masterVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.28);
        });
        break;
      }

      case 'laser': {
        // Futuristic short laser sweep (2200Hz down to 600Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
        gain.gain.setValueAtTime(0.18 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }

      case 'success': {
        // 2-tone melodic chime: G5 (784Hz) -> C6 (1046.5Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(783.99, now);
        gain1.gain.setValueAtTime(0.14 * masterVolume, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.09);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.5, now + 0.08);
        gain2.gain.setValueAtTime(0.16 * masterVolume, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.25);
        break;
      }

      case 'kaching': {
        // Bright metallic double ping
        [1760, 2637].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          const startTime = now + idx * 0.06;
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.14 * masterVolume, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.2);
        });
        break;
      }

      case 'beep':
      default: {
        // Classic crisp scanner beep (C6: 1046.5Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.5, now);
        gain.gain.setValueAtTime(0.14 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
    }
  } catch (e) {
    console.debug('Failed to play scan sound:', e);
  }

  if (cfg.voiceSpeech) {
    speakSpeech('ជោគជ័យ', 'Success');
  }
}

/**
 * Play warning / error sound
 */
export function playWarningSound(customConfig?: ScannerSoundConfig): void {
  const cfg = customConfig || getScannerSoundConfig();
  if (!cfg.enabled) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterVolume = Math.max(0.05, Math.min(1, cfg.volume));

  try {
    switch (cfg.errorTone) {
      case 'pulse': {
        // Triple short alert beeps at 440Hz
        [0, 0.08, 0.16].forEach((offset) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(440, now + offset);
          gain.gain.setValueAtTime(0.1 * masterVolume, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.05);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.05);
        });
        break;
      }

      case 'subtle': {
        // Low soft thud
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.18);
        gain.gain.setValueAtTime(0.25 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      }

      case 'buzzer':
      default: {
        // Classic descending buzzer (320Hz -> 200Hz sawtooth)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.setValueAtTime(220, now + 0.1);
        gain.gain.setValueAtTime(0.2 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }
    }
  } catch (e) {
    console.debug('Failed to play warning sound:', e);
  }

  if (cfg.voiceSpeech) {
    speakSpeech('កំហុស', 'Warning');
  }
}

/**
 * Web Speech synthesis fallback
 */
function speakSpeech(khmerText: string, fallbackEnText: string): void {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(khmerText);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      utterance.lang = 'km-KH';
      utterance.onerror = () => {
        try {
          const fallback = new SpeechSynthesisUtterance(fallbackEnText);
          fallback.lang = 'en-US';
          window.speechSynthesis.speak(fallback);
        } catch {}
      };
      window.speechSynthesis.speak(utterance);
    }
  } catch {}
}
