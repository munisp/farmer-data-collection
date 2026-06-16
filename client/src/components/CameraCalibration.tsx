/**
 * CameraCalibration - Professional camera component with calibration
 * for agricultural photography (soil analysis, crop disease, inventory).
 *
 * Features:
 * - Auto-focus confirmation with contrast detection
 * - Lighting quality check (too dark / too bright / good)
 * - White balance hint (outdoor daylight, shade, artificial)
 * - Resolution presets per use case
 * - Grid overlay for consistent framing
 * - GPS metadata capture
 * - Adaptive compression based on network speed
 * - Flash toggle
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Camera, X, Grid3x3, Sun, SunDim, Zap, ZapOff,
  Focus, Check, AlertTriangle, RotateCcw, Download,
  Crosshair, Maximize2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CameraMode = "soil" | "crop_disease" | "inventory" | "general";

interface CameraCalibrationProps {
  mode?: CameraMode;
  onCapture: (imageData: string, file: File, metadata: CaptureMetadata) => void;
  onClose?: () => void;
  maxSizeMB?: number;
}

interface CaptureMetadata {
  mode: CameraMode;
  resolution: { width: number; height: number };
  timestamp: string;
  gps: { latitude: number; longitude: number; accuracy: number } | null;
  lightingScore: number;
  focusScore: number;
  networkQuality: string;
  compressionQuality: number;
}

interface LightingAnalysis {
  score: number;
  level: "too_dark" | "poor" | "good" | "bright" | "too_bright";
  message: string;
}

const MODE_CONFIG: Record<CameraMode, {
  label: string;
  description: string;
  resolution: { width: number; height: number };
  quality: number;
  tips: string[];
}> = {
  soil: {
    label: "Soil Analysis",
    description: "High-res for texture & color analysis",
    resolution: { width: 2560, height: 1920 },
    quality: 0.92,
    tips: [
      "Place a white card next to soil for color reference",
      "Photograph soil at arm's length, straight down",
      "Ensure even lighting (no harsh shadows)",
      "Include a ruler or coin for scale",
    ],
  },
  crop_disease: {
    label: "Crop Disease",
    description: "Close-up detail for disease detection",
    resolution: { width: 1920, height: 1440 },
    quality: 0.88,
    tips: [
      "Focus on the affected leaf or stem",
      "Capture both healthy and diseased areas",
      "Use natural daylight, avoid flash if possible",
      "Hold camera 15-30cm from the plant",
    ],
  },
  inventory: {
    label: "Inventory Photo",
    description: "Standard quality for product listing",
    resolution: { width: 1280, height: 960 },
    quality: 0.8,
    tips: [
      "Use a clean, neutral background",
      "Show the product from the front",
      "Ensure the entire item is visible",
      "Good lighting makes listings sell faster",
    ],
  },
  general: {
    label: "General Photo",
    description: "Balanced quality & size",
    resolution: { width: 1600, height: 1200 },
    quality: 0.85,
    tips: [
      "Hold the camera steady",
      "Use natural light when possible",
      "Tap to focus on the subject",
    ],
  },
};

function analyzeLighting(imageData: ImageData): LightingAnalysis {
  const data = imageData.data;
  let totalBrightness = 0;
  const pixelCount = data.length / 4;

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalBrightness += (r * 0.299 + g * 0.587 + b * 0.114);
  }

  const avgBrightness = totalBrightness / (pixelCount / 4);
  const normalizedScore = Math.min(100, Math.max(0, avgBrightness / 2.55));

  if (normalizedScore < 15) return { score: normalizedScore, level: "too_dark", message: "Too dark \u2014 add more light or use flash" };
  if (normalizedScore < 30) return { score: normalizedScore, level: "poor", message: "Low light \u2014 move to brighter area" };
  if (normalizedScore > 90) return { score: normalizedScore, level: "too_bright", message: "Overexposed \u2014 reduce light or move to shade" };
  if (normalizedScore > 75) return { score: normalizedScore, level: "bright", message: "Bright \u2014 slightly reduce exposure" };
  return { score: normalizedScore, level: "good", message: "Good lighting" };
}

function analyzeFocus(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  let totalEdge = 0;
  let samples = 0;

  // Laplacian edge detection (simplified) on center region
  const startX = Math.floor(width * 0.25);
  const endX = Math.floor(width * 0.75);
  const startY = Math.floor(imageData.height * 0.25);
  const endY = Math.floor(imageData.height * 0.75);

  for (let y = startY + 1; y < endY - 1; y += 2) {
    for (let x = startX + 1; x < endX - 1; x += 2) {
      const idx = (y * width + x) * 4;
      const center = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;

      const left = data[idx - 4] * 0.299 + data[idx - 3] * 0.587 + data[idx - 2] * 0.114;
      const right = data[idx + 4] * 0.299 + data[idx + 5] * 0.587 + data[idx + 6] * 0.114;
      const top = data[((y - 1) * width + x) * 4] * 0.299 + data[((y - 1) * width + x) * 4 + 1] * 0.587 + data[((y - 1) * width + x) * 4 + 2] * 0.114;
      const bottom = data[((y + 1) * width + x) * 4] * 0.299 + data[((y + 1) * width + x) * 4 + 1] * 0.587 + data[((y + 1) * width + x) * 4 + 2] * 0.114;

      const laplacian = Math.abs(left + right + top + bottom - 4 * center);
      totalEdge += laplacian;
      samples++;
    }
  }

  // Normalize to 0-100 scale
  const avgEdge = samples > 0 ? totalEdge / samples : 0;
  return Math.min(100, avgEdge * 4);
}

function getNetworkQuality(): { quality: string; compressionMultiplier: number } {
  const connection = (navigator as { connection?: { effectiveType?: string } }).connection;
  if (!connection) return { quality: "unknown", compressionMultiplier: 1.0 };

  const effectiveType = connection.effectiveType || "4g";
  switch (effectiveType) {
    case "slow-2g":
    case "2g": return { quality: "2g", compressionMultiplier: 0.4 };
    case "3g": return { quality: "3g", compressionMultiplier: 0.7 };
    case "4g": return { quality: "4g", compressionMultiplier: 1.0 };
    default: return { quality: effectiveType, compressionMultiplier: 1.0 };
  }
}

export default function CameraCalibration({
  mode: initialMode = "general",
  onCapture,
  onClose,
  maxSizeMB = 5,
}: CameraCalibrationProps) {
  const [mode, setMode] = useState<CameraMode>(initialMode);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [lighting, setLighting] = useState<LightingAnalysis | null>(null);
  const [focusScore, setFocusScore] = useState(0);
  const [gpsLocation, setGpsLocation] = useState<GeolocationPosition | null>(null);
  const [showTips, setShowTips] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedMetadata, setCapturedMetadata] = useState<CaptureMetadata | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const config = MODE_CONFIG[mode];

  // Get GPS location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGpsLocation(pos),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: "environment",
          width: { ideal: config.resolution.width },
          height: { ideal: config.resolution.height },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsStreaming(true);
      setShowTips(false);

      // Start real-time analysis
      analysisIntervalRef.current = setInterval(() => {
        analyzeFrame();
      }, 1000);
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Camera access denied. Please allow camera permissions.");
    }
  }, [config.resolution]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Analyze current frame for lighting and focus
  const analyzeFrame = useCallback(() => {
    if (!videoRef.current || !analysisCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = analysisCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use smaller canvas for analysis (performance)
    const analysisWidth = 320;
    const analysisHeight = 240;
    canvas.width = analysisWidth;
    canvas.height = analysisHeight;

    ctx.drawImage(video, 0, 0, analysisWidth, analysisHeight);
    const imageData = ctx.getImageData(0, 0, analysisWidth, analysisHeight);

    setLighting(analyzeLighting(imageData));
    setFocusScore(analyzeFocus(imageData));
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = config.resolution.width;
    canvas.height = config.resolution.height;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Adaptive compression based on network
    const network = getNetworkQuality();
    const adaptiveQuality = config.quality * network.compressionMultiplier;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;

        const sizeMB = blob.size / (1024 * 1024);
        if (sizeMB > maxSizeMB) {
          toast.error(`Image too large (${sizeMB.toFixed(1)}MB). Try reducing quality.`);
          return;
        }

        const file = new File([blob], `${mode}_${Date.now()}.jpg`, { type: "image/jpeg" });
        const imageData = canvas.toDataURL("image/jpeg", adaptiveQuality);

        const metadata: CaptureMetadata = {
          mode,
          resolution: { width: canvas.width, height: canvas.height },
          timestamp: new Date().toISOString(),
          gps: gpsLocation ? {
            latitude: gpsLocation.coords.latitude,
            longitude: gpsLocation.coords.longitude,
            accuracy: gpsLocation.coords.accuracy,
          } : null,
          lightingScore: lighting?.score ?? 0,
          focusScore,
          networkQuality: network.quality,
          compressionQuality: adaptiveQuality,
        };

        setPreview(imageData);
        setCapturedMetadata(metadata);
        stopCamera();
      },
      "image/jpeg",
      adaptiveQuality
    );
  }, [mode, config, gpsLocation, lighting, focusScore, maxSizeMB, stopCamera]);

  const confirmCapture = useCallback(() => {
    if (preview && capturedMetadata) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const file = new File([blob], `${mode}_${Date.now()}.jpg`, { type: "image/jpeg" });
          onCapture(preview, file, capturedMetadata);
          toast.success("Photo captured with calibration data");
        },
        "image/jpeg",
        capturedMetadata.compressionQuality
      );
    }
  }, [preview, capturedMetadata, mode, onCapture]);

  const retake = useCallback(() => {
    setPreview(null);
    setCapturedMetadata(null);
    startCamera();
  }, [startCamera]);

  // Lighting indicator color
  const lightingColor = lighting
    ? ({ too_dark: "text-red-500", poor: "text-orange-500", good: "text-green-500", bright: "text-yellow-500", too_bright: "text-red-500" })[lighting.level]
    : "text-muted-foreground";

  // Focus indicator
  const focusLevel = focusScore > 50 ? "sharp" : focusScore > 25 ? "acceptable" : "blurry";
  const focusColor = focusLevel === "sharp" ? "text-green-500" : focusLevel === "acceptable" ? "text-yellow-500" : "text-red-500";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white z-10">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          <span className="font-semibold text-sm">{config.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode selector */}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as CameraMode)}
            className="bg-white/10 text-white text-xs rounded px-2 py-1 border border-white/20"
          >
            {(Object.keys(MODE_CONFIG) as CameraMode[]).map((m) => (
              <option key={m} value={m} className="text-black">{MODE_CONFIG[m].label}</option>
            ))}
          </select>
          {onClose && (
            <button onClick={() => { stopCamera(); onClose(); }} className="p-1.5 hover:bg-white/10 rounded-full">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Camera viewfinder */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {!isStreaming && !preview && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6">
            <Camera className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-semibold mb-2">{config.label}</p>
            <p className="text-sm text-white/70 text-center mb-6">{config.description}</p>

            {showTips && (
              <div className="bg-white/10 rounded-xl p-4 max-w-sm w-full mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Tips for best results</p>
                {config.tips.map((tip, i) => (
                  <p key={i} className="text-sm text-white/80 flex items-start gap-2 mb-1.5">
                    <span className="text-primary mt-0.5 text-xs">{i + 1}.</span>
                    {tip}
                  </p>
                ))}
              </div>
            )}

            <Button onClick={startCamera} size="lg" className="gap-2">
              <Camera className="w-5 h-5" />
              Open Camera
            </Button>
          </div>
        )}

        {/* Live video */}
        <video
          ref={videoRef}
          className={cn("w-full h-full object-cover", !isStreaming && "hidden")}
          playsInline
          muted
          autoPlay
        />

        {/* Preview */}
        {preview && (
          <img src={preview} alt="Captured" className="w-full h-full object-contain" />
        )}

        {/* Grid overlay */}
        {isStreaming && showGrid && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Rule of thirds */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/20" />
              ))}
            </div>
            {/* Center crosshair */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <Crosshair className="w-8 h-8 text-white/40" />
            </div>
          </div>
        )}

        {/* Real-time indicators overlay */}
        {isStreaming && (
          <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
            {/* Lighting */}
            <div className={cn("flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1.5", lightingColor)}>
              <Sun className="w-4 h-4" />
              <span className="text-xs font-medium">{lighting?.message ?? "Analyzing..."}</span>
            </div>

            {/* Focus */}
            <div className={cn("flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1.5", focusColor)}>
              <Focus className="w-4 h-4" />
              <span className="text-xs font-medium">
                {focusLevel === "sharp" ? "Sharp" : focusLevel === "acceptable" ? "OK" : "Blurry"}
              </span>
            </div>
          </div>
        )}

        {/* GPS indicator */}
        {isStreaming && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1.5 text-white/70">
            <Crosshair className="w-3 h-3" />
            <span className="text-[10px]">
              {gpsLocation
                ? `${gpsLocation.coords.latitude.toFixed(4)}, ${gpsLocation.coords.longitude.toFixed(4)}`
                : "No GPS"}
            </span>
          </div>
        )}

        {/* Network quality indicator */}
        {isStreaming && (
          <div className="absolute bottom-2 right-2 bg-black/60 rounded-full px-3 py-1.5 text-white/70">
            <span className="text-[10px]">{getNetworkQuality().quality.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Analysis canvas (hidden) */}
      <canvas ref={analysisCanvasRef} className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Controls bar */}
      <div className="bg-black/90 px-4 py-4 safe-area-bottom">
        {isStreaming && (
          <div className="flex items-center justify-between max-w-md mx-auto">
            {/* Grid toggle */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={cn("p-3 rounded-full", showGrid ? "bg-white/20 text-white" : "text-white/50")}
            >
              <Grid3x3 className="w-5 h-5" />
            </button>

            {/* Capture button */}
            <button
              onClick={capturePhoto}
              disabled={lighting?.level === "too_dark"}
              className={cn(
                "w-16 h-16 rounded-full border-4 transition-all active:scale-95",
                lighting?.level === "too_dark"
                  ? "border-red-500/50 bg-red-500/20"
                  : "border-white bg-white/20 hover:bg-white/30"
              )}
            >
              <div className="w-full h-full rounded-full bg-white/90 flex items-center justify-center">
                <Camera className="w-6 h-6 text-black" />
              </div>
            </button>

            {/* Flash toggle */}
            <button
              onClick={() => {
                setFlashEnabled(!flashEnabled);
                if (streamRef.current) {
                  const track = streamRef.current.getVideoTracks()[0];
                  const capabilities = track.getCapabilities?.() as Record<string, unknown>;
                  if (capabilities?.torch) {
                    track.applyConstraints({ advanced: [{ torch: !flashEnabled } as MediaTrackConstraintSet] });
                  }
                }
              }}
              className={cn("p-3 rounded-full", flashEnabled ? "bg-yellow-500/30 text-yellow-300" : "text-white/50")}
            >
              {flashEnabled ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
            </button>
          </div>
        )}

        {/* Preview controls */}
        {preview && capturedMetadata && (
          <div className="space-y-3">
            {/* Metadata summary */}
            <div className="flex items-center justify-center gap-4 text-xs text-white/60">
              <span>{capturedMetadata.resolution.width}x{capturedMetadata.resolution.height}</span>
              <span>Light: {capturedMetadata.lightingScore.toFixed(0)}%</span>
              <span>Focus: {capturedMetadata.focusScore.toFixed(0)}%</span>
              <span>{capturedMetadata.networkQuality.toUpperCase()}</span>
            </div>

            {/* Warnings */}
            {capturedMetadata.focusScore < 25 && (
              <div className="flex items-center gap-2 text-yellow-400 text-xs justify-center">
                <AlertTriangle className="w-4 h-4" />
                <span>Image may be blurry. Consider retaking.</span>
              </div>
            )}

            <div className="flex items-center gap-3 justify-center">
              <Button variant="outline" onClick={retake} className="gap-2 border-white/30 text-white hover:bg-white/10">
                <RotateCcw className="w-4 h-4" />
                Retake
              </Button>
              <Button onClick={confirmCapture} className="gap-2">
                <Check className="w-4 h-4" />
                Use Photo
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
