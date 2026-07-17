import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, useColorScheme } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/utils/constants';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      await login(email, password);
    } catch (err) {
      Alert.alert('Login Failed', error || 'Please check your credentials');
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      accessibilityLabel="Login screen"
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* SmartAlex Teal Gradient Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>🌱</Text>
          </View>
          <Text
            style={styles.headerTitle}
            accessibilityRole="header"
            accessibilityLabel="FarmConnect"
          >
            FarmConnect
          </Text>
          <Text style={styles.headerSubtitle}>
            Agricultural Finance Platform
          </Text>
        </View>

        <View style={styles.content} accessibilityRole="form">
          <Text style={[styles.subtitle, isDark && styles.subtitleDark]} accessibilityLabel="Sign in to your account">
            Sign in to your account to continue
          </Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="farmer@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Email address input"
            accessibilityHint="Enter your email address to login"
          />

          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            autoComplete="password"
            accessibilityLabel="Password input"
            accessibilityHint="Enter your password to login"
          />

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            style={styles.button}
            accessibilityLabel="Sign in button"
            accessibilityHint="Tap to sign in with your credentials"
          />

          <Text style={[styles.signupText, isDark && styles.signupTextDark]}>
            Don't have an account?{' '}
            <Text style={styles.signupLink}>Sign up</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdfa' },
  containerDark: { backgroundColor: COLORS.backgroundDark },
  scrollContent: { flexGrow: 1 },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconText: { fontSize: 28 },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 4,
  },
  content: { padding: 24, paddingTop: 32 },
  subtitle: {
    fontSize: 15,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 24,
  },
  subtitleDark: { color: '#9ca3af' },
  button: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  signupText: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 20,
  },
  signupTextDark: { color: '#9ca3af' },
  signupLink: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});
