import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/utils/constants';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { register, isLoading } = useAuthStore();

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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>Create Account</Text>
          <Input label="Name" value={name} onChangeText={setName} placeholder="Your name" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="your@email.com" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />
          <Button title="Register" onPress={handleRegister} loading={isLoading} style={styles.button} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  content: { padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 32 },
  button: { marginTop: 16 },
});
