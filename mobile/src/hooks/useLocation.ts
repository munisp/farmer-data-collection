import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import type { Location as LocationType } from '@/types/models';

export const useLocation = () => {
  const [location, setLocation] = useState<LocationType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPermissions = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  };

  const getCurrentLocation = async (): Promise<LocationType | null> => {
    setLoading(true);
    setError(null);

    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setError('Location permission denied');
        return null;
      }

      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const locationData: LocationType = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy || undefined,
        timestamp: result.timestamp,
      };

      setLocation(locationData);
      return locationData;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const watchLocation = (callback: (location: LocationType) => void) => {
    let subscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setError('Location permission denied');
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (result) => {
          const locationData: LocationType = {
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
            accuracy: result.coords.accuracy || undefined,
            timestamp: result.timestamp,
          };
          setLocation(locationData);
          callback(locationData);
        }
      );
    };

    startWatching();

    return () => {
      subscription?.remove();
    };
  };

  return {
    location,
    loading,
    error,
    getCurrentLocation,
    watchLocation,
  };
};
