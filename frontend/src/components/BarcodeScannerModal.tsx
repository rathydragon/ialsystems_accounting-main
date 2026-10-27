import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  X,
  SwitchCamera,
  Flashlight,
  FlashlightOff,
  ImageUp,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ScanLine,
  Info,
  Keyboard,
  ArrowRight,
  Zap,
  Repeat,
  Target
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

import { sanitizeTrackingCode } from '../utils/sanitizeTracking';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => { success: boolean; message?: string } | void;
  autoCloseOnScan?: boolean;
  currentPayerName?: string;
  totalScannedCount?: number;
  existingBarcodes?: string[] | Set<string>;
}

// Supported barcode formats for both camera stream and snapshot file scanning
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.ITF
];

// Scan window as a fraction of the viewfinder. The on-screen frame uses the same
// numbers so what the user aims at is exactly what the decoder reads.
const SCAN_BOX_W = 0.84;
const SCAN_BOX_H = 0.62;

// A ZXing (software) read must be seen twice within this window before it is
// accepted — filters out the occasional misread on 1D barcodes.
const CONFIRM_WINDOW_MS = 1200;
// While the same duplicate stays in view, keep quiet instead of re-warning.
const DUPLICATE_SILENCE_MS = 1500;
// Minimum gap between two accepted scans in continuous mode.
const MIN_ACCEPT_GAP_MS = 450;

const SCANNER_STYLES = `
@keyframes bsm-sweep { 0% { top: 4%; opacity: .2 } 10% { opacity: 1 } 90% { opacity: 1 } 100% { top: 96%; opacity: .2 } }
@keyframes bsm-pop { 0% { transform: scale(.92); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
.bsm-sweep { animation: bsm-sweep 1.8s ease-in-out infinite alternate; }
.bsm-pop { animation: bsm-pop .16s ease-out; }
#interactive-camera-barcode-scanner { position: absolute !important; inset: 0; width: 100%; height: 100%; }
#interactive-camera-barcode-scanner video { width: 100% !important; height: 100% !important; object-fit: cover; display: block; }
#interactive-camera-barcode-scanner #qr-shaded-region { display: none !important; }
#interactive-camera-barcode-scanner img { display: none !important; }
`;

