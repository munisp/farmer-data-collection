/**
 * Biometric Authentication Service
 * Uses expo-local-authentication for fingerprint/face unlock
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

// Keys for secure storage
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const BIOMETRIC_TOKEN_KEY = 'biometric_auth_token';
const DEVICE_ID_KEY = 'device_id';

export interface BiometricCapabilities {
  isAvailable: boolean;
  biometricTypes: LocalAuthentication.AuthenticationType[];
  hasHardware: boolean;
  isEnrolled: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  warning?: string;
}

/**
 * Check if biometric authentication is available on the device
 */
export async function checkBiometricCapabilities(): Promise<BiometricCapabilities> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    return {
      isAvailable: hasHardware && isEnrolled,
      biometricTypes: supportedTypes,
      hasHardware,
      isEnrolled,
    };
  } catch (error) {
    console.error('[Biometric] Error checking capabilities:', error);
    return {
      isAvailable: false,
      biometricTypes: [],
      hasHardware: false,
      isEnrolled: false,
    };
  }
}

/**
 * Get human-readable name for biometric type
 */
export function getBiometricTypeName(types: LocalAuthentication.AuthenticationType[]): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face ID';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'Fingerprint';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'Iris';
  }
  return 'Biometric';
}

/**
 * Authenticate using biometrics
 */
export async function authenticateWithBiometrics(
  promptMessage: string = 'Authenticate to continue'
): Promise<BiometricAuthResult> {
  try {
    const capabilities = await checkBiometricCapabilities();
    
    if (!capabilities.isAvailable) {
      return {
        success: false,
        error: capabilities.hasHardware
          ? 'No biometrics enrolled. Please set up fingerprint or face recognition in your device settings.'
          : 'Biometric authentication is not available on this device.',
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // Allow PIN/password as fallback
      fallbackLabel: 'Use Passcode',
    });

    if (result.success) {
      return { success: true };
    }

    // Handle different error types
    if (result.error === 'user_cancel') {
      return { success: false, error: 'Authentication cancelled' };
    }
    if (result.error === 'user_fallback') {
      return { success: false, warning: 'User chose to use passcode' };
    }
    if (result.error === 'system_cancel') {
      return { success: false, error: 'Authentication was cancelled by the system' };
    }
    if (result.error === 'lockout') {
      return { success: false, error: 'Too many failed attempts. Please try again later.' };
    }

    return { success: false, error: result.error || 'Authentication failed' };
  } catch (error) {
    console.error('[Biometric] Authentication error:', error);
    return { success: false, error: 'An error occurred during authentication' };
  }
}

/**
 * Check if biometric authentication is enabled for the app
 */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    console.error('[Biometric] Error checking if enabled:', error);
    return false;
  }
}

/**
 * Enable biometric authentication for the app
 * Requires successful biometric authentication first
 */
export async function enableBiometricAuth(authToken: string): Promise<BiometricAuthResult> {
  try {
    // First verify biometrics work
    const authResult = await authenticateWithBiometrics('Verify your identity to enable biometric login');
    
    if (!authResult.success) {
      return authResult;
    }

    // Store the auth token securely
    await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, authToken);
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');

    return { success: true };
  } catch (error) {
    console.error('[Biometric] Error enabling:', error);
    return { success: false, error: 'Failed to enable biometric authentication' };
  }
}

/**
 * Disable biometric authentication for the app
 */
export async function disableBiometricAuth(): Promise<BiometricAuthResult> {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false');
    return { success: true };
  } catch (error) {
    console.error('[Biometric] Error disabling:', error);
    return { success: false, error: 'Failed to disable biometric authentication' };
  }
}

/**
 * Get stored auth token after successful biometric authentication
 */
export async function getStoredAuthToken(): Promise<string | null> {
  try {
    const isEnabled = await isBiometricEnabled();
    if (!isEnabled) {
      return null;
    }

    const authResult = await authenticateWithBiometrics('Authenticate to sign in');
    if (!authResult.success) {
      return null;
    }

    return await SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);
  } catch (error) {
    console.error('[Biometric] Error getting stored token:', error);
    return null;
  }
}

/**
 * Authenticate for sensitive operations (e.g., loan disbursement, large trades)
 */
export async function authenticateForSensitiveOperation(
  operationType: 'loan' | 'trade' | 'payout' | 'transfer' | 'settings'
): Promise<BiometricAuthResult> {
  const messages: Record<string, string> = {
    loan: 'Authenticate to approve loan disbursement',
    trade: 'Authenticate to confirm trade',
    payout: 'Authenticate to process payout',
    transfer: 'Authenticate to confirm transfer',
    settings: 'Authenticate to change security settings',
  };

  return authenticateWithBiometrics(messages[operationType] || 'Authenticate to continue');
}

/**
 * Generate and store a unique device ID
 */
export async function getOrCreateDeviceId(): Promise<string> {
  try {
    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    
    if (!deviceId) {
      // Generate a unique device ID
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }
    
    return deviceId;
  } catch (error) {
    console.error('[Biometric] Error getting device ID:', error);
    return `temp_${Date.now()}`;
  }
}

/**
 * Check if this is the primary device for the user
 */
export async function isPrimaryDevice(userId: string): Promise<boolean> {
  try {
    const primaryDeviceKey = `primary_device_${userId}`;
    const storedDeviceId = await SecureStore.getItemAsync(primaryDeviceKey);
    const currentDeviceId = await getOrCreateDeviceId();
    
    return storedDeviceId === currentDeviceId;
  } catch (error) {
    console.error('[Biometric] Error checking primary device:', error);
    return false;
  }
}

/**
 * Set this device as the primary device for the user
 */
export async function setPrimaryDevice(userId: string): Promise<boolean> {
  try {
    const primaryDeviceKey = `primary_device_${userId}`;
    const currentDeviceId = await getOrCreateDeviceId();
    
    await SecureStore.setItemAsync(primaryDeviceKey, currentDeviceId);
    return true;
  } catch (error) {
    console.error('[Biometric] Error setting primary device:', error);
    return false;
  }
}

export default {
  checkBiometricCapabilities,
  getBiometricTypeName,
  authenticateWithBiometrics,
  isBiometricEnabled,
  enableBiometricAuth,
  disableBiometricAuth,
  getStoredAuthToken,
  authenticateForSensitiveOperation,
  getOrCreateDeviceId,
  isPrimaryDevice,
  setPrimaryDevice,
};
