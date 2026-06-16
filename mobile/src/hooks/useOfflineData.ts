import { useState, useEffect, useCallback } from 'react';
import { useSyncStore } from '@/stores/syncStore';
import NetInfo from '@react-native-community/netinfo';

interface UseOfflineDataOptions<T> {
  fetchFn: () => Promise<T>;
  cacheKey: string;
  staleTimeMs?: number;
}

interface UseOfflineDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isOffline: boolean;
  isStale: boolean;
  refresh: () => Promise<void>;
}

const cache: Record<string, { data: any; timestamp: number }> = {};

/**
 * Hook for offline-first data loading.
 * Attempts to fetch from API, falls back to in-memory cache when offline.
 * Screens using this hook work seamlessly in both online and offline modes.
 */
export function useOfflineData<T>({
  fetchFn,
  cacheKey,
  staleTimeMs = 5 * 60 * 1000,
}: UseOfflineDataOptions<T>): UseOfflineDataResult<T> {
  const [data, setData] = useState<T | null>(cache[cacheKey]?.data ?? null);
  const [loading, setLoading] = useState(!cache[cacheKey]);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const { pendingCount } = useSyncStore();

  const isStale = cache[cacheKey]
    ? Date.now() - cache[cacheKey].timestamp > staleTimeMs
    : true;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      setIsOffline(true);
      if (cache[cacheKey]) {
        setData(cache[cacheKey].data);
      }
      setLoading(false);
      return;
    }

    setIsOffline(false);
    try {
      const result = await fetchFn();
      cache[cacheKey] = { data: result, timestamp: Date.now() };
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      if (cache[cacheKey]) {
        setData(cache[cacheKey].data);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchFn, cacheKey]);

  useEffect(() => {
    if (isStale || !cache[cacheKey]) {
      void refresh();
    }
  }, []);

  return { data, loading, error, isOffline, isStale, refresh };
}
