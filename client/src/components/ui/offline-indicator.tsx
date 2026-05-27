/**
 * Offline Indicator Component
 * Shows a visual indicator when the app is offline or has pending sync items
 */

import { useOfflineIndicator } from '../../hooks/useOfflineSync';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  className?: string;
  position?: 'top' | 'bottom';
  showPendingCount?: boolean;
}

export function OfflineIndicator({
  className,
  position = 'bottom',
  showPendingCount = true,
}: OfflineIndicatorProps) {
  const { isOffline, pendingCount, showIndicator } = useOfflineIndicator();

  if (!showIndicator) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300',
        position === 'top' ? 'top-0' : 'bottom-0',
        isOffline
          ? 'bg-amber-500 text-amber-950'
          : 'bg-primary/90 text-primary-foreground',
        className
      )}
    >
      {isOffline ? (
        <>
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
            />
          </svg>
          <span>You're offline. Changes will sync when you're back online.</span>
        </>
      ) : (
        <>
          <svg
            className="h-4 w-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>
            {showPendingCount && pendingCount > 0
              ? `${pendingCount} item${pendingCount > 1 ? 's' : ''} pending sync`
              : 'Syncing...'}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Compact offline badge for use in headers/navbars
 */
export function OfflineBadge({ className }: { className?: string }) {
  const { isOffline, pendingCount, showIndicator } = useOfflineIndicator();

  if (!showIndicator) {
    return null;
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        isOffline
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-primary/10 text-primary',
        className
      )}
    >
      {isOffline ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span>Offline</span>
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span>{pendingCount} pending</span>
        </>
      )}
    </div>
  );
}

/**
 * Floating sync status button
 */
export function SyncStatusButton({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const { isOffline, pendingCount, showIndicator } = useOfflineIndicator();

  if (!showIndicator) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-4 py-2 shadow-lg transition-all duration-300 hover:scale-105',
        isOffline
          ? 'bg-amber-500 text-amber-950 hover:bg-amber-400'
          : 'bg-primary text-primary-foreground hover:bg-primary/90',
        className
      )}
    >
      {isOffline ? (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
      ) : (
        <svg
          className="h-5 w-5 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      )}
      <span className="text-sm font-medium">
        {isOffline ? 'Offline' : `${pendingCount} pending`}
      </span>
    </button>
  );
}

export default OfflineIndicator;