type RecentScan = { code: string; ok: boolean; time: number };

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  autoCloseOnScan = false,
  currentPayerName = '',
  totalScannedCount,
  existingBarcodes
}) => {
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isFacingEnvironment, setIsFacingEnvironment] = useState(true);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasZoom, setHasZoom] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(3);
  const [isLoading, setIsLoading] = useState(true);
  // iOS can leave the camera video paused until the user taps — show a tap hint
  const [isSlowStart, setIsSlowStart] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isFileScanning, setIsFileScanning] = useState(false);
  const [frameFlash, setFrameFlash] = useState<'success' | 'error' | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);

  // Continuous auto-enter mode
  const [isContinuous, setIsContinuous] = useState(true);
  const [sessionCount, setSessionCount] = useState(0);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    code: string;
    message: string;
  } | null>(null);
  const lastScannedTimeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const lastAcceptedTimeRef = useRef(0);
  const pendingReadRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // Manual code input fallback
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Check if current context is secure (HTTPS or localhost)
  const isSecureContext = typeof window !== 'undefined' && (
    window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );

  const isInAppBrowser = typeof navigator !== 'undefined' && (
    /FBAN|FBAV|Instagram|Line|Telegram|MicroMessenger|WhatsApp|TikTok/i.test(navigator.userAgent || '')
  );

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const containerId = 'interactive-camera-barcode-scanner';

  const isScanningRef = useRef(false);
  const hasHandledSuccessRef = useRef(false);
  const isProcessingScanRef = useRef(false);
  const directLoopRafRef = useRef<number | null>(null);
  const startTokenRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Camera loops are started once and keep their closures, so every value they
  // read that can change while the camera runs must go through a ref.
  const onScanSuccessRef = useRef(onScanSuccess);
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  const isSingleModeRef = useRef(autoCloseOnScan || !isContinuous);
  useEffect(() => {
    isSingleModeRef.current = autoCloseOnScan || !isContinuous;
  }, [autoCloseOnScan, isContinuous]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Keep track of existing barcodes already in the batch
  const existingBarcodesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const set = new Set<string>();
    if (existingBarcodes) {
      existingBarcodes.forEach(b => {
        if (b) set.add(b.toUpperCase().trim());
      });
    }
    existingBarcodesRef.current = set;
  }, [existingBarcodes]);

  // Track all barcodes scanned during this current active camera session
  const sessionScannedSetRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isOpen) {
      sessionScannedSetRef.current = new Set();
    }
  }, [isOpen]);

  // One shared AudioContext — creating one per beep hits the browser's limit
  // after a few dozen scans and the beeps go silent.
  const playTone = (type: OscillatorType, freqs: number[], duration: number, volume: number) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      const step = duration / freqs.length;
      freqs.forEach((f, i) => osc.frequency.setValueAtTime(f, ctx.currentTime + i * step));
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio context might be restricted before interaction
    }
  };

  const playBeep = () => {
    playTone('sine', [1400], 0.16, 0.25);
    try { navigator.vibrate?.(90); } catch {}
  };

  const playWarningBeep = () => {
    playTone('sawtooth', [320, 220], 0.28, 0.28);
    try { navigator.vibrate?.([100, 50, 100]); } catch {}
  };

  const flashFrame = (kind: 'success' | 'error') => {
    setFrameFlash(kind);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFrameFlash(null), 650);
  };

  const pushRecent = (code: string, ok: boolean) => {
    setRecentScans(prev => [{ code, ok, time: Date.now() }, ...prev.filter(r => r.code !== code)].slice(0, 5));
  };

  const showFeedback = (type: 'success' | 'error', code: string, message: string, ms: number) => {
    setFeedback({ type, code, message });
    setTimeout(() => {
      setFeedback(prev => (prev?.code === code ? null : prev));
    }, ms);
  };

  // Safe camera stop
  const stopCameraSafe = async () => {
    isScanningRef.current = false;
    isProcessingScanRef.current = false;
    if (directLoopRafRef.current) {
      cancelAnimationFrame(directLoopRafRef.current);
      directLoopRafRef.current = null;
    }
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        } else {
          killPendingStream(); // start still pending (e.g. iOS waiting for a tap)
        }
        scanner.clear();
      } catch {}
    }
  };

  const closeScanner = () => {
    stopCameraSafe();
    onCloseRef.current();
  };

  const handleSuccess = (text: string) => {
    const cleaned = sanitizeTrackingCode(text);
    if (!cleaned) return;

    // Mutex lock: Prevent concurrent frame execution
    if (isProcessingScanRef.current) return;

    const upperCode = cleaned.toUpperCase();
    const now = Date.now();
    const last = lastScannedTimeRef.current;
    const isSameCode = last.code.toUpperCase() === upperCode;

    // 1. DUPLICATE CHECK: Prevent scanning the same barcode repeatedly into the same batch!
    const isAlreadyInBatch = existingBarcodesRef.current.has(upperCode) || sessionScannedSetRef.current.has(upperCode);
    if (isAlreadyInBatch) {
      // Stay silent while the same parcel is still held in front of the camera
      if (isSameCode && now - last.time < DUPLICATE_SILENCE_MS) {
        last.time = now;
        return;
      }
      lastScannedTimeRef.current = { code: cleaned, time: now };
      playWarningBeep();
      flashFrame('error');
      pushRecent(cleaned, false);
      showFeedback('error', cleaned, 'បានស្កេនរួចហើយ (ស្ទួន)', 2600);
      return;
    }

    // Cooldown protection: throttle reading the exact same barcode
    if (isSameCode && now - last.time < 2000) return;
    // Short gap between two different accepted scans
    if (now - lastAcceptedTimeRef.current < MIN_ACCEPT_GAP_MS) return;

    lastScannedTimeRef.current = { code: cleaned, time: now };
    lastAcceptedTimeRef.current = now;
    isProcessingScanRef.current = true;

    try {
      // Single-scan Mode (if continuous is disabled or autoCloseOnScan is set)
      if (isSingleModeRef.current) {
        if (hasHandledSuccessRef.current) return;
        hasHandledSuccessRef.current = true;
        isScanningRef.current = false;

        if (directLoopRafRef.current) {
          cancelAnimationFrame(directLoopRafRef.current);
          directLoopRafRef.current = null;
        }

        playBeep();
        setLastScanned(cleaned);

        setTimeout(() => {
          stopCameraSafe();
          onScanSuccessRef.current(cleaned);
          onCloseRef.current();
        }, 450);
        return;
      }

      // CONTINUOUS AUTO-ENTER MODE:
      setLastScanned(cleaned);
      const result = onScanSuccessRef.current(cleaned) as { success: boolean; message?: string } | void;
      if (result && result.success === false) {
        playWarningBeep();
        flashFrame('error');
        pushRecent(cleaned, false);
        showFeedback('error', cleaned, result.message || 'លេខកូដស្ទួន ឬមិនត្រឹមត្រូវ!', 2800);
      } else {
        sessionScannedSetRef.current.add(upperCode);
        existingBarcodesRef.current.add(upperCode);
        playBeep();
        flashFrame('success');
        pushRecent(cleaned, true);
        setSessionCount(prev => prev + 1);
        showFeedback('success', cleaned, (result && result.message) ? result.message : 'បានបញ្ចូលជោគជ័យ', 2200);
      }
    } finally {
      // Release mutex lock shortly after callback completes
      setTimeout(() => {
        isProcessingScanRef.current = false;
      }, 200);
    }
  };

  // Reads from the ZXing stream decoder need two matching frames before they count.
  const handleStreamRead = (text: string) => {
    const cleaned = sanitizeTrackingCode(text);
    if (!cleaned) return;
    const now = Date.now();
    const pending = pendingReadRef.current;
    if (pending.code === cleaned && now - pending.time < CONFIRM_WINDOW_MS) {
      pendingReadRef.current = { code: '', time: 0 };
      handleSuccess(cleaned);
    } else {
      pendingReadRef.current = { code: cleaned, time: now };
    }
  };

  // Safe creation of native BarcodeDetector with supported format filtering
  const createBarcodeDetectorSafe = async () => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
    try {
      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      const requested = [
        'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8',
        'qr_code', 'upc_a', 'upc_e', 'itf', 'data_matrix'
      ];
      let finalFormats = requested;
      if (typeof BarcodeDetectorClass.getSupportedFormats === 'function') {
        try {
          const available: string[] = await BarcodeDetectorClass.getSupportedFormats();
          if (Array.isArray(available) && available.length > 0) {
            finalFormats = requested.filter(f => available.includes(f));
          }
        } catch {}
      }
      if (finalFormats.length === 0) return null;
      return new BarcodeDetectorClass({ formats: finalFormats });
    } catch (e) {
      console.warn('createBarcodeDetectorSafe error:', e);
      return null;
    }
  };

  // When a parcel label has several barcodes, take the one nearest the frame centre.
  const pickCentermost = (items: any[], width: number, height: number): string | null => {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const item of items) {
      const value = item?.rawValue?.trim();
      if (!value) continue;
      const box = item.boundingBox;
      const dist = box
        ? Math.hypot(box.x + box.width / 2 - width / 2, box.y + box.height / 2 - height / 2)
        : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = value;
      }
    }
    return best;
  };

  // Start direct BarcodeDetector loop on active video element (full-resolution frames)
  const startDirectDetectorLoop = async (videoElem: HTMLVideoElement) => {
    const detector = await createBarcodeDetectorSafe();
    if (!detector) return;

    let inFlight = false;
    const checkFrame = async () => {
      if (!isScanningRef.current) return;
      if (isSingleModeRef.current && hasHandledSuccessRef.current) return;

      if (videoElem.readyState >= 2 && !inFlight) {
        inFlight = true;
        try {
          const detected = await detector.detect(videoElem);
          if (detected && detected.length > 0) {
            const value = pickCentermost(detected, videoElem.videoWidth, videoElem.videoHeight);
            if (value) handleSuccess(value);
          }
        } catch {
          // Frame skip
        } finally {
          inFlight = false;
        }
      }

      if (isScanningRef.current && !(isSingleModeRef.current && hasHandledSuccessRef.current)) {
        directLoopRafRef.current = requestAnimationFrame(checkFrame);
      }
    };

    directLoopRafRef.current = requestAnimationFrame(checkFrame);
  };

  const getLiveVideo = () =>
    document.getElementById(containerId)?.querySelector('video') as HTMLVideoElement | null;

  // iOS (especially Home Screen apps) may not autoplay the camera stream, so the
  // scanner waits forever for the "playing" event. A play() from a tap unblocks it.
  const kickVideoPlay = () => {
    const v = getLiveVideo();
    if (!v) return;
    v.muted = true;
    v.setAttribute('playsinline', '');
    v.play().catch(() => {});
  };

  // Stop a camera stream that never finished starting (html5-qrcode can't stop it yet)
  const killPendingStream = () => {
    const v = getLiveVideo();
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  };

  // Start Live Camera
  const startCamera = async (explicitDeviceId?: string) => {
    if (!isSecureContext && !navigator?.mediaDevices?.getUserMedia) {
      setIsLoading(false);
      setErrorMsg('INSECURE_HTTP_CONTEXT');
      return;
    }

    const token = ++startTokenRef.current;
    setIsLoading(true);
    setErrorMsg(null);
    setHasTorch(false);
    setIsTorchOn(false);
    setHasZoom(false);
    setCurrentZoom(1);
    hasHandledSuccessRef.current = false;
    pendingReadRef.current = { code: '', time: 0 };

    await stopCameraSafe();
    if (token !== startTokenRef.current) return;

    const html5Qr = new Html5Qrcode(containerId, {
      formatsToSupport: SUPPORTED_FORMATS,
      verbose: false,
      useBarCodeDetectorIfSupported: true,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    });
    scannerRef.current = html5Qr;

    try {
      const deviceId = explicitDeviceId || selectedCameraId;
      const facingMode = isFacingEnvironment ? 'environment' : 'user';
      const hasNative = typeof window !== 'undefined' && 'BarcodeDetector' in window;

      // Ask for a high-resolution stream — small 1D barcodes need the pixels.
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facingMode } })
      };

      const config: any = {
        fps: hasNative ? 15 : 25,
        disableFlip: true,
        videoConstraints,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
          width: Math.max(80, Math.floor(viewfinderWidth * SCAN_BOX_W)),
          height: Math.max(80, Math.floor(viewfinderHeight * SCAN_BOX_H))
        })
      };

      isScanningRef.current = true;

      // Robust startup: high-res constraints first, then plain facingMode, then any camera
      const runStart = async () => {
        try {
          await html5Qr.start(deviceId || { facingMode }, config, handleStreamRead, () => {});
        } catch (firstTryErr) {
          console.warn('Primary camera start failed, attempting facingMode fallback:', firstTryErr);
          const { videoConstraints: _omit, ...plainConfig } = config;
          try {
            await html5Qr.start({ facingMode }, plainConfig, handleStreamRead, () => {});
          } catch (secondTryErr) {
            console.warn('Second camera attempt failed, trying any camera:', secondTryErr);
            await html5Qr.start({ facingMode: 'user' }, plainConfig, handleStreamRead, () => {});
          }
        }
      };

      // After 2.5s still loading: retry play() and ask the user to tap (iOS autoplay block).
      // After 25s: give up so the user gets the retry / photo buttons instead of a spinner.
      setIsSlowStart(false);
      const slowTimer = setTimeout(() => {
        if (token !== startTokenRef.current) return;
        kickVideoPlay();
        setIsSlowStart(true);
      }, 2500);
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          runStart(),
          new Promise<never>((_, reject) => {
            timeoutTimer = setTimeout(() => reject(new Error('CAMERA_START_TIMEOUT')), 25000);
          })
        ]);
      } catch (startErr: any) {
        if (startErr?.message === 'CAMERA_START_TIMEOUT' && scannerRef.current === html5Qr) {
          scannerRef.current = null; // late resolve of the hung start will clean itself up
          killPendingStream();
          throw new Error('កាមេរ៉ាមិនព្រមបើក។ សូមចុច «បើក Live Camera» ម្តងទៀត ឬប្រើ «ថតស្កេន»។');
        }
        throw startErr;
      } finally {
        clearTimeout(slowTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (token === startTokenRef.current) setIsSlowStart(false);
      }

      // A newer start (camera switch / close) superseded this one while it was opening
      if (token !== startTokenRef.current || scannerRef.current !== html5Qr) {
        try {
          if (html5Qr.isScanning) await html5Qr.stop();
          html5Qr.clear();
        } catch {}
        return;
      }

      setIsLoading(false);

      // Capabilities: torch, zoom, continuous autofocus
      try {
        const capabilities: any = html5Qr.getRunningTrackCapabilities();
        if (capabilities) {
          if (capabilities.torch) setHasTorch(true);
          if (capabilities.zoom) {
            setHasZoom(true);
            setMaxZoom(capabilities.zoom.max || 3);
          }
          if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
            await html5Qr.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
          }
        }
      } catch {}

      // Native BarcodeDetector on the full video frame for fast, accurate detection
      const video = document.getElementById(containerId)?.querySelector('video');
      if (video) startDirectDetectorLoop(video);

      // Re-populate camera list once permission is granted (to show friendly labels)
      try {
        const devs = await Html5Qrcode.getCameras();
        if (Array.isArray(devs) && devs.length > 0) {
          setCameras(devs.map(d => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 5)}` })));
        }
      } catch {}
    } catch (err: any) {
      if (token !== startTokenRef.current) return;
      console.error('Camera start failed:', err);
      setIsLoading(false);
      isScanningRef.current = false;
      if (!isSecureContext) {
        setErrorMsg('INSECURE_HTTP_CONTEXT');
      } else {
        const msg = String(err?.message || err || '');
        const name = String(err?.name || '');
        const isPermissionDenied =
          name === 'NotAllowedError' ||
          name === 'PermissionDeniedError' ||
          /permission|denied|allowed|blocked/i.test(msg);

        if (isPermissionDenied) {
          setErrorMsg('PERMISSION_DENIED');
        } else {
          setErrorMsg(
            msg && !msg.includes('Error')
              ? msg
              : 'មិនអាចបើក Live Camera បានឡើយ។ សូមប្រើការថតរូបស្កេនតាមកាមេរ៉ាទូរស័ព្ទខាងក្រោម។'
          );
        }
      }
    }
  };

  // Switch facing mode (Front / Back)
  const toggleFacingMode = () => {
    setIsFacingEnvironment(prev => !prev);
    setSelectedCameraId('');
  };

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any]
      });
      setIsTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  // Cycle zoom 1x → 2x → 3x → 1x (limited by the camera's max)
  const cycleZoom = async () => {
    if (!scannerRef.current || !hasZoom) return;
    try {
      const steps = [1, 2, 3].filter(z => z <= Math.max(1, maxZoom));
      const idx = steps.indexOf(currentZoom);
      const nextZoom = steps[(idx + 1) % steps.length] ?? 1;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ zoom: nextZoom } as any]
      });
      setCurrentZoom(nextZoom);
    } catch (e) {
      console.warn('Zoom toggle failed:', e);
    }
  };

  // Convert HTML Image to scaled base canvas
  const imageToCanvas = (img: HTMLImageElement, maxDim = 1600): HTMLCanvasElement => {
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
    }
    return canvas;
  };

  // Enhance contrast & binarization for barcode detection
  const enhanceCanvasContrast = (sourceCanvas: HTMLCanvasElement, contrastMultiplier = 1.7, brightnessOffset = 10): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return sourceCanvas;

    ctx.drawImage(sourceCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    // Luminance & high-contrast stretching
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let adjusted = ((gray / 255 - 0.5) * contrastMultiplier + 0.5) * 255 + brightnessOffset;
      adjusted = Math.min(255, Math.max(0, adjusted));
      d[i] = adjusted;
      d[i + 1] = adjusted;
      d[i + 2] = adjusted;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  };

  // Rotate canvas by specified degrees (90, 180, 270)
  const rotateCanvas = (sourceCanvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return sourceCanvas;

    if (degrees === 90 || degrees === 270) {
      canvas.width = sourceCanvas.height;
      canvas.height = sourceCanvas.width;
    } else {
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
    }

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
    return canvas;
  };

  // Convert canvas to File object
  const canvasToFile = (canvas: HTMLCanvasElement, filename: string): Promise<File> => {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], filename, { type: 'image/jpeg' }));
        } else {
          resolve(new File([], filename));
        }
      }, 'image/jpeg', 0.95);
    });
  };

  // Multi-pass file scanner: tries Direct File -> Native BarcodeDetector -> Normal -> High Contrast -> Rotated 90° -> Rotated 270°
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setIsFileScanning(true);
    setErrorMsg(prev => (prev === 'INSECURE_HTTP_CONTEXT' || prev === 'PERMISSION_DENIED' ? prev : null));

    const fail = (msg: string) => {
      playWarningBeep();
      if (isScanningRef.current) {
        // Live camera is running — show as a toast instead of covering the viewfinder
        showFeedback('error', `file-${Date.now()}`, msg, 3500);
      } else {
        setErrorMsg(prev => (prev === 'INSECURE_HTTP_CONTEXT' || prev === 'PERMISSION_DENIED' ? prev : msg));
      }
    };

    try {
      // 1. Direct fast scan with Html5Qrcode on raw file
      try {
        const directScanner = new Html5Qrcode('file-scanner-hidden', {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          }
        });
        const directRes = await directScanner.scanFileV2(rawFile, false);
        if (directRes?.decodedText?.trim()) {
          directScanner.clear();
          handleSuccess(directRes.decodedText.trim());
          return;
        }
        directScanner.clear();
      } catch {}

      // Load rawFile into an Image element
      const img = new Image();
      const url = URL.createObjectURL(rawFile);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = url;
      });
      URL.revokeObjectURL(url);

      // 2. Hardware BarcodeDetector directly on Image element
      const detector = await createBarcodeDetectorSafe();
      if (detector) {
        try {
          const detectedImg = await detector.detect(img);
          const value = detectedImg?.length ? pickCentermost(detectedImg, img.width, img.height) : null;
          if (value) {
            handleSuccess(value);
            return;
          }
        } catch (e) {
          console.warn('Native BarcodeDetector on raw image skipped:', e);
        }
      }

      const baseCanvas = imageToCanvas(img, 1600);

      // 3. Native Hardware BarcodeDetector on base canvas & rotated canvas
      if (detector) {
        try {
          for (const c of [baseCanvas, rotateCanvas(baseCanvas, 90)]) {
            const detected = await detector.detect(c);
            const value = detected?.length ? pickCentermost(detected, c.width, c.height) : null;
            if (value) {
              handleSuccess(value);
              return;
            }
          }
        } catch (e) {
          console.warn('Native BarcodeDetector file attempt skipped:', e);
        }
      }

      // 4. Multi-pass decode with Html5Qrcode (ZXing)
      const tempScanner = new Html5Qrcode('file-scanner-hidden', {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });

      const passes: Array<[string, () => HTMLCanvasElement]> = [
        // Normal scaled image
        ['scan_base.jpg', () => baseCanvas],
        // High-contrast grayscale (dim, shadowed, or low-contrast receipt prints)
        ['scan_contrast.jpg', () => enhanceCanvasContrast(baseCanvas, 1.8, 8)],
        // 90° / 270° rotation with high contrast (vertically oriented barcodes)
        ['scan_rot90.jpg', () => enhanceCanvasContrast(rotateCanvas(baseCanvas, 90), 1.8, 8)],
        ['scan_rot270.jpg', () => enhanceCanvasContrast(rotateCanvas(baseCanvas, 270), 1.8, 8)]
      ];

      for (const [name, build] of passes) {
        try {
          const file = await canvasToFile(build(), name);
          const res = await tempScanner.scanFileV2(file, false);
          if (res?.decodedText?.trim()) {
            tempScanner.clear();
            handleSuccess(res.decodedText.trim());
            return;
          }
        } catch {}
      }

      tempScanner.clear();
      fail('ពុំអាចរកឃើញ Barcode ឬ QR Code ក្នុងរូបភាពនេះឡើយ។ សូមថតម្តងទៀតឱ្យជិត និងច្បាស់ល្អ!');
    } catch {
      fail('ពុំអាច Scan រូបភាពនេះបានទេ។ សូមថតឱ្យច្បាស់ ឬពិនិត្យពន្លឺជុំវិញ Barcode!');
    } finally {
      setIsFileScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    // Manual entry is an intentional action — don't let the camera cooldowns swallow it
    lastAcceptedTimeRef.current = 0;
    lastScannedTimeRef.current = { code: '', time: 0 };
    handleSuccess(manualCode.trim());
    setManualCode('');
  };

  useEffect(() => {
    if (isOpen) {
      setLastScanned(null);
      setErrorMsg(null);
      setShowManualInput(false);
      setManualCode('');
      setSessionCount(0);
      setFeedback(null);
      setRecentScans([]);
      lastScannedTimeRef.current = { code: '', time: 0 };
      lastAcceptedTimeRef.current = 0;
      hasHandledSuccessRef.current = false;

      // If secure context, launch live camera
      if (isSecureContext) {
        const t = setTimeout(() => {
          startCamera(selectedCameraId || undefined);
        }, 120);
        return () => {
          clearTimeout(t);
          startTokenRef.current++;
          stopCameraSafe();
        };
      } else {
        setIsLoading(false);
        setErrorMsg('INSECURE_HTTP_CONTEXT');
      }
    } else {
      stopCameraSafe();
    }
  }, [isOpen, isFacingEnvironment, selectedCameraId]);

  // Esc closes, and the page behind must not scroll while scanning
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeScanner();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Release audio + timers on unmount
  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  if (!isOpen) return null;

  const isLive = !isLoading && !errorMsg;
  const isSingleMode = autoCloseOnScan || !isContinuous;
  const cornerColor =
    frameFlash === 'success' ? 'border-emerald-400' :
    frameFlash === 'error' ? 'border-rose-500' :
    'border-white';

  const actionBtn =
    'flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95';
  const actionIdle = 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:bg-slate-800 hover:text-white';
  const glassBtn =
    'w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition cursor-pointer active:scale-90';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeScanner();
      }}
    >
      <style>{SCANNER_STYLES}</style>

      <div className="bg-slate-900 border border-slate-800 sm:rounded-3xl rounded-t-3xl w-full sm:max-w-md max-h-dvh overflow-y-auto shadow-2xl flex flex-col text-white">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/30">
              <ScanLine className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight">ស្កេន Barcode & QR</div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {currentPayerName ? (
                  <span className="text-blue-300">👤 <b>{currentPayerName}</b></span>
                ) : isSingleMode ? (
                  'ស្កេនម្តងមួយ — បិទស្វ័យប្រវត្តិពេលស្កេនជាប់'
                ) : (
                  'ស្កេនបន្តបន្ទាប់ — បញ្ចូលស្វ័យប្រវត្តិ (Auto-Enter)'
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={closeScanner}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
            title="បិទ (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode switch */}
        {!autoCloseOnScan && (
          <div className="px-4 pb-3">
            <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setIsContinuous(true)}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition cursor-pointer ${
                  isContinuous ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${isContinuous ? 'fill-white' : ''}`} />
                ស្កេនបន្ត
              </button>
              <button
                type="button"
                onClick={() => setIsContinuous(false)}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition cursor-pointer ${
                  !isContinuous ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                ម្តងមួយ
              </button>
            </div>
          </div>
        )}

        {/* Hidden inputs for native mobile camera & gallery */}
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileScan}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileScan}
          className="hidden"
        />
        <div id="file-scanner-hidden" className="hidden" />

        {/* Viewfinder */}
        <div className="px-4">
          <div className="relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden ring-1 ring-white/10">

            {/* HTML5 QR Code Mount Node (For Live Stream) */}
            <div id={containerId} />

            {/* Scan frame — same size as the decoder's scan box */}
            {isLive && (
              <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                <div
                  className="relative rounded-2xl shadow-[0_0_0_9999px_rgba(2,6,23,0.55)]"
                  style={{ width: `${SCAN_BOX_W * 100}%`, height: `${SCAN_BOX_H * 100}%` }}
                >
                  <div className={`absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 rounded-tl-2xl transition-colors duration-150 ${cornerColor}`} />
                  <div className={`absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 rounded-tr-2xl transition-colors duration-150 ${cornerColor}`} />
                  <div className={`absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 rounded-bl-2xl transition-colors duration-150 ${cornerColor}`} />
                  <div className={`absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 rounded-br-2xl transition-colors duration-150 ${cornerColor}`} />

                  {frameFlash && (
                    <div className={`absolute inset-0 rounded-2xl ${frameFlash === 'success' ? 'bg-emerald-400/15' : 'bg-rose-500/15'}`} />
                  )}

                  {/* Sweeping laser */}
                  <div className="bsm-sweep absolute left-3 right-3 h-0.5 rounded-full bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_12px_2px_rgba(244,63,94,0.7)]" />
                </div>
              </div>
            )}

            {/* Top chips */}
            {isLive && (
              <div className="absolute top-2.5 inset-x-2.5 z-20 flex items-start justify-between pointer-events-none">
                <div className="px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-[10px] font-semibold flex items-center gap-1.5">
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                    <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
                  </span>
                  LIVE · {isFacingEnvironment ? 'កាមេរ៉ាក្រោយ' : 'កាមេរ៉ាមុខ'}
                </div>
                {!isSingleMode && (
                  <div className="px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="font-mono text-emerald-300">{sessionCount}</span>
                  </div>
                )}
              </div>
            )}

            {/* Floating torch / zoom */}
            {isLive && (hasTorch || hasZoom) && (
              <div className="absolute right-2.5 bottom-2.5 z-20 flex flex-col gap-2">
                {hasZoom && (
                  <button
                    type="button"
                    onClick={cycleZoom}
                    className={`${glassBtn} text-[11px] font-bold font-mono ${
                      currentZoom > 1 ? 'bg-white text-slate-900 border-white' : 'bg-black/50 text-white border-white/20'
                    }`}
                    title="ពង្រីកកាមេរ៉ា"
                  >
                    {currentZoom}x
                  </button>
                )}
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`${glassBtn} ${
                      isTorchOn ? 'bg-amber-400 text-slate-900 border-amber-300' : 'bg-black/50 text-white border-white/20'
                    }`}
                    title={isTorchOn ? 'បិទពិល' : 'បើកពិល'}
                  >
                    {isTorchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
                  </button>
                )}
              </div>
            )}

            {/* Aiming hint / feedback toast */}
            {isLive && (
              <div className="absolute bottom-2.5 inset-x-14 z-20 flex justify-center pointer-events-none">
                {feedback ? (
                  <div
                    key={feedback.code + feedback.type}
                    className={`bsm-pop max-w-full px-3 py-1.5 rounded-xl backdrop-blur-md shadow-xl flex items-center gap-2 border ${
                      feedback.type === 'success'
                        ? 'bg-emerald-600/90 border-emerald-300/40'
                        : 'bg-rose-600/90 border-rose-300/40'
                    }`}
                  >
                    {feedback.type === 'success'
                      ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                      : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <div className="min-w-0 leading-tight">
                      {!feedback.code.startsWith('file-') && (
                        <div className="font-mono font-bold text-xs truncate">{feedback.code}</div>
                      )}
                      <div className="text-[10.5px] font-medium opacity-95 line-clamp-2">{feedback.message}</div>
                    </div>
                  </div>
                ) : (
                  <div className="px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-[10px] text-white/90 truncate">
                    ដាក់ Barcode ឬ QR ឱ្យនៅក្នុងស៊ុម
                  </div>
                )}
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && !errorMsg && (
              <div
                onClick={kickVideoPlay}
                className="absolute inset-0 z-20 bg-slate-950 flex flex-col items-center justify-center gap-3 text-xs text-slate-400 cursor-pointer"
              >
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-2 border-slate-800" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
                  <Camera className="absolute inset-0 m-auto w-5 h-5 text-blue-400" />
                </div>
                <span>កំពុងបើកកាមេរ៉ា...</span>
                {isSlowStart && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); kickVideoPlay(); }}
                    className="mt-1 py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>ចុចទីនេះ ដើម្បីបើកកាមេរ៉ា</span>
                  </button>
                )}
              </div>
            )}

            {/* Insecure HTTP Mobile View (192.168.x.x on HTTP) */}
            {errorMsg === 'INSECURE_HTTP_CONTEXT' && (
              <div className="absolute inset-0 z-20 bg-gradient-to-b from-slate-950 to-slate-900 p-5 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center border border-blue-500/30">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">បើកកាមេរ៉ាស្កេនលើទូរស័ព្ទ</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                    ចុចប៊ូតុងខាងក្រោម ដើម្បីថតរូប Barcode ឬ QR Code
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  disabled={isFileScanning}
                  className="w-full max-w-xs py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition active:scale-95 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isFileScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  <span>{isFileScanning ? 'កំពុងស្កេនរូបភាព...' : 'ថតស្កេនភ្លាមៗ'}</span>
                </button>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>ដំណើរការលើ Android & iPhone</span>
                </div>
              </div>
            )}

            {/* Permission Denied on Mobile/Desktop */}
            {errorMsg === 'PERMISSION_DENIED' && (
              <div className="absolute inset-0 z-20 bg-slate-950 p-4 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">មិនទាន់បានអនុញ្ញាត Camera</h4>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-relaxed">
                    {isInAppBrowser ? (
                      <span>
                        កម្មវិធី (Telegram/Facebook) កំពុងរារាំងកាមេរ៉ា។ សូមចុច <b>⋮</b> ជ្រើសរើស <b>Open in Chrome / Safari</b>។
                      </span>
                    ) : (
                      <span>
                        ចុចលើ <b>🔒</b> នៅរបារ URL រួចជ្រើសរើស <b>Camera → Allow</b>។
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    disabled={isFileScanning}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>ថតស្កេន</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startCamera(selectedCameraId || undefined)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>ព្យាយាមម្តងទៀត</span>
                  </button>
                </div>
              </div>
            )}

            {/* Other Errors */}
            {errorMsg && errorMsg !== 'INSECURE_HTTP_CONTEXT' && errorMsg !== 'PERMISSION_DENIED' && (
              <div className="absolute inset-0 z-20 bg-slate-950 p-4 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center border border-rose-500/30">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <p className="text-xs text-rose-200 max-w-xs leading-relaxed">{errorMsg}</p>
                {isInAppBrowser && (
                  <p className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg max-w-xs">
                    💡 ចុច <b>⋮</b> ជ្រើសរើស <b>«Open in Chrome»</b>
                  </p>
                )}
                <div className="flex items-center justify-center gap-2 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    disabled={isFileScanning}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>ថតស្កេន</span>
                  </button>
                  {isSecureContext && (
                    <button
                      type="button"
                      onClick={() => startCamera(selectedCameraId || undefined)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>បើក Live Camera</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Analysing a photo */}
            {isFileScanning && errorMsg !== 'INSECURE_HTTP_CONTEXT' && (
              <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
                <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                <span>កំពុងវិភាគរូបភាព...</span>
              </div>
            )}

            {/* Success Visual Banner for Single-scan mode */}
            {isSingleMode && lastScanned && (
              <div className="bsm-pop absolute inset-0 z-30 bg-emerald-950/95 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="text-xs text-emerald-300 font-semibold mt-1">ស្កេនជោគជ័យ!</div>
                <div className="font-mono font-bold text-base px-3 py-1 rounded-lg bg-emerald-900/60 border border-emerald-700/50 max-w-full truncate">
                  {lastScanned}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action grid */}
        <div className="px-4 pt-3 grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => nativeCameraInputRef.current?.click()}
            disabled={isFileScanning}
            className={`${actionBtn} ${actionIdle}`}
            title="ថតរូបដោយកាមេរ៉ាទូរស័ព្ទ ហើយស្កេន"
          >
            <Camera className="w-4 h-4 text-blue-400" />
            <span>ថតរូប</span>
          </button>
          <button
            type="button"
            onClick={toggleFacingMode}
            disabled={!isSecureContext || isLoading}
            className={`${actionBtn} ${actionIdle}`}
            title="ប្តូរកាមេរ៉ា មុខ / ក្រោយ"
          >
            <SwitchCamera className="w-4 h-4 text-violet-400" />
            <span>ប្តូរកាមេរ៉ា</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isFileScanning}
            className={`${actionBtn} ${actionIdle}`}
            title="ស្កេនពីរូបភាពក្នុង Gallery"
          >
            <ImageUp className="w-4 h-4 text-emerald-400" />
            <span>Gallery</span>
          </button>
          <button
            type="button"
            onClick={() => setShowManualInput(prev => !prev)}
            className={`${actionBtn} ${
              showManualInput ? 'bg-blue-600/20 border-blue-500/60 text-blue-200' : actionIdle
            }`}
            title="វាយលេខកូដដោយដៃ"
          >
            <Keyboard className="w-4 h-4 text-amber-400" />
            <span>វាយដៃ</span>
          </button>
        </div>

        {/* Collapsible Manual Input Fallback */}
        {showManualInput && (
          <form onSubmit={handleManualSubmit} className="px-4 pt-2.5 flex items-center gap-2 animate-in slide-in-from-top-2 duration-150">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="វាយលេខកូដ (ឧ. E12812205549)..."
              className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-slate-950/70 border border-slate-700 text-sm font-mono uppercase text-white placeholder:normal-case placeholder:font-sans placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              autoFocus
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>បញ្ចូល</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Multiple camera dropdown if available on secure context */}
        {isSecureContext && cameras.length > 1 && (
          <div className="px-4 pt-2.5">
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="w-full h-9 px-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-300 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">📷 កាមេរ៉ាស្វ័យប្រវត្តិ ({isFacingEnvironment ? 'ក្រោយ' : 'មុខ'})</option>
              {cameras.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Recent scans (continuous mode) */}
        {!isSingleMode && recentScans.length > 0 && (
          <div className="px-4 pt-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 flex items-center gap-1">
              <Repeat className="w-3 h-3" /> ទើបស្កេន
            </div>
            <ul className="rounded-xl border border-slate-800 divide-y divide-slate-800 overflow-hidden">
              {recentScans.map((r, i) => (
                <li
                  key={r.code + r.time}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs ${i === 0 ? 'bsm-pop bg-slate-800/50' : 'bg-slate-950/40'}`}
                >
                  {r.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    : <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  <span className={`font-mono font-semibold truncate flex-1 ${r.ok ? 'text-slate-100' : 'text-rose-300 line-through decoration-rose-400/50'}`}>
                    {r.code}
                  </span>
                  <span className="text-[10px] text-slate-500 shrink-0">
                    {r.ok ? 'បានបញ្ចូល' : 'ស្ទួន'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 px-4 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {isSingleMode ? (
            <p className="text-[10.5px] text-slate-500 leading-snug">
              💡 កាន់ចម្ងាយ ១៥-២០ស.ម។ ពន្លឺខ្សោយ? បើក <b className="text-slate-400">ពិល</b> ឬ <b className="text-slate-400">2x</b>
            </p>
          ) : (
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500">ស្កេនក្នុងវគ្គនេះ</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-emerald-400 leading-none">{sessionCount}</span>
                <span className="text-xs text-slate-400">កញ្ចប់</span>
                {typeof totalScannedCount === 'number' && (
                  <span className="text-[10px] text-slate-500 ml-1">· Batch {totalScannedCount}</span>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={closeScanner}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/25 transition active:scale-95 cursor-pointer shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSingleMode ? 'បិទ' : 'រួចរាល់'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
