import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { Header } from '@/components/shared/Header';
import { Card } from '@/components/ui/Card';
import { COLORS } from '@/utils/constants';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [biometricEnabled, setBiometricEnabled] = React.useState(false);

  return (
    <View style={styles.container}>
      <Header title="Settings" showBack />
      <ScrollView style={styles.content}>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Push Notifications</Text>
            <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Biometric Login</Text>
            <Switch value={biometricEnabled} onValueChange={setBiometricEnabled} />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  card: { padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  label: { fontSize: 16, color: COLORS.text },
});
