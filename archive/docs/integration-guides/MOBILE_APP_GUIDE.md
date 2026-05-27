# Mobile App Development Guide

## Overview

This guide provides comprehensive documentation for building a React Native mobile application that integrates with the Farmer Data Collection platform. The mobile app leverages the existing offline-first architecture and tRPC API endpoints.

---

## Architecture

### Technology Stack

- **Framework**: React Native 0.73+
- **Navigation**: React Navigation 6.x
- **State Management**: TanStack Query (React Query)
- **API Client**: tRPC Client
- **Offline Storage**: SQLite (via expo-sqlite or react-native-sqlite-storage)
- **Authentication**: JWT tokens with secure storage
- **Camera**: react-native-camera or expo-camera
- **Maps**: react-native-maps
- **Push Notifications**: Firebase Cloud Messaging (FCM)

### Offline-First Architecture

The mobile app follows the same offline-first principles as the web application:

1. **Local Database**: SQLite database mirrors the Drizzle schema
2. **Sync Queue**: Operations are queued when offline and synced when online
3. **Conflict Resolution**: Last-write-wins with timestamp-based resolution
4. **Background Sync**: Periodic background sync when app is in background

---

## Project Setup

### Prerequisites

```bash
# Install Node.js 18+
node --version

# Install React Native CLI
npm install -g react-native-cli

# For iOS development (macOS only)
gem install cocoapods

# For Android development
# Install Android Studio and Android SDK
```

### Initialize Project

```bash
# Create new React Native project
npx react-native init FarmerDataApp --template react-native-template-typescript

cd FarmerDataApp

# Install dependencies
npm install @trpc/client @trpc/react-query @tanstack/react-query
npm install @react-navigation/native @react-navigation/stack @react-navigation/bottom-tabs
npm install react-native-sqlite-storage
npm install react-native-camera
npm install react-native-maps
npm install @react-native-firebase/app @react-native-firebase/messaging
npm install react-native-keychain # For secure token storage
npm install date-fns # For date handling
```

---

## API Integration

### tRPC Client Setup

Create `src/lib/trpc.ts`:

```typescript
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../server/trpc'; // Import from backend
import AsyncStorage from '@react-native-async-storage/async-storage';

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient(baseUrl: string) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        async headers() {
          const token = await AsyncStorage.getItem('auth_token');
          return {
            authorization: token ? `Bearer ${token}` : '',
          };
        },
      }),
    ],
  });
}
```

### Query Client Setup

Create `src/lib/queryClient.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
```

### App Provider Setup

Create `src/App.tsx`:

```typescript
import React, { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTRPCClient } from './lib/trpc';
import { queryClient } from './lib/queryClient';
import { NavigationContainer } from '@react-navigation/native';
import { RootNavigator } from './navigation/RootNavigator';

const API_BASE_URL = 'https://your-api-domain.com'; // Replace with your API URL

export default function App() {
  const [trpcClient] = useState(() => createTRPCClient(API_BASE_URL));

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

---

## Offline Sync Implementation

### SQLite Database Setup

Create `src/database/schema.ts`:

```typescript
import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

export async function openDatabase() {
  return SQLite.openDatabase({
    name: 'farmer_data.db',
    location: 'default',
  });
}

export async function initializeDatabase() {
  const db = await openDatabase();

  // Create tables matching Drizzle schema
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS farms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      farm_name TEXT NOT NULL,
      farm_size REAL,
      farm_size_unit TEXT,
      location TEXT,
      latitude REAL,
      longitude REAL,
      soil_type TEXT,
      irrigation_type TEXT,
      created_at TEXT,
      updated_at TEXT,
      synced INTEGER DEFAULT 0
    );
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS crops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      farm_id INTEGER NOT NULL,
      crop_name TEXT NOT NULL,
      crop_variety TEXT,
      planting_date TEXT,
      expected_harvest_date TEXT,
      actual_harvest_date TEXT,
      area_planted REAL,
      area_unit TEXT,
      season TEXT,
      status TEXT,
      price_per_unit INTEGER,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      synced INTEGER DEFAULT 0
    );
  `);

  // Add more tables as needed...

  return db;
}
```

### Sync Queue Implementation

Create `src/sync/syncQueue.ts`:

