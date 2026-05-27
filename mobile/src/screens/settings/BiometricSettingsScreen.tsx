/**
 * Biometric Settings Screen
 * Allow users to enable/disable biometric authentication
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  checkBiometricCapabilities,
  getBiometricTypeName,
  isBiometricEnabled,
  enableBiometricAuth,
  disableBiometricAuth,
  authenticateForSensitiveOperation,
  BiometricCapabilities,
} from '../../services/biometric';

export default function BiometricSettingsScreen() {
  const [capabilities, setCapabilities] = useState<BiometricCapabilities | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    loadBiometricStatus();
  }, []);

  const loadBiometricStatus = async () => {
    setIsLoading(true);
    try {
      const caps = await checkBiometricCapabilities();
      setCapabilities(caps);
      
      if (caps.isAvailable) {
        const enabled = await isBiometricEnabled();
        setIsEnabled(enabled);
      }
    } catch (error) {
      console.error('Error loading biometric status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBiometric = async (value: boolean) => {
    if (isToggling) return;
    
    setIsToggling(true);
    try {
      if (value) {
        // Enable biometric auth
        // In a real app, you'd get the auth token from your auth context
        const mockAuthToken = 'user_auth_token_here';
        const result = await enableBiometricAuth(mockAuthToken);
        
        if (result.success) {
          setIsEnabled(true);
          Alert.alert(
            'Success',
            `${getBiometricTypeName(capabilities?.biometricTypes || [])} login enabled`
          );
        } else {
          Alert.alert('Error', result.error || 'Failed to enable biometric login');
        }
      } else {
        // Disable biometric auth - require authentication first
        const authResult = await authenticateForSensitiveOperation('settings');
        
        if (authResult.success) {
          const result = await disableBiometricAuth();
          if (result.success) {
            setIsEnabled(false);
            Alert.alert('Success', 'Biometric login disabled');
          } else {
            Alert.alert('Error', result.error || 'Failed to disable biometric login');
          }
        } else if (authResult.error) {
          Alert.alert('Authentication Required', authResult.error);
        }
      }
    } catch (error) {
      console.error('Error toggling biometric:', error);
      Alert.alert('Error', 'An error occurred. Please try again.');
    } finally {
      setIsToggling(false);
    }
  };

  const biometricTypeName = capabilities
    ? getBiometricTypeName(capabilities.biometricTypes)
    : 'Biometric';

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.loadingText}>Loading security settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={48} color="#2E7D32" />
        <Text style={styles.title}>Security Settings</Text>
        <Text style={styles.subtitle}>Protect your account with biometric authentication</Text>
      </View>

      <View style={styles.content}>
        {/* Biometric Status Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons
              name={capabilities?.biometricTypes.includes(2) ? 'scan' : 'finger-print'}
              size={24}
              color="#2E7D32"
            />
            <Text style={styles.cardTitle}>{biometricTypeName} Login</Text>
          </View>

          {capabilities?.isAvailable ? (
            <>
              <Text style={styles.cardDescription}>
                Use {biometricTypeName.toLowerCase()} to quickly and securely sign in to your account
                and approve sensitive transactions.
              </Text>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>
                  Enable {biometricTypeName}
                </Text>
                <Switch
                  value={isEnabled}
                  onValueChange={handleToggleBiometric}
                  disabled={isToggling}
                  trackColor={{ false: '#E0E0E0', true: '#81C784' }}
                  thumbColor={isEnabled ? '#2E7D32' : '#BDBDBD'}
                />
              </View>

              {isEnabled && (
                <View style={styles.enabledInfo}>
                  <Ionicons name="checkmark-circle" size={20} color="#2E7D32" />
                  <Text style={styles.enabledText}>
                    {biometricTypeName} authentication is active
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.unavailableContainer}>
              <Ionicons name="alert-circle" size={24} color="#F57C00" />
              <Text style={styles.unavailableText}>
                {capabilities?.hasHardware
                  ? `No ${biometricTypeName.toLowerCase()} enrolled. Please set up biometrics in your device settings.`
                  : 'Biometric authentication is not available on this device.'}
              </Text>
              {capabilities?.hasHardware && (
                <TouchableOpacity style={styles.setupButton}>
                  <Text style={styles.setupButtonText}>Open Device Settings</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Security Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle" size={24} color="#1976D2" />
            <Text style={styles.cardTitle}>How it works</Text>
          </View>

          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <Ionicons name="lock-closed" size={18} color="#666" />
              <Text style={styles.infoText}>
                Your biometric data never leaves your device
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="key" size={18} color="#666" />
              <Text style={styles.infoText}>
                Authentication tokens are stored securely
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="shield" size={18} color="#666" />
              <Text style={styles.infoText}>
                Required for loan approvals and large transactions
              </Text>
            </View>
          </View>
        </View>

        {/* Sensitive Operations Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="warning" size={24} color="#F57C00" />
            <Text style={styles.cardTitle}>Protected Actions</Text>
          </View>

          <Text style={styles.cardDescription}>
            The following actions will require biometric verification when enabled:
          </Text>

          <View style={styles.actionsList}>
            <View style={styles.actionItem}>
              <Ionicons name="cash" size={18} color="#2E7D32" />
              <Text style={styles.actionText}>Loan disbursements</Text>
            </View>
            <View style={styles.actionItem}>
              <Ionicons name="swap-horizontal" size={18} color="#2E7D32" />
              <Text style={styles.actionText}>Large trades on exchange</Text>
            </View>
            <View style={styles.actionItem}>
              <Ionicons name="send" size={18} color="#2E7D32" />
              <Text style={styles.actionText}>Money transfers</Text>
            </View>
            <View style={styles.actionItem}>
              <Ionicons name="settings" size={18} color="#2E7D32" />
              <Text style={styles.actionText}>Security settings changes</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginLeft: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  toggleLabel: {
    fontSize: 16,
    color: '#212121',
  },
  enabledInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  enabledText: {
    fontSize: 14,
    color: '#2E7D32',
    marginLeft: 8,
  },
  unavailableContainer: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
  },
  unavailableText: {
    fontSize: 14,
    color: '#E65100',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  setupButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F57C00',
    borderRadius: 8,
  },
  setupButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  infoList: {
    marginTop: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    flex: 1,
  },
  actionsList: {
    marginTop: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 14,
    color: '#212121',
    marginLeft: 12,
  },
});
