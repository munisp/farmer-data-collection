import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { Header } from '@/components/shared/Header';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS } from '@/utils/constants';
import { useNavigation } from '@react-navigation/native';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Header title="Profile" />
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Avatar name={user?.name} size={80} />
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
        <Card style={styles.card}>
          <Button title="Edit Profile" onPress={() => navigation.navigate('ProfileEdit' as never)} variant="outline" />
          <Button title="Settings" onPress={() => navigation.navigate('Settings' as never)} variant="outline" style={styles.button} />
          <Button title="About" onPress={() => navigation.navigate('About' as never)} variant="outline" style={styles.button} />
          <Button title="Logout" onPress={logout} variant="danger" style={styles.button} />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  header: { alignItems: 'center', marginBottom: 24 },
  name: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginTop: 16 },
  email: { fontSize: 16, color: COLORS.textLight, marginTop: 4 },
  card: { padding: 16 },
  button: { marginTop: 12 },
});
