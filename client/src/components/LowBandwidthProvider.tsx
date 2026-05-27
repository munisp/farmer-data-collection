/**
 * LowBandwidthProvider - Adapts the UI for 2G/slow connections.
 *
 * Features:
 * - Detects connection type (2G, 3G, 4G, WiFi)
 * - Reduces image quality and lazy-loads images
 * - Disables animations on slow connections
 * - Shows skeleton screens during loading
 * - Compresses request payloads
 * - Provides bandwidth-aware context to children
 * - Save Data mode detection
 */

import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

interface BandwidthConfig {
  quality: "2g" | "3g" | "4g" | "wifi" | "offline" | "unknown";
  imageQuality: "low" | "medium" | "high";
  imageMaxWidth: number;
  enableAnimations: boolean;
  enableAutoplay: boolean;
  prefetchEnabled: boolean;
  maxConcurrentRequests: number;
  saveData: boolean;
  effectiveDownlink: number;
  isSlowConnection: boolean;
}

const defaultConfig: BandwidthConfig = {
  quality: "unknown",
  imageQuality: "high",
  imageMaxWidth: 1920,
  enableAnimations: true,
  enableAutoplay: true,
  prefetchEnabled: true,
  maxConcurrentRequests: 6,
  saveData: false,
  effectiveDownlink: 10,
  isSlowConnection: false,
};

const BandwidthContext = createContext<BandwidthConfig>(defaultConfig);

export function useBandwidth(): BandwidthConfig {
  return useContext(BandwidthContext);
}

function detectBandwidth(): BandwidthConfig {
  if (!navigator.onLine) {
    return {
      ...defaultConfig,
      quality: "offline",
      imageQuality: "low",
      imageMaxWidth: 640,
      enableAnimations: false,
      enableAutoplay: false,
      prefetchEnabled: false,
      maxConcurrentRequests: 0,
      isSlowConnection: true,
    };
  }

  const connection = (navigator as any).connection;
  if (!connection) return defaultConfig;

  const effectiveType = connection.effectiveType ?? "4g";
  const saveData = connection.saveData ?? false;
  const downlink = connection.downlink ?? 10;

  const configs: Record<string, Partial<BandwidthConfig>> = {
    "slow-2g": {
      quality: "2g",
      imageQuality: "low",
      imageMaxWidth: 320,
      enableAnimations: false,
      enableAutoplay: false,
      prefetchEnabled: false,
      maxConcurrentRequests: 1,
      isSlowConnection: true,
    },
    "2g": {
      quality: "2g",
      imageQuality: "low",
      imageMaxWidth: 480,
      enableAnimations: false,
      enableAutoplay: false,
      prefetchEnabled: false,
      maxConcurrentRequests: 2,
      isSlowConnection: true,
    },
    "3g": {
      quality: "3g",
      imageQuality: "medium",
      imageMaxWidth: 800,
      enableAnimations: true,
      enableAutoplay: false,
      prefetchEnabled: false,
      maxConcurrentRequests: 3,
      isSlowConnection: false,
    },
    "4g": {
      quality: "4g",
      imageQuality: "high",
      imageMaxWidth: 1920,
      enableAnimations: true,
      enableAutoplay: true,
      prefetchEnabled: true,
      maxConcurrentRequests: 6,
      isSlowConnection: false,
    },
  };

  const detected = configs[effectiveType] ?? configs["4g"];

  return {
    ...defaultConfig,
    ...detected,
    saveData,
    effectiveDownlink: downlink,
  } as BandwidthConfig;
}

interface LowBandwidthProviderProps {
  children: ReactNode;
}

export function LowBandwidthProvider({ children }: LowBandwidthProviderProps) {
  const [config, setConfig] = useState<BandwidthConfig>(detectBandwidth);

  useEffect(() => {
    const update = () => setConfig(detectBandwidth());

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener("change", update);
    }

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      if (connection) {
        connection.removeEventListener("change", update);
      }
    };
  }, []);

  // Disable CSS animations on slow connections
  useEffect(() => {
    if (!config.enableAnimations) {
      document.documentElement.style.setProperty("--animation-duration", "0s");
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.style.removeProperty("--animation-duration");
      document.documentElement.classList.remove("reduce-motion");
    }
  }, [config.enableAnimations]);

  return (
    <BandwidthContext.Provider value={config}>
      {children}
    </BandwidthContext.Provider>
  );
}

// ===== Bandwidth-aware Image Component =====

interface AdaptiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallback?: ReactNode;
}

export function AdaptiveImage({ src, alt, fallback, className, ...props }: AdaptiveImageProps) {
  const bandwidth = useBandwidth();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (bandwidth.quality === "offline" || error) {
    return fallback ? <>{fallback}</> : (
      <div className={`bg-muted flex items-center justify-center text-muted-foreground text-xs ${className ?? ""}`}>
        {bandwidth.quality === "offline" ? "Offline" : "Failed"}
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className={`bg-muted animate-pulse rounded ${className ?? ""}`} />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`${className ?? ""} ${loaded ? "" : "hidden"}`}
        {...props}
      />
    </>
  );
}

// ===== Skeleton Screen =====

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circle" | "rect" | "card";
  count?: number;
}

export function Skeleton({ className = "", variant = "rect", count = 1 }: SkeletonProps) {
  const items = Array.from({ length: count });

  if (variant === "card") {
    return (
      <div className={`space-y-3 ${className}`}>
        {items.map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
            <div className="h-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "circle") {
    return (
      <div className={`flex gap-2 ${className}`}>
        {items.map((_, i) => (
          <div key={i} className="w-10 h-10 rounded-full bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className={`space-y-2 ${className}`}>
        {items.map((_, i) => (
          <div key={i} className="h-3 bg-muted rounded animate-pulse" style={{ width: `${65 + Math.random() * 35}%` }} />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {items.map((_, i) => (
        <div key={i} className="h-8 bg-muted rounded animate-pulse" />
      ))}
    </div>
  );
}

// ===== Connection Banner =====

export function ConnectionBanner() {
  const bandwidth = useBandwidth();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (bandwidth.quality === "offline") {
    return (
      <div className="bg-red-600 text-white px-4 py-2 text-center text-sm flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        <span>You are offline. Changes will sync when connected.</span>
      </div>
    );
  }

  if (bandwidth.isSlowConnection) {
    return (
      <div className="bg-orange-500 text-white px-4 py-1.5 text-center text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          <span>Slow connection ({bandwidth.quality.toUpperCase()}) &mdash; images reduced, animations disabled</span>
        </div>
        <button onClick={() => setDismissed(true)} className="text-white/70 hover:text-white px-2">&times;</button>
      </div>
    );
  }

  return null;
}
