import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { useSyncStore } from '@/stores/syncStore';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/utils/constants';

export default function HomeScreen() {
  const { user, logout } = useAuthStore();
  const { sync, syncing, pendingCount, lastSync, updatePendingCount } = useSyncStore();

  useEffect(() => {
    updatePendingCount();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome, {user?.name}</Text>
        <Text style={styles.subtitle}>Farmer Data Collection</Text>
      </View>

      <View style={styles.syncCard}>
        <Text style={styles.cardTitle}>Sync Status</Text>
        <Text style={styles.syncInfo}>
          {syncing ? 'Syncing...' : `Last sync: ${lastSync ? new Date(lastSync).toLocaleString() : 'Never'}`}
        </Text>
        <Text style={styles.syncInfo}>Pending items: {pendingCount}</Text>
        <Button
          title="Sync Now"
          onPress={sync}
          loading={syncing}
          style={styles.syncButton}
        />
      </View>

      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <TouchableOpacity style={styles.actionCard}>
          <Text style={styles.actionTitle}>Add Harvest</Text>
          <Text style={styles.actionSubtitle}>Record new harvest data</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard}>
          <Text style={styles.actionTitle}>Add Expense</Text>
          <Text style={styles.actionSubtitle}>Track farm expenses</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard}>
          <Text style={styles.actionTitle}>Browse Marketplace</Text>
          <Text style={styles.actionSubtitle}>Buy and sell products</Text>
        </TouchableOpacity>
      </View>

      <Button title="Logout" onPress={logout} variant="outline" style={styles.logoutButton} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 24, paddingTop: 40 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  subtitle: { fontSize: 16, color: COLORS.textLight, marginTop: 4 },
  syncCard: { margin: 16, padding: 16, backgroundColor: '#f9fafb', borderRadius: 12 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  syncInfo: { fontSize: 14, color: COLORS.textLight, marginBottom: 4 },
  syncButton: { marginTop: 12 },
  quickActions: { margin: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  actionCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  actionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  actionSubtitle: { fontSize: 14, color: COLORS.textLight, marginTop: 4 },
  logoutButton: { margin: 16, marginTop: 32 },
});
