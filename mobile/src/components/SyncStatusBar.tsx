import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { enhancedSyncService, SyncStatus } from '@/services/sync/enhanced-sync';
import { COLORS } from '@/utils/constants';

interface SyncStatusBarProps {
  onPress?: () => void;
  compact?: boolean;
}

export function SyncStatusBar({ onPress, compact = false }: SyncStatusBarProps) {
  const [status, setStatus] = useState<SyncStatus>({
    syncing: false,
    lastSyncAt: null,
    pendingCount: 0,
    conflictCount: 0,
  });
  const [isOnline, setIsOnline] = useState(true);
  const pulseAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    const unsubscribe = enhancedSyncService.onStatusChange(setStatus);
    
    enhancedSyncService.getStatus().then(setStatus);

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (status.syncing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status.syncing, pulseAnim]);

  const getStatusColor = () => {
    if (!isOnline) return COLORS.warning;
    if (status.error) return COLORS.error;
    if (status.conflictCount > 0) return COLORS.warning;
    if (status.syncing) return COLORS.primary;
    if (status.pendingCount > 0) return COLORS.info;
    return COLORS.success;
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (status.error) return 'Sync Error';
    if (status.syncing) {
      if (status.progress) {
        return `Syncing ${status.progress.completed}/${status.progress.total}...`;
      }
      return 'Syncing...';
    }
    if (status.conflictCount > 0) return `${status.conflictCount} conflicts`;
    if (status.pendingCount > 0) return `${status.pendingCount} pending`;
    return 'All synced';
  };

  const getStatusIcon = () => {
    if (status.syncing) {
      return <ActivityIndicator size="small" color={COLORS.white} />;
    }
    if (!isOnline) {
      return <Text style={styles.icon}>📴</Text>;
    }
    if (status.error) {
      return <Text style={styles.icon}>⚠️</Text>;
    }
    if (status.conflictCount > 0) {
      return <Text style={styles.icon}>⚡</Text>;
    }
    if (status.pendingCount > 0) {
      return <Text style={styles.icon}>🔄</Text>;
    }
    return <Text style={styles.icon}>✓</Text>;
  };

  if (compact) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[styles.compactContainer, { backgroundColor: getStatusColor() }]}
      >
        <Animated.View style={{ opacity: pulseAnim }}>
          {getStatusIcon()}
        </Animated.View>
        {status.pendingCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{status.pendingCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.container, { backgroundColor: getStatusColor() }]}
      activeOpacity={0.8}
    >
      <Animated.View style={[styles.content, { opacity: pulseAnim }]}>
        {getStatusIcon()}
        <Text style={styles.text}>{getStatusText()}</Text>
      </Animated.View>
      {status.lastSyncAt && !status.syncing && (
        <Text style={styles.lastSync}>
          Last sync: {new Date(status.lastSyncAt).toLocaleTimeString()}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const slideAnim = useState(new Animated.Value(-50))[0];

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOnline ? -50 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOnline, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.offlineBanner,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Text style={styles.offlineText}>
        📴 You're offline - changes will sync when you reconnect
      </Text>
    </Animated.View>
  );
}

export function SyncConflictBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <View style={styles.conflictBadge}>
      <Text style={styles.conflictText}>⚡ {count} conflicts need attention</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  compactContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 16,
    color: COLORS.white,
  },
  text: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  lastSync: {
    color: COLORS.white,
    fontSize: 11,
    opacity: 0.8,
    marginTop: 4,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: 'bold',
  },
  offlineBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.warning,
    padding: 8,
    zIndex: 1000,
  },
  offlineText: {
    color: COLORS.white,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  conflictBadge: {
    backgroundColor: COLORS.warning,
    padding: 8,
    borderRadius: 6,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  conflictText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default SyncStatusBar;
