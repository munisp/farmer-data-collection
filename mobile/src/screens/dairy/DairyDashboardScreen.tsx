import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useColorScheme } from 'react-native';
import { COLORS } from '@/utils/constants';

export default function DairyDashboardScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const kpis = [
    { label: 'Total Cows', value: '0', icon: '🐄' },
    { label: 'Daily Milk (L)', value: '0', icon: '🥛' },
    { label: 'Breeding Active', value: '0', icon: '🧬' },
    { label: 'Health Alerts', value: '0', icon: '💊' },
  ];

  const actions = [
    { title: 'Herd Management', subtitle: 'Register and track cows', icon: '🐄' },
    { title: 'Milk Production', subtitle: 'Record daily yields', icon: '🥛' },
    { title: 'Breeding Records', subtitle: 'Track breeding cycles', icon: '🧬' },
    { title: 'Health Monitoring', subtitle: 'Vaccinations & treatments', icon: '💊' },
    { title: 'Supplier Marketplace', subtitle: 'Feed, vet drugs, services', icon: '🏪' },
    { title: 'Market & Processors', subtitle: 'Connect with buyers', icon: '🏭' },
  ];

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      accessibilityLabel="Dairy Dashboard"
    >
      {/* SmartAlex Teal Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Dairy Management
        </Text>
        <Text style={styles.headerSubtitle}>
          SmartAlex Digital Solution
        </Text>
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        {kpis.map((kpi, i) => (
          <View key={i} style={[styles.kpiCard, isDark && styles.kpiCardDark]}>
            <Text style={styles.kpiIcon}>{kpi.icon}</Text>
            <Text style={[styles.kpiValue, isDark && styles.textDark]}>{kpi.value}</Text>
            <Text style={[styles.kpiLabel, isDark && styles.textMutedDark]}>{kpi.label}</Text>
          </View>
        ))}
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Quick Actions</Text>
        {actions.map((action, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.actionCard, isDark && styles.actionCardDark]}
            accessibilityLabel={action.title}
            accessibilityHint={action.subtitle}
          >
            <Text style={styles.actionIcon}>{action.icon}</Text>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, isDark && styles.textDark]}>{action.title}</Text>
              <Text style={[styles.actionSubtitle, isDark && styles.textMutedDark]}>{action.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdfa' },
  containerDark: { backgroundColor: '#111827' },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 48,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    margin: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  kpiCardDark: { backgroundColor: '#1f2937', borderColor: '#374151' },
  kpiIcon: { fontSize: 24, marginBottom: 6 },
  kpiValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  kpiLabel: { fontSize: 12, color: '#6b7280', marginTop: 2, textAlign: 'center' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionCardDark: { backgroundColor: '#1f2937', borderColor: '#374151' },
  actionIcon: { fontSize: 28, marginRight: 14 },
  actionText: { flex: 1 },
  actionTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  actionSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  textDark: { color: '#f9fafb' },
  textMutedDark: { color: '#9ca3af' },
});