```typescript
import { openDatabase } from '../database/schema';
import { trpc } from '../lib/trpc';
import NetInfo from '@react-native-community/netinfo';

interface SyncOperation {
  id: number;
  table: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
  timestamp: string;
}

export class SyncQueue {
  private db: any;
  private isSyncing = false;

  async initialize() {
    this.db = await openDatabase();
    await this.createSyncTable();
  }

  private async createSyncTable() {
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );
    `);
  }

  async addToQueue(table: string, operation: string, data: any) {
    await this.db.executeSql(
      `INSERT INTO sync_queue (table_name, operation, data, timestamp) VALUES (?, ?, ?, ?)`,
      [table, operation, JSON.stringify(data), new Date().toISOString()]
    );
  }

  async syncAll() {
    if (this.isSyncing) return;

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      console.log('No internet connection, skipping sync');
      return;
    }

    this.isSyncing = true;

    try {
      const [results] = await this.db.executeSql(
        `SELECT * FROM sync_queue WHERE synced = 0 ORDER BY timestamp ASC`
      );

      for (let i = 0; i < results.rows.length; i++) {
        const operation = results.rows.item(i);
        await this.syncOperation(operation);
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncOperation(operation: SyncOperation) {
    const data = JSON.parse(operation.data);

    try {
      // Call appropriate tRPC endpoint based on table and operation
      switch (operation.table) {
        case 'farms':
          if (operation.operation === 'create') {
            await trpc.farms.create.mutate(data);
          } else if (operation.operation === 'update') {
            await trpc.farms.update.mutate(data);
          }
          break;
        case 'crops':
          if (operation.operation === 'create') {
            await trpc.crops.create.mutate(data);
          } else if (operation.operation === 'update') {
            await trpc.crops.update.mutate(data);
          }
          break;
        // Add more cases...
      }

      // Mark as synced
      await this.db.executeSql(
        `UPDATE sync_queue SET synced = 1 WHERE id = ?`,
        [operation.id]
      );
    } catch (error) {
      console.error(`Failed to sync operation ${operation.id}:`, error);
      throw error;
    }
  }
}

export const syncQueue = new SyncQueue();
```

---

## Camera Integration

### Photo Capture for Crop Monitoring

Create `src/screens/CropPhotoScreen.tsx`:

```typescript
import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { RNCamera } from 'react-native-camera';
import { trpc } from '../lib/trpc';

export function CropPhotoScreen({ route, navigation }) {
  const { cropId } = route.params;
  const cameraRef = useRef<RNCamera>(null);
  const [isUploading, setIsUploading] = useState(false);

  const takePicture = async () => {
    if (cameraRef.current) {
      const options = { quality: 0.8, base64: true };
      const data = await cameraRef.current.takePictureAsync(options);

      setIsUploading(true);
      try {
        // Upload photo to server
        await trpc.crops.uploadPhoto.mutate({
          cropId,
          photo: data.base64,
        });

        navigation.goBack();
      } catch (error) {
        console.error('Upload failed:', error);
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <RNCamera
        ref={cameraRef}
        style={styles.camera}
        type={RNCamera.Constants.Type.back}
        captureAudio={false}
      />
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={takePicture}
          disabled={isUploading}
        >
          <Text style={styles.captureText}>
            {isUploading ? 'Uploading...' : 'Capture'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureText: { fontSize: 16, fontWeight: 'bold' },
});
```

---

## Push Notifications

### Firebase Setup

Create `src/notifications/firebase.ts`:

```typescript
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function requestNotificationPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Notification permission granted');
    return true;
  }
  return false;
}

export async function getFCMToken() {
  const token = await messaging().getToken();
  await AsyncStorage.setItem('fcm_token', token);
  return token;
}

export function setupNotificationListeners() {
  // Foreground notifications
  messaging().onMessage(async (remoteMessage) => {
    console.log('Foreground notification:', remoteMessage);
    // Show local notification
  });

  // Background/Quit notifications
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('Background notification:', remoteMessage);
  });

  // Notification opened app
  messaging().onNotificationOpenedApp((remoteMessage) => {
    console.log('Notification opened app:', remoteMessage);
    // Navigate to relevant screen
  });
}
```

---

## Example Screens

### Farm List Screen

```typescript
import React from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { trpc } from '../lib/trpc';

export function FarmListScreen({ navigation }) {
  const { data: farms, isLoading } = trpc.farms.getAll.useQuery();

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={farms}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.farmCard}
            onPress={() => navigation.navigate('FarmDetail', { farmId: item.id })}
          >
            <Text style={styles.farmName}>{item.farmName}</Text>
            <Text style={styles.farmDetails}>
              {item.farmSize} {item.farmSizeUnit} • {item.location}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  farmCard: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  farmName: { fontSize: 18, fontWeight: 'bold' },
  farmDetails: { fontSize: 14, color: '#666', marginTop: 4 },
});
```

---

## Testing

### Unit Tests

```bash
npm install --save-dev @testing-library/react-native jest
```

Example test:

```typescript
import { render, waitFor } from '@testing-library/react-native';
import { FarmListScreen } from '../screens/FarmListScreen';

test('renders farm list', async () => {
  const { getByText } = render(<FarmListScreen />);
  
  await waitFor(() => {
    expect(getByText('My Farm')).toBeTruthy();
  });
});
```

---

## Deployment

### iOS Deployment

```bash
cd ios
pod install
cd ..

# Build for release
npx react-native run-ios --configuration Release
```

### Android Deployment

```bash
# Generate release APK
cd android
./gradlew assembleRelease

# APK location: android/app/build/outputs/apk/release/app-release.apk
```

---

## Best Practices

1. **Offline-First**: Always save to local database first, then sync
2. **Error Handling**: Handle network errors gracefully with retry logic
3. **Battery Optimization**: Use background sync sparingly
4. **Data Validation**: Validate data before syncing to server
5. **Security**: Store tokens securely using react-native-keychain
6. **Performance**: Use FlatList with pagination for large datasets
7. **User Feedback**: Show sync status and offline indicators

---

## API Endpoints Reference

All tRPC endpoints from the web application are available:

- `trpc.farms.*` - Farm management
- `trpc.crops.*` - Crop records
- `trpc.livestock.*` - Livestock management
- `trpc.marketplace.*` - Marketplace operations
- `trpc.export.*` - Data export
- `trpc.mlPredictions.*` - ML predictions

See the main API documentation for complete endpoint details.

---

## Support

For issues or questions:
- GitHub: https://github.com/your-repo/farmer-data-app
- Email: support@farmerdataapp.com
- Documentation: https://docs.farmerdataapp.com
