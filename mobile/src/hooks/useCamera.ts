import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, IMAGE_QUALITY } from '@/utils/constants';

export const useCamera = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  };

  const takePicture = async (): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setError('Camera permission denied');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: IMAGE_QUALITY,
      });

      if (result.canceled) {
        return null;
      }

      const optimizedUri = await optimizeImage(result.assets[0].uri);
      return optimizedUri;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const pickFromGallery = async (): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Gallery permission denied');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: IMAGE_QUALITY,
      });

      if (result.canceled) {
        return null;
      }

      const optimizedUri = await optimizeImage(result.assets[0].uri);
      return optimizedUri;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const optimizeImage = async (uri: string): Promise<string> => {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT } }],
      { compress: IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    return manipResult.uri;
  };

  return {
    loading,
    error,
    takePicture,
    pickFromGallery,
  };
};
