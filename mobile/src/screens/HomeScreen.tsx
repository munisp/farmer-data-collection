import React, { useEffect } from 'react';
import { colors } from '@/lib/theme';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/stores/authStore';
import { useSyncStore } from '@/stores/syncStore';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/utils/constants';

export default function HomeScreen() {
  const { user, logout } = useAuthStore();
  const { sync, syncing, pendingCount, lastSync, updatePendingCount } = useSyncStore();
  const navigation = useNavigation<any>();

  useEffect(() => {
    updatePendingCount();
  }, []);

  return (
    <ScrollView
      style={styles.container}
      accessibilityLabel="Home screen"
      accessibilityRole="scrollbar"
    >
      <View style={styles.header} accessibilityRole="header">
        <Text
          style={styles.title}
          accessibilityRole="header"
          accessibilityLabel={`Welcome, ${user?.name || 'Farmer'}`}
        >
          Welcome, {user?.name}
        </Text>
        <Text style={styles.subtitle} accessibilityLabel="Farmer Data Collection application">
          Farmer Data Collection
        </Text>
      </View>

      <View style={styles.syncCard} accessibilityLabel="Sync status card">
        <Text style={styles.cardTitle} accessibilityRole="header">Sync Status</Text>
        <Text
          style={styles.syncInfo}
          accessibilityLabel={syncing ? 'Currently syncing' : `Last sync: ${lastSync ? new Date(lastSync).toLocaleString() : 'Never'}`}
        >
          {syncing ? 'Syncing...' : `Last sync: ${lastSync ? new Date(lastSync).toLocaleString() : 'Never'}`}
        </Text>
        <Text
          style={styles.syncInfo}
          accessibilityLabel={`${pendingCount} pending items to sync`}
        >
          Pending items: {pendingCount}
        </Text>
        <Button
          title="Sync Now"
          onPress={sync}
          loading={syncing}
          style={styles.syncButton}
          accessibilityLabel="Sync data now"
          accessibilityHint="Uploads pending data and downloads updates from server"
        />
      </View>

      <View style={styles.quickActions} accessibilityLabel="Quick actions section">
        <Text style={styles.sectionTitle} accessibilityRole="header">Quick Actions</Text>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Farm', { screen: 'HarvestCreate' })}
          accessibilityLabel="Add Harvest"
          accessibilityHint="Navigate to record new harvest data"
          accessibilityRole="button"
        >
          <Text style={styles.actionTitle}>🌾 Add Harvest</Text>
          <Text style={styles.actionSubtitle}>Record new harvest data</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Farm', { screen: 'ExpenseList' })}
          accessibilityLabel="Add Expense"
          accessibilityHint="Navigate to track farm expenses"
          accessibilityRole="button"
        >
          <Text style={styles.actionTitle}>💰 Add Expense</Text>
          <Text style={styles.actionSubtitle}>Track farm expenses</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Market', { screen: 'MarketplaceBrowse' })}
          accessibilityLabel="Browse Marketplace"
          accessibilityHint="Navigate to buy and sell products"
          accessibilityRole="button"
        >
          <Text style={styles.actionTitle}>🛒 Browse Marketplace</Text>
          <Text style={styles.actionSubtitle}>Buy and sell products</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Farm', { screen: 'CropDashboard' })}
          accessibilityLabel="Crop Dashboard"
          accessibilityHint="Navigate to view crop status"
          accessibilityRole="button"
        >
          <Text style={styles.actionTitle}>🌱 Crop Dashboard</Text>
          <Text style={styles.actionSubtitle}>View crop status & health</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Farm', { screen: 'AIChatAdvisor' })}
          accessibilityLabel="AI Advisor"
          accessibilityHint="Navigate to chat with AI farming advisor"
          accessibilityRole="button"
        >
          <Text style={styles.actionTitle}>🤖 AI Advisor</Text>
          <Text style={styles.actionSubtitle}>Chat with AI farming expert</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Finance', { screen: 'MobileMoney' })}
          accessibilityLabel="Mobile Money"
          accessibilityHint="Navigate to mobile payments"
          accessibilityRole="button"
        >
          <Text style={styles.actionTitle}>📱 Mobile Money</Text>
          <Text style={styles.actionSubtitle}>Send & receive payments</Text>
        </TouchableOpacity>
      </View>

      <Button
        title="Logout"
        onPress={logout}
        variant="outline"
        style={styles.logoutButton}
        accessibilityLabel="Logout"
        accessibilityHint="Sign out of your account"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 24, paddingTop: 40 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.text },
  subtitle: { fontSize: 16, color: COLORS.textLight, marginTop: 4 },
  syncCard: { margin: 16, padding: 16, backgroundColor: colors.gray50, borderRadius: 12 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  syncInfo: { fontSize: 14, color: COLORS.textLight, marginBottom: 4 },
  syncButton: { marginTop: 12 },
  quickActions: { margin: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  actionCard: { backgroundColor: colors.white, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, minHeight: 64 },
  actionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  actionSubtitle: { fontSize: 14, color: COLORS.textLight, marginTop: 4 },
  logoutButton: { margin: 16, marginTop: 32 },
});
