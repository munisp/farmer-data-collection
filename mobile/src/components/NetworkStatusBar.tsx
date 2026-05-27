/**
 * Network Status Bar Component for React Native
 * 
 * Clear visual indicators for offline/online status and network quality.
 * Designed for low-literacy users in developing countries.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getMobileAdaptiveSyncManager,
  NetworkState,
  BatteryState,
  AdaptiveSyncConfig,
  SyncMode,
} from '../lib/networkAwareSync';

interface NetworkStatusBarProps {
  compact?: boolean;
  showBattery?: boolean;
  onPress?: () => void;
}

export function NetworkStatusBar({
  compact = false,
  showBattery = true,
  onPress,
}: NetworkStatusBarProps) {
  const [networkState, setNetworkState] = useState<NetworkState>({
    online: true,
    quality: 'unknown',
    type: 'unknown',
    isInternetReachable: null,
    details: null,
  });
  const [batteryState, setBatteryState] = useState<BatteryState>({
    level: 1,
    charging: true,
    lowPowerMode: false,
  });
  const [config, setConfig] = useState<AdaptiveSyncConfig | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [slideAnim] = useState(new Animated.Value(-50));

  useEffect(() => {
    const manager = getMobileAdaptiveSyncManager();

    setNetworkState(manager.getNetworkState());
    setBatteryState(manager.getBatteryState());
    setConfig(manager.getConfig());
    setStatusMessage(manager.getStatusMessage());

    const unsubscribe = manager.subscribe((newConfig) => {
      setNetworkState(manager.getNetworkState());
      setBatteryState(manager.getBatteryState());
      setConfig(newConfig);
      setStatusMessage(manager.getStatusMessage());
    });

    // Animate in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    return unsubscribe;
  }, []);

  const getStatusColor = () => {
    if (!networkState.online) return '#EF4444'; // red
    if (networkState.quality === '2g') return '#F97316'; // orange
    if (networkState.quality === '3g') return '#EAB308'; // yellow
    return '#22C55E'; // green
  };

  const getNetworkIcon = () => {
    if (!networkState.online) return 'cloud-offline';
    if (networkState.quality === 'wifi') return 'wifi';
    return 'cellular';
  };

  const getSignalBars = () => {
    const bars = {
      offline: 0,
      '2g': 1,
      '3g': 2,
      '4g': 3,
      wifi: 4,
      unknown: 2,
    };
    return bars[networkState.quality] || 2;
  };

  const getBatteryIcon = () => {
    const level = batteryState.level;
    if (batteryState.charging) return 'battery-charging';
    if (level > 0.75) return 'battery-full';
    if (level > 0.5) return 'battery-half';
    if (level > 0.25) return 'battery-half';
    return 'battery-dead';
  };

  const getBatteryColor = () => {
    if (batteryState.charging) return '#22C55E';
    if (batteryState.level < 0.2) return '#EF4444';
    if (batteryState.level < 0.5) return '#EAB308';
    return '#22C55E';
  };

  if (compact) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.compactContainer}>
        <View style={[styles.compactIndicator, { backgroundColor: getStatusColor() }]}>
          <Ionicons name={getNetworkIcon() as any} size={16} color="white" />
        </View>
        {showBattery && batteryState.level < 0.3 && (
          <View style={[styles.compactIndicator, { backgroundColor: getBatteryColor() }]}>
            <Ionicons name={getBatteryIcon() as any} size={16} color="white" />
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: getStatusColor(), transform: [{ translateY: slideAnim }] },
      ]}
    >
      <TouchableOpacity onPress={onPress} style={styles.content}>
        <View style={styles.leftSection}>
          <Ionicons name={getNetworkIcon() as any} size={20} color="white" />
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>

        <View style={styles.rightSection}>
          {showBattery && (
            <View style={styles.batteryContainer}>
              <Ionicons name={getBatteryIcon() as any} size={18} color="white" />
              <Text style={styles.batteryText}>{Math.round(batteryState.level * 100)}%</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Offline message */}
      {!networkState.online && (
        <View style={styles.offlineMessage}>
          <Text style={styles.offlineTitle}>Your data is saved on this device</Text>
          <Text style={styles.offlineSubtitle}>
            It will sync automatically when you're back online
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// Floating network status toast
export function NetworkStatusToast() {
  const [visible, setVisible] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState>({
    online: true,
    quality: 'unknown',
    type: 'unknown',
    isInternetReachable: null,
    details: null,
  });
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    const manager = getMobileAdaptiveSyncManager();
    let hideTimeout: NodeJS.Timeout;

    const unsubscribe = manager.subscribe(() => {
      const state = manager.getNetworkState();
      const wasOnline = networkState.online;
      setNetworkState(state);

      // Show toast on network change
      if (wasOnline !== state.online || state.quality === '2g') {
        setVisible(true);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();

        // Auto-hide after 3 seconds if online
        if (state.online && state.quality !== '2g') {
          hideTimeout = setTimeout(() => {
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }).start(() => setVisible(false));
          }, 3000);
        }
      }
    });

    return () => {
      unsubscribe();
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [networkState.online]);

  if (!visible) return null;

  const getToastColor = () => {
    if (!networkState.online) return '#EF4444';
    if (networkState.quality === '2g') return '#F97316';
    return '#22C55E';
  };

  const getMessage = () => {
    if (!networkState.online) return 'Offline - Data saved locally';
    if (networkState.quality === '2g') return 'Slow network - Data-saving mode active';
    return 'Back online - Syncing...';
  };

  return (
    <Animated.View style={[styles.toast, { backgroundColor: getToastColor(), opacity: fadeAnim }]}>
      <Ionicons
        name={networkState.online ? 'cloud-done' : 'cloud-offline'}
        size={20}
        color="white"
      />
      <Text style={styles.toastText}>{getMessage()}</Text>
    </Animated.View>
  );
}

