import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, useColorScheme } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/utils/constants';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { register, isLoading } = useAuthStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    try {
      await register(email, password, name);
    } catch (error) {
      Alert.alert('Registration Failed', String(error));
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, isDark && styles.containerDark]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        accessibilityLabel="Register screen"
        accessibilityRole="scrollbar"
        contentContainerStyle={styles.scrollContent}
      >
        {/* SmartAlex Teal Branded Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>👤</Text>
          </View>
          <Text accessibilityRole="header" style={styles.headerTitle}>Create Account</Text>
          <Text style={styles.headerSubtitle}>Join the FarmConnect platform</Text>
        </View>

        <View style={styles.content}>
          <Input label="Full Name" value={name} onChangeText={setName} placeholder="Your name" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="farmer@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />
          <Button title="Create Account" onPress={handleRegister} loading={isLoading} style={styles.button} />
          <Text style={[styles.signinText, isDark && { color: '#9ca3af' }]}>
            Already have an account? <Text style={styles.signinLink}>Sign in</Text>
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
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconText: { fontSize: 24 },
  headerTitle: {
    fontSize: 24,
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
  content: { padding: 24, paddingTop: 24 },
  button: { marginTop: 16, backgroundColor: COLORS.primary, borderRadius: 12 },
  signinText: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', marginTop: 20 },
  signinLink: { color: COLORS.primary, fontWeight: '600' },
});
