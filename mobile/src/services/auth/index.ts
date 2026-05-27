import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { STORAGE_KEYS } from '@/utils/constants';
import type { User, AuthTokens } from '@/types/models';

class AuthService {
  // Token management
  async saveTokens(tokens: AuthTokens): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, tokens.accessToken);

    if (tokens.refreshToken) {
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    } else {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
    }
  }

  async getAccessToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  }

  async getRefreshToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
  }

  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
  }

  // User data management
  async saveUser(user: User): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  }

  async getUser(): Promise<User | null> {
    const userData = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
    return userData ? JSON.parse(userData) : null;
  }

  async clearUser(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
  }

  // Biometric authentication
  async isBiometricSupported(): Promise<boolean> {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return compatible && enrolled;
  }

  async isBiometricEnabled(): Promise<boolean> {
    const enabled = await SecureStore.getItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED);
    return enabled === 'true';
  }

  async setBiometricEnabled(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled.toString());
  }

  async authenticateWithBiometric(): Promise<boolean> {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access your account',
        fallbackLabel: 'Use passcode',
        disableDeviceFallback: false,
      });
      return result.success;
    } catch (error) {
      console.error('[Auth] Biometric authentication failed:', error);
      return false;
    }
  }

  // Session management
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null;
  }

  async logout(): Promise<void> {
    await this.clearTokens();
    await this.clearUser();
  }
}

export const authService = new AuthService();