// Sync button with status
interface SyncButtonProps {
  onSync?: () => Promise<void>;
  style?: any;
}

export function SyncButton({ onSync, style }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState>({
    online: true,
    quality: 'unknown',
    type: 'unknown',
    isInternetReachable: null,
    details: null,
  });
  const [spinAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    const manager = getMobileAdaptiveSyncManager();
    const unsubscribe = manager.subscribe(() => {
      setNetworkState(manager.getNetworkState());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (syncing) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.setValue(0);
    }
  }, [syncing]);

  const handleSync = async () => {
    if (syncing || !networkState.online) return;

    setSyncing(true);
    try {
      if (onSync) {
        await onSync();
      }
      getMobileAdaptiveSyncManager().recordSyncResult(true);
    } catch (error) {
      getMobileAdaptiveSyncManager().recordSyncResult(false);
    } finally {
      setSyncing(false);
    }
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity
      onPress={handleSync}
      disabled={syncing || !networkState.online}
      style={[
        styles.syncButton,
        !networkState.online && styles.syncButtonDisabled,
        syncing && styles.syncButtonSyncing,
        style,
      ]}
    >
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Ionicons
          name={syncing ? 'sync' : 'sync-outline'}
          size={24}
          color={networkState.online ? 'white' : '#9CA3AF'}
        />
      </Animated.View>
      <Text style={[styles.syncButtonText, !networkState.online && styles.syncButtonTextDisabled]}>
        {syncing ? 'Syncing...' : networkState.online ? 'Sync Now' : 'Offline'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  batteryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  batteryText: {
    color: 'white',
    fontSize: 12,
  },
  offlineMessage: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
  offlineTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  offlineSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  compactContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  compactIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toast: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  toastText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  syncButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  syncButtonSyncing: {
    backgroundColor: '#93C5FD',
  },
  syncButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  syncButtonTextDisabled: {
    color: '#9CA3AF',
  },
});

export default NetworkStatusBar;
