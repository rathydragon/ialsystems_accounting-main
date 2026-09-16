import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  X, 
  SwitchCamera, 
  Flashlight, 
  Upload, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle2, 
  Scan, 
  Sparkles,
  Info,
  ZoomIn,
  Keyboard,
  ArrowRight,
  Zap
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

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  autoCloseOnScan = false,
  currentPayerName = '',
  totalScannedCount
}) => {
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isFacingEnvironment, setIsFacingEnvironment] = useState(true);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasZoom, setHasZoom] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(3);
  const [hasNativeDetector, setHasNativeDetector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isFileScanning, setIsFileScanning] = useState(false);

  // Continuous auto-enter mode
  const [isContinuous, setIsContinuous] = useState(true);
  const [sessionCount, setSessionCount] = useState(0);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    code: string;
    message: string;
  } | null>(null);
  const lastScannedTimeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

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

  // Detect native BarcodeDetector on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      setHasNativeDetector(true);
    }
  }, []);

  // Play a synthesized confirmation beep sound
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // Audio context might be restricted before interaction
    }

    if (navigator.vibrate) {
      try {
        navigator.vibrate(120);
      } catch {}
    }
  };

  // Safe camera stop
  const stopCameraSafe = async () => {
    isScanningRef.current = false;
    isProcessingScanRef.current = false;
    if (directLoopRafRef.current) {
      cancelAnimationFrame(directLoopRafRef.current);
      directLoopRafRef.current = null;
    }
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
  };

  const handleSuccess = (text: string) => {
    const cleaned = sanitizeTrackingCode(text);
    if (!cleaned) return;

    // Mutex lock: Prevent concurrent frame execution
    if (isProcessingScanRef.current) return;

    // Cooldown protection: throttle reading the exact same barcode within 2.2 seconds
    const now = Date.now();
    const isSameCode = lastScannedTimeRef.current.code.toLowerCase() === cleaned.toLowerCase();
    if (isSameCode && now - lastScannedTimeRef.current.time < 2200) {
      return;
    }
    // Also enforce a global 600ms debounce between ANY two consecutive scans in continuous mode
    if (now - lastScannedTimeRef.current.time < 600) {
      return;
    }

    lastScannedTimeRef.current = { code: cleaned, time: now };
    isProcessingScanRef.current = true;

    try {
      // Single-scan Mode (if continuous is disabled or autoCloseOnScan is set)
      if (autoCloseOnScan || !isContinuous) {
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
          onScanSuccess(cleaned);
          onClose();
        }, 450);
        return;
      }

      // CONTINUOUS AUTO-ENTER MODE:
      setLastScanned(cleaned);
      const result = onScanSuccess(cleaned) as { success: boolean; message?: string } | void;
      if (result && result.success === false) {
        setFeedback({
          type: 'error',
          code: cleaned,
          message: result.message || 'លេខកូដស្ទួន ឬមិនត្រឹមត្រូវ!'
        });
      } else {
        playBeep();
        setSessionCount(prev => prev + 1);
        setFeedback({
          type: 'success',
          code: cleaned,
          message: (result && result.message) ? result.message : `✅ បានបញ្ចូល #${cleaned}`
        });
      }

      setTimeout(() => {
        setFeedback(prev => (prev?.code === cleaned ? null : prev));
      }, 2800);
    } finally {
      // Release mutex lock shortly after callback completes
      setTimeout(() => {
        isProcessingScanRef.current = false;
      }, 200);
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
      return new BarcodeDetectorClass({ formats: finalFormats });
    } catch (e) {
      console.warn('createBarcodeDetectorSafe error:', e);
      return null;
    }
  };

  // Start direct BarcodeDetector loop on active video element
  const startDirectDetectorLoop = async (videoElem: HTMLVideoElement) => {
    const detector = await createBarcodeDetectorSafe();
    if (!detector) return;

    try {
      let inFlight = false;
      const checkFrame = async () => {
        if (!isScanningRef.current) return;
        if ((autoCloseOnScan || !isContinuous) && hasHandledSuccessRef.current) return;

        if (videoElem.readyState >= 2 && !inFlight) {
          inFlight = true;
          try {
            const detected = await detector.detect(videoElem);
            if (detected && detected.length > 0) {
              const item = detected[0];
              if (item?.rawValue && item.rawValue.trim()) {
                handleSuccess(item.rawValue.trim());
              }
            }
          } catch {
            // Frame skip
          } finally {
            inFlight = false;
          }
        }

        if (isScanningRef.current && !((autoCloseOnScan || !isContinuous) && hasHandledSuccessRef.current)) {
          directLoopRafRef.current = requestAnimationFrame(checkFrame);
        }
      };

      directLoopRafRef.current = requestAnimationFrame(checkFrame);
    } catch (e) {
      console.warn('Could not start direct BarcodeDetector loop:', e);
    }
  };

  // Start Live Camera
  const startCamera = async (explicitDeviceId?: string) => {
    if (!isSecureContext && !navigator?.mediaDevices?.getUserMedia) {
      setIsLoading(false);
      setErrorMsg('INSECURE_HTTP_CONTEXT');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setHasTorch(false);
    setIsTorchOn(false);
    setHasZoom(false);
    setCurrentZoom(1);
    hasHandledSuccessRef.current = false;

    await stopCameraSafe();

    try {
      const html5Qr = new Html5Qrcode(containerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      scannerRef.current = html5Qr;

      // 1. Fetch available cameras for dropdown selection (if already permitted)
      try {
        const devs = await Html5Qrcode.getCameras();
        if (Array.isArray(devs) && devs.length > 0) {
          setCameras(devs.map(d => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 5)}` })));
        }
      } catch (camListErr) {
        console.warn('Could not enumerate cameras prior to permission:', camListErr);
      }

      // If user specifically selected a camera ID from the dropdown, use it;
      // Otherwise, ALWAYS use standard { facingMode: 'environment' } or 'user'
      // so the browser OS automatically binds the correct primary camera.
      const cameraParam: any = (explicitDeviceId || selectedCameraId)
        ? (explicitDeviceId || selectedCameraId)
        : { facingMode: isFacingEnvironment ? 'environment' : 'user' };

      // Wide scanning area bounded strictly within viewfinder dimensions to prevent qrbox overflow
      const config: any = {
        fps: 25,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const margin = 16;
          const maxW = Math.max(80, viewfinderWidth - margin);
          const maxH = Math.max(80, viewfinderHeight - margin);
          const idealW = Math.floor(viewfinderWidth * 0.88);
          const idealH = Math.floor(viewfinderHeight * 0.70);
          return {
            width: Math.min(idealW, maxW),
            height: Math.min(idealH, maxH)
          };
        }
      };

      isScanningRef.current = true;

      // Robust startup: Attempt primary camera, then fallback gracefully if device rejects strict constraints
      try {
        await html5Qr.start(
          cameraParam,
          config,
          (decodedText) => {
            handleSuccess(decodedText);
          },
          () => {}
        );
      } catch (firstTryErr) {
        console.warn('Primary camera start failed, attempting facingMode fallback:', firstTryErr);
        try {
          await html5Qr.start(
            { facingMode: isFacingEnvironment ? 'environment' : 'user' },
            { fps: 20 },
            (decodedText) => {
              handleSuccess(decodedText);
            },
            () => {}
          );
        } catch (secondTryErr) {
          console.warn('Second camera attempt failed, trying fallback to front/any camera:', secondTryErr);
          await html5Qr.start(
            { facingMode: 'user' },
            { fps: 15 },
            (decodedText) => {
              handleSuccess(decodedText);
            },
            () => {}
          );
        }
      }

      setIsLoading(false);

      // Check capabilities (Torch & Zoom)
      try {
        const capabilities: any = html5Qr.getRunningTrackCapabilities();
        if (capabilities) {
          if (capabilities.torch) {
            setHasTorch(true);
          }
          if (capabilities.zoom) {
            setHasZoom(true);
            setMaxZoom(capabilities.zoom.max || 3);
          }
        }
      } catch {}

      // Start direct Native BarcodeDetector loop on active video element for instant sub-50ms detection
      try {
        const container = document.getElementById(containerId);
        const video = container?.querySelector('video');
        if (video) {
          startDirectDetectorLoop(video);
        }
      } catch {}

      // Re-populate camera list once permission is granted (to show friendly labels)
      try {
        const devs = await Html5Qrcode.getCameras();
        if (Array.isArray(devs) && devs.length > 0) {
          setCameras(devs.map(d => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 5)}` })));
        }
      } catch {}
    } catch (err: any) {
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
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setIsTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  // Toggle Zoom (1x / 2x)
  const toggleZoom = async () => {
    if (!scannerRef.current || !hasZoom) return;
    try {
      const nextZoom = currentZoom >= 2 ? 1 : Math.min(2, maxZoom);
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{ zoom: nextZoom }]
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
    setErrorMsg(null);

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

      // 2. Hardware Turbo BarcodeDetector directly on Image element
      const detector = await createBarcodeDetectorSafe();
      if (detector) {
        try {
          const detectedImg = await detector.detect(img);
          if (detectedImg && detectedImg.length > 0 && detectedImg[0]?.rawValue?.trim()) {
            handleSuccess(detectedImg[0].rawValue.trim());
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
          // Test 0° orientation
          const detected0 = await detector.detect(baseCanvas);
          if (detected0 && detected0.length > 0 && detected0[0]?.rawValue?.trim()) {
            handleSuccess(detected0[0].rawValue.trim());
            return;
          }

          // Test 90° orientation (mobile vertical capture)
          const rotated90Canvas = rotateCanvas(baseCanvas, 90);
          const detected90 = await detector.detect(rotated90Canvas);
          if (detected90 && detected90.length > 0 && detected90[0]?.rawValue?.trim()) {
            handleSuccess(detected90[0].rawValue.trim());
            return;
          }
        } catch (e) {
          console.warn('Native BarcodeDetector file attempt skipped:', e);
        }
      }

      // 2. Multi-pass decode with Html5Qrcode (ZXing)
      const tempScanner = new Html5Qrcode('file-scanner-hidden', {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });

      // Pass A: Normal scaled image
      try {
        const fileA = await canvasToFile(baseCanvas, 'scan_base.jpg');
        const resA = await tempScanner.scanFileV2(fileA, false);
        if (resA?.decodedText?.trim()) {
          tempScanner.clear();
          handleSuccess(resA.decodedText.trim());
          return;
        }
      } catch {}

      // Pass B: High-contrast grayscale (fixes dim, shadowed, or low-contrast receipt/paper prints)
      try {
        const contrastCanvas = enhanceCanvasContrast(baseCanvas, 1.8, 8);
        const fileB = await canvasToFile(contrastCanvas, 'scan_contrast.jpg');
        const resB = await tempScanner.scanFileV2(fileB, false);
        if (resB?.decodedText?.trim()) {
          tempScanner.clear();
          handleSuccess(resB.decodedText.trim());
          return;
        }
      } catch {}

      // Pass C: 90° Rotation with high contrast (fixes vertically oriented barcodes)
      try {
        const rotCanvas = rotateCanvas(baseCanvas, 90);
        const rotContrast = enhanceCanvasContrast(rotCanvas, 1.8, 8);
        const fileC = await canvasToFile(rotContrast, 'scan_rot90.jpg');
        const resC = await tempScanner.scanFileV2(fileC, false);
        if (resC?.decodedText?.trim()) {
          tempScanner.clear();
          handleSuccess(resC.decodedText.trim());
          return;
        }
      } catch {}

      // Pass D: 270° Rotation with high contrast
      try {
        const rot270Canvas = rotateCanvas(baseCanvas, 270);
        const rot270Contrast = enhanceCanvasContrast(rot270Canvas, 1.8, 8);
        const fileD = await canvasToFile(rot270Contrast, 'scan_rot270.jpg');
        const resD = await tempScanner.scanFileV2(fileD, false);
        if (resD?.decodedText?.trim()) {
          tempScanner.clear();
          handleSuccess(resD.decodedText.trim());
          return;
        }
      } catch {}

      tempScanner.clear();
      setErrorMsg('ពុំអាចរកឃើញ Barcode ឬ QR Code ក្នុងរូបភាពនេះឡើយ។ សូមសាកល្បងថតសារជាថ្មីដោយដាក់កាមេរ៉ាឱ្យជិត និងច្បាស់ល្អ!');
    } catch {
      setErrorMsg('ពុំអាច Scan រូបភាពនេះបានទេ។ សូមសាកល្បងថតឱ្យច្បាស់ ឬពិនិត្យពន្លឺជុំវិញ Barcode!');
    } finally {
      setIsFileScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleSuccess(manualCode.trim());
  };

  useEffect(() => {
    if (isOpen) {
      setLastScanned(null);
      setErrorMsg(null);
      setShowManualInput(false);
      setManualCode('');
      setSessionCount(0);
      setFeedback(null);
      lastScannedTimeRef.current = { code: '', time: 0 };
      hasHandledSuccessRef.current = false;
      
      // If secure context, launch live camera
      if (isSecureContext) {
        const t = setTimeout(() => {
          startCamera(selectedCameraId || undefined);
        }, 150);
        return () => {
          clearTimeout(t);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col text-white">
        
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Scan className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-white">Scanner Barcode & QR</span>
                {isContinuous && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1 animate-pulse">
                    <Zap className="w-2.5 h-2.5 fill-emerald-400" />
                    <span>Auto-Enter {sessionCount > 0 ? `(${sessionCount})` : ''}</span>
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {currentPayerName ? (
                  <span className="text-blue-300 truncate">
                    👤 <b>{currentPayerName}</b>
                  </span>
                ) : (
                  <span>ដាក់កាមេរ៉ាឱ្យចំកូដដើម្បី Auto-Enter ស្កេនបន្ត</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Toggle continuous mode */}
            <button
              type="button"
              onClick={() => setIsContinuous(prev => !prev)}
              className={`px-2 py-1 rounded-xl text-[10px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                isContinuous
                  ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title={isContinuous ? 'បិទស្កេនបន្ត (Scan once)' : 'បើកស្កេនបន្ត (Auto-Enter continuous)'}
            >
              <Zap className={`w-3 h-3 ${isContinuous ? 'fill-blue-400 text-blue-400' : ''}`} />
              <span className="hidden sm:inline">{isContinuous ? 'ស្កេនបន្ត' : 'ម្តងមួយ'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopCameraSafe();
                onClose();
              }}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              title="បិទ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewfinder Area */}
        <div className="p-4 flex flex-col items-center">
          
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

          <div className="relative w-full aspect-4/3 bg-black rounded-2xl overflow-hidden border-2 border-slate-800 flex items-center justify-center shadow-inner">
            
            {/* HTML5 QR Code Mount Node (For Live Stream) */}
            <div 
              id={containerId} 
              className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
            />

            {/* Hidden node for file scan */}
            <div id="file-scanner-hidden" className="hidden" />

            {/* Active Camera Indicator Badge */}
            {!isLoading && !errorMsg && (
              <div className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-white/10 text-[10px] text-white flex items-center gap-1.5 pointer-events-none shadow-md">
                <span className={`w-2 h-2 rounded-full ${isFacingEnvironment ? 'bg-emerald-400' : 'bg-blue-400'} animate-pulse`} />
                <span>{isFacingEnvironment ? '📷 កាមេរ៉ាក្រោយ' : '🤳 កាមេរ៉ាមុខ'}</span>
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && !errorMsg && (
              <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                <span>កំពុងបើកដំណើរការកាមេរ៉ា...</span>
              </div>
            )}

            {/* Insecure HTTP Mobile View (192.168.x.x on HTTP) */}
            {errorMsg === 'INSECURE_HTTP_CONTEXT' && (
              <div className="absolute inset-0 z-20 bg-gradient-to-b from-slate-950/95 to-slate-900/95 p-5 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/40 shadow-lg shadow-blue-500/10 animate-bounce">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">
                    បើកកាមេរ៉ាស្កេនលើទូរស័ព្ទ
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 max-w-xs leading-relaxed">
                    ចុចប៊ូតុងខាងក្រោមដើម្បីបើកកាមេរ៉ាទូរស័ព្ទថតស្កេន Barcode ឬ QR Code ភ្លាមៗ៖
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  disabled={isFileScanning}
                  className="w-full max-w-xs py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm transition active:scale-95 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isFileScanning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>កំពុងស្កេនរូបភាព...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>📸 បើកកាមេរ៉ាថតស្កេនភ្លាមៗ</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-900/80 px-3 py-1 rounded-lg border border-slate-800">
                  <Info className="w-3 h-3 text-blue-400 shrink-0" />
                  <span>ដំណើរការបាន ១០០% លើគ្រប់ Android & iPhone</span>
                </div>
              </div>
            )}

            {/* Permission Denied on Mobile/Desktop */}
            {errorMsg === 'PERMISSION_DENIED' && (
              <div className="absolute inset-0 z-20 bg-slate-950/95 p-4 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">
                    មិនទាន់បានអនុញ្ញាត Camera
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-1 max-w-xs leading-relaxed">
                    {isInAppBrowser ? (
                      <span>
                        កម្មវិធីទូរស័ព្ទ (Telegram/Facebook) កំពុងរារាំងកាមេរ៉ា។ សូមចុច <b>⋮</b> ជ្រើសរើស <b>Open in Chrome / Safari</b> ឬចុចប៊ូតុងខាងក្រោម៖
                      </span>
                    ) : (
                      <span>
                        សូមចុចលើសញ្ញា <b>🔒</b> ឬ <b>⚙️</b> នៅលើរបារអាសយដ្ឋាន (URL) របស់ Browser រួចជ្រើសរើស <b>Camera &rarr; Allow (អនុញ្ញាត)</b>។
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-center justify-center gap-2 pt-1 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    disabled={isFileScanning}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-bold text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>ថតស្កេនតាមកាមេរ៉ា (ដំណើរការ ១០០%)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startCamera(selectedCameraId || undefined)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>សាកល្បងម្ដងទៀត</span>
                  </button>
                </div>
              </div>
            )}

            {/* Other Errors */}
            {errorMsg && errorMsg !== 'INSECURE_HTTP_CONTEXT' && errorMsg !== 'PERMISSION_DENIED' && (
              <div className="absolute inset-0 z-20 bg-slate-950/95 p-4 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <p className="text-xs text-rose-300 max-w-xs leading-relaxed">
                  {errorMsg}
                </p>
                {isInAppBrowser && (
                  <p className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg max-w-xs">
                    💡 គន្លឹះ៖ ចុចសញ្ញា <b>⋮</b> ជ្រើសរើស <b>«Open in Chrome»</b> ឬប្រើប៊ូតុងខាងក្រោម
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    disabled={isFileScanning}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>ថតស្កេនតាមកាមេរ៉ា</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startCamera(selectedCameraId || undefined)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>សាកល្បងម្ដងទៀត</span>
                  </button>
                </div>
              </div>
            )}

            {/* HUD / Reticle on Live Stream */}
            {!isLoading && !errorMsg && (
              <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center p-4">
                {/* Generous scan frame for 1D Barcode (wide) & QR Code */}
                <div className="relative w-[92%] h-[72%] border border-white/25 rounded-2xl overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] transition-all">
                  {/* Four Corner Accents */}
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-emerald-400 rounded-br-lg" />
                  
                  {/* Laser Scan Line */}
                  <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_rgba(239,68,68,0.9)] animate-pulse top-1/2 -translate-y-1/2" />
                </div>
                
                {/* Aiming hint below frame */}
                <div className="mt-2 text-[10px] text-white/90 bg-black/60 px-2.5 py-0.5 rounded-full font-medium border border-white/10 backdrop-blur-xs">
                  ដាក់ឆ្នូតក្រហមឱ្យកាត់ចំកណ្តាល Barcode ឬ QR Code
                </div>
              </div>
            )}

            {/* Live Floating Feedback Badge for Continuous Scan */}
            {isContinuous && feedback && (
              <div className="absolute top-3 inset-x-3 z-30 pointer-events-none animate-in slide-in-from-top-2 duration-150 flex justify-center">
                <div className={`px-4 py-2.5 rounded-2xl border backdrop-blur-md shadow-2xl flex items-center gap-2.5 max-w-[92%] ${
                  feedback.type === 'success'
                    ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
                    : 'bg-rose-950/95 border-rose-500/60 text-rose-200'
                }`}>
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 animate-bounce" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
                  )}
                  <div className="flex flex-col text-left overflow-hidden">
                    <span className="font-mono font-bold text-xs text-white truncate">
                      {feedback.code}
                    </span>
                    <span className="text-[11px] font-semibold leading-tight">
                      {feedback.message}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Success Visual Banner for Single-scan mode */}
            {(!isContinuous || autoCloseOnScan) && lastScanned && (
              <div className="absolute inset-0 z-30 bg-emerald-950/95 flex flex-col items-center justify-center gap-2 animate-in zoom-in-95 duration-150 p-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="text-xs text-emerald-300 font-semibold">
                  បាន Scan ជោគជ័យ!
                </div>
                <div className="font-mono font-bold text-sm text-white px-3 py-1 rounded-lg bg-emerald-900/60 border border-emerald-700/50 max-w-full truncate">
                  {lastScanned}
                </div>
              </div>
            )}

          </div>

          {/* Controls Bar */}
          <div className="w-full mt-3 flex items-center justify-between gap-1.5 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Snapshot Camera Button */}
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                disabled={isFileScanning}
                className="px-2.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1 cursor-pointer disabled:opacity-50 text-xs font-bold shadow-xs"
                title="បើកកាមេរ៉ាថតស្កេន"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>ថតស្កេន</span>
              </button>

              {/* Facing mode toggle */}
              {isSecureContext && (
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  disabled={isLoading}
                  className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 text-xs font-semibold"
                  title="ប្តូរកាមេរ៉ា មុខ / ក្រោយ"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isFacingEnvironment ? 'កាមេរ៉ាក្រោយ' : 'កាមេរ៉ាមុខ'}</span>
                </button>
              )}

              {/* Zoom toggle button */}
              {hasZoom && (
                <button
                  type="button"
                  onClick={toggleZoom}
                  className={`px-2.5 py-2 rounded-xl border transition cursor-pointer flex items-center gap-1 text-xs font-semibold ${
                    currentZoom > 1
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                  title="ពង្រីកកាមេរ៉ា 2x"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>{currentZoom > 1 ? '2x' : '1x'}</span>
                </button>
              )}

              {/* Torch / Flashlight */}
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2 rounded-xl border transition cursor-pointer ${
                    isTorchOn 
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' 
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                  title={isTorchOn ? 'បិទពិល' : 'បើកពិល'}
                >
                  <Flashlight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Gallery Upload Scanner */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isFileScanning}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 cursor-pointer text-xs font-semibold"
                title="Upload រូបថត Barcode/QR Code ពី Gallery"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isFileScanning ? 'កំពុង Scan...' : 'Gallery'}</span>
              </button>

              {/* Manual Input Toggle */}
              <button
                type="button"
                onClick={() => setShowManualInput(prev => !prev)}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  showManualInput
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
                title="បញ្ចូលលេខកូដដោយដៃ"
              >
                <Keyboard className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Collapsible Manual Input Fallback */}
          {showManualInput && (
            <form onSubmit={handleManualSubmit} className="w-full mt-2.5 flex items-center gap-1.5 animate-in slide-in-from-top-2 duration-150">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="វាយលេខកូដ (ឧ. E12812205549)..."
                className="flex-1 h-9 px-3 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>យល់ព្រម</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* Multiple camera dropdown if available on secure context */}
          {isSecureContext && cameras.length > 1 && (
            <div className="w-full mt-2">
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  setSelectedCameraId(e.target.value);
                  startCamera(e.target.value);
                }}
                className="w-full h-8 px-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">-- ជ្រើសរើស Camera --</option>
                {cameras.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Continuous Session Summary & Done Button */}
        {isContinuous && (
          <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>ស្កេនក្នុងវគ្គនេះ៖ <b className="text-emerald-400 font-mono text-sm">{sessionCount}</b> កញ្ចប់</span>
            </div>

            <button
              type="button"
              onClick={() => {
                stopCameraSafe();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/25 transition active:scale-95 cursor-pointer shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{sessionCount > 0 ? `រួចរាល់ (${sessionCount} ថ្មី)` : 'រួចរាល់ / បិទ'}</span>
            </button>
          </div>
        )}

        {/* Footer Guidance */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-400 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>ស្កេន Barcode 1D (Code 128, 39, EAN...) & QR Code</span>
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1">
              {hasNativeDetector ? 'AI Ready' : 'Ready'}
            </span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80">
            💡 <b>គន្លឹះស្កេនឱ្យជាប់លឿន៖</b> កាន់ទូរស័ព្ទចម្ងាយ ១៥-២០ស.ម (កុំឱ្យជិតពេក), តម្រង់ឆ្នូតក្រហមឱ្យកាត់ចំកណ្តាលឆ្នូត Barcode។ បើពន្លឺខ្សោយ ចុចបើក <b>ពិល</b> ឬចុច <b>2x</b> ដើម្បីពង្រីក។
          </p>
        </div>

      </div>
    </div>
  );
};

