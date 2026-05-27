import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuthStore } from './src/stores/authStore';
import { database } from './src/services/database';
import { enhancedSyncService } from './src/services/sync/enhanced-sync';
import { COLORS } from './src/utils/constants';
import { OfflineBanner } from './src/components/SyncStatusBar';

// Import screens (placeholders - will be created)
import AppNavigator from './src/navigation/AppNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const { isAuthenticated, loadUser } = useAuthStore();

    useEffect(() => {
      async function prepare() {
        try {
          await database.init();
          await loadUser();
          // Start background sync service (every 5 minutes)
          enhancedSyncService.startBackgroundSync(5 * 60 * 1000);
        } catch (error) {
          console.error('App initialization failed:', error);
        } finally {
          setIsReady(true);
        }
      }

      prepare();

      // Cleanup on unmount
      return () => {
        enhancedSyncService.stopBackgroundSync();
      };
    }, []);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

    return (
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer>
            <OfflineBanner />
            <AppNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
