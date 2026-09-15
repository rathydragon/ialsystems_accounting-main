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
  Smartphone,
  ShieldAlert,
  Info
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

// Supported barcode formats for both camera stream and snapshot file scanning
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.DATA_MATRIX
];

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess
}) => {
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isFacingEnvironment, setIsFacingEnvironment] = useState(true);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isFileScanning, setIsFileScanning] = useState(false);

  // Check if current context is secure (HTTPS or localhost)
  const isSecureContext = typeof window !== 'undefined' && (
    window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const detectorIntervalRef = useRef<any>(null);
  const containerId = 'interactive-camera-barcode-scanner';

  const stopDetectorLoop = () => {
    if (detectorIntervalRef.current) {
      clearInterval(detectorIntervalRef.current);
      detectorIntervalRef.current = null;
    }
  };

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
    stopDetectorLoop();
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (e) {
        console.warn('Error stopping scanner:', e);
      }
      try {
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
  };

  // Start Live Camera
  const startCamera = async (deviceId?: string) => {
    // If on insecure HTTP on remote IP, mobile browsers block getUserMedia
    if (!isSecureContext && !navigator?.mediaDevices?.getUserMedia) {
      setIsLoading(false);
      setErrorMsg('INSECURE_HTTP_CONTEXT');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setHasTorch(false);
    setIsTorchOn(false);

    await stopCameraSafe();

    try {
      // Enable native BarcodeDetector for ultra-fast hardware detection on Android/Chrome
      const html5Qr = new Html5Qrcode(containerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      scannerRef.current = html5Qr;

      // Scan full frame without narrow cropping box so wide barcodes and margins are never cut off
      const config = {
        fps: 25,
        aspectRatio: 1.333333,
        videoConstraints: deviceId
          ? { deviceId: { exact: deviceId } }
          : {
              facingMode: isFacingEnvironment ? 'environment' : 'user',
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
              advanced: [{ focusMode: 'continuous' } as any]
            }
      };

      const cameraParam = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: isFacingEnvironment ? 'environment' : 'user' };

      await html5Qr.start(
        cameraParam,
        config,
        (decodedText) => {
          handleSuccess(decodedText);
        },
        () => {
          // Frame failure (normal between successful frames)
        }
      );

      setIsLoading(false);

      // Direct Native BarcodeDetector loop on raw video element (Ultra-fast Chrome Android detection)
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: [
              'code_128', 'code_39', 'code_93', 'codabar',
              'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf',
              'qr_code', 'data_matrix', 'aztec', 'pdf417'
            ]
          });

          let isDetecting = false;
          detectorIntervalRef.current = setInterval(async () => {
            if (isDetecting || !scannerRef.current) return;
            const videoEl = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
            if (videoEl && videoEl.readyState >= 2 && !videoEl.paused) {
              isDetecting = true;
              try {
                const results = await detector.detect(videoEl);
                if (results && results.length > 0) {
                  const firstMatch = results.find((r: any) => r.rawValue && r.rawValue.trim());
                  if (firstMatch) {
                    stopDetectorLoop();
                    handleSuccess(firstMatch.rawValue);
                  }
                }
              } catch {
                // ignore frame failure
              } finally {
                isDetecting = false;
              }
            }
          }, 80);
        } catch (detErr) {
          console.warn('Direct BarcodeDetector loop fallback:', detErr);
        }
      }

      // Check for torch capability
      try {
        const capabilities: any = html5Qr.getRunningTrackCapabilities();
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        }
      } catch {}

      // Get camera list for dropdown switch
      try {
        const devs = await Html5Qrcode.getCameras();
        if (Array.isArray(devs) && devs.length > 0) {
          setCameras(devs.map(d => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 5)}` })));
        }
      } catch {}
    } catch (err: any) {
      console.error('Camera start failed:', err);
      setIsLoading(false);
      if (!isSecureContext) {
        setErrorMsg('INSECURE_HTTP_CONTEXT');
      } else {
        setErrorMsg(
          err?.message?.includes('Permission') 
            ? 'មិនមានសិទ្ធិចូលប្រើ Camera ឡើយ។ សូម Allow Camera Permission ក្នុង Browser Settings!'
            : (err?.message || 'មិនអាចបើក Live Camera បានឡើយ។ សូមប្រើការថតរូបស្កេនតាមកាមេរ៉ាទូរស័ព្ទខាងក្រោម។')
        );
      }
    }
  };

  const handleSuccess = (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    stopDetectorLoop();
    playBeep();
    setLastScanned(cleaned);

    setTimeout(() => {
      stopCameraSafe();
      onScanSuccess(cleaned);
      onClose();
    }, 400);
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

  // Optimize large mobile camera photo before barcode detection
  const optimizeImageForScan = (file: File): Promise<File | Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1600;
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim) {
          resolve(file);
          return;
        }
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.95);
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  };

  // Scan from photo or file
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setIsFileScanning(true);
    setErrorMsg(null);

    try {
      // 1. Fast-track using native BarcodeDetector on original high-res image if available
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: [
              'code_128', 'code_39', 'code_93', 'codabar',
              'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf',
              'qr_code', 'data_matrix', 'aztec', 'pdf417'
            ]
          });
          const bitmap = await createImageBitmap(rawFile);
          const detected = await detector.detect(bitmap);
          if (detected && detected.length > 0) {
            const found = detected.find((d: any) => d.rawValue && d.rawValue.trim());
            if (found) {
              handleSuccess(found.rawValue);
              return;
            }
          }
        } catch (nativeErr) {
          console.warn('Direct file BarcodeDetector attempt:', nativeErr);
        }
      }

      // 2. Fallback to Html5Qrcode with all barcode engines enabled
      const processedFile = await optimizeImageForScan(rawFile);
      const tempScanner = new Html5Qrcode('file-scanner-hidden', {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      const decodedResult = await tempScanner.scanFileV2(processedFile as File, false);
      tempScanner.clear();

      if (decodedResult && decodedResult.decodedText) {
        handleSuccess(decodedResult.decodedText);
      } else {
        setErrorMsg('ពុំអាចរកឃើញ Barcode ឬ QR Code ក្នុងរូបភាពនេះឡើយ។ សូមសាកល្បងថតសារជាថ្មីដោយដាក់កាមេរ៉ាឱ្យជិត និងច្បាស់ល្អ!');
      }
    } catch {
      setErrorMsg('ពុំអាច Scan រូបភាពនេះបានទេ។ សូមសាកល្បងថតឱ្យច្បាស់ ឬពិនិត្យពន្លឺជុំវិញ Barcode!');
    } finally {
      setIsFileScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLastScanned(null);
      setErrorMsg(null);
      
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
        // Insecure HTTP context on remote IP: show direct camera snapshot view
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
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Scan className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>Scanner QR & Barcode</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  isSecureContext 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {isSecureContext ? 'Live Stream' : 'Mobile Ready'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {isSecureContext ? 'ដាក់កាមេរ៉ាឱ្យចំ Barcode ឬ QR Code ដើម្បីស្កេន' : 'ស្កេនតាមរយៈកាមេរ៉ាទូរស័ព្ទដៃ ឬ Tablet'}
              </p>
            </div>
          </div>

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

            {/* Other Errors */}
            {errorMsg && errorMsg !== 'INSECURE_HTTP_CONTEXT' && (
              <div className="absolute inset-0 z-20 bg-slate-950/95 p-4 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <p className="text-xs text-rose-300 max-w-xs leading-relaxed">
                  {errorMsg}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
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

            {/* HUD / Reticle on Live Stream - Wide View for 1D Barcodes */}
            {!isLoading && !errorMsg && (
              <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center p-4">
                <div className="relative w-[90%] h-[72%] border border-white/30 rounded-2xl overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-blue-400 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-blue-400 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-blue-400 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-blue-400 rounded-br-lg" />
                  <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_rgba(239,68,68,0.9)] animate-pulse top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            {/* Success Visual Banner */}
            {lastScanned && (
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
          <div className="w-full mt-3 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                disabled={isFileScanning}
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 text-xs font-bold shadow-xs"
                title="បើកកាមេរ៉ាថតស្កេន"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>កាមេរ៉ាថតស្កេន</span>
              </button>

              {isSecureContext && (
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  disabled={isLoading}
                  className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 text-xs"
                  title="ប្តូរកាមេរ៉ាមុខ / ក្រោយ"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isFacingEnvironment ? 'ក្រោយ' : 'មុខ'}</span>
                </button>
              )}

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
                  <Flashlight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Gallery Upload Scanner */}
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isFileScanning}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
                title="Upload រូបថត Barcode/QR Code ពី Gallery"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isFileScanning ? 'កំពុង Scan...' : 'ពី Gallery'}</span>
              </button>
            </div>
          </div>

          {/* Multiple camera dropdown if available on secure context */}
          {isSecureContext && cameras.length > 1 && (
            <div className="w-full mt-2">
              <select
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
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

        {/* Footer Guidance */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-400 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>ស្កេន Barcode 1D (Code 128, 39, EAN...) & QR Code</span>
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-bold">
              AI Ready
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            💡 <b>គន្លឹះ៖</b> ដាក់កាមេរ៉ាចម្ងាយប្រហែល 15-25cm ឱ្យឃើញ Barcode ទាំងមូល។ បើក្រចាប សូមចុច <b>"📸 កាមេរ៉ាថតស្កេន"</b> ដើម្បីថតស្កេនភ្លាមៗ!
          </p>
        </div>

      </div>
    </div>
  );
};
