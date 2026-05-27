/**
 * Equipment Fleet Tracking & Management Screen
 * Features: GPS tracking, AB guidance, predictive maintenance, EaaS marketplace, ISOBUS
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';

type Equipment = {
  id: number;
  name: string;
  type: string;
  status: string;
  lat: number;
  lon: number;
  speed: number;
  fuel: number;
  engineHours: number;
};

type MaintenanceAlert = {
  component: string;
  wearPct: number;
  daysToFailure: number;
  priority: string;
  action: string;
  cost: number;
};

export default function EquipmentFleetScreen() {
  const [activeTab, setActiveTab] = useState<'tracking' | 'maintenance' | 'marketplace'>('tracking');

  const [equipment] = useState<Equipment[]>([
    { id: 1, name: 'JD 6130R Tractor', type: 'tractor', status: 'operating', lat: -1.282, lon: 36.821, speed: 8.5, fuel: 72, engineHours: 4523 },
    { id: 2, name: 'AGCO Sprayer 3000', type: 'sprayer', status: 'idle', lat: -1.283, lon: 36.822, speed: 0, fuel: 45, engineHours: 1890 },
    { id: 3, name: 'Massey Ferguson 385', type: 'tractor', status: 'maintenance', lat: -1.280, lon: 36.820, speed: 0, fuel: 60, engineHours: 6780 },
  ]);

  const [alerts] = useState<MaintenanceAlert[]>([
    { component: 'Engine Oil', wearPct: 78, daysToFailure: 45, priority: 'medium', action: 'Schedule oil change within 45 days', cost: 150 },
    { component: 'Air Filter', wearPct: 92, daysToFailure: 12, priority: 'high', action: 'Replace air filter immediately', cost: 45 },
    { component: 'Hydraulic Fluid', wearPct: 35, daysToFailure: 180, priority: 'low', action: 'Monitor at next service', cost: 200 },
  ]);

  const setupGuidance = () => {
    Alert.alert('AB Guidance Setup',
      'Drive to Point A at one end of the field, then drive to Point B at the other end.\n\n' +
      'The system will generate parallel lines based on your implement width.\n\n' +
      'Compatible with AgOpenGPS (open-source autosteer).',
      [{ text: 'Set Point A', onPress: () => {} }, { text: 'Cancel', style: 'cancel' }]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Equipment Fleet</Text>
      <Text style={styles.subtitle}>GPS tracking, AB guidance, predictive maintenance</Text>

      <View style={styles.tabBar}>
        {(['tracking', 'maintenance', 'marketplace'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.activeTab]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}><Text style={styles.statValue}>{equipment.length}</Text><Text style={styles.statLabel}>Total</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{equipment.filter(e => e.status === 'operating').length}</Text><Text style={styles.statLabel}>Operating</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{alerts.filter(a => a.priority === 'high').length}</Text><Text style={styles.statLabel}>Alerts</Text></View>
      </View>

      {activeTab === 'tracking' && (
        <View>
          <TouchableOpacity style={styles.actionButton} onPress={setupGuidance}>
            <Text style={styles.actionButtonText}>Setup AB Guidance</Text>
          </TouchableOpacity>
          {equipment.map(eq => (
            <View key={eq.id} style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{eq.name}</Text>
                <Text style={[styles.badge,
                  eq.status === 'operating' ? styles.badgeGreen : eq.status === 'maintenance' ? styles.badgeOrange : styles.badgeGray
                ]}>{eq.status}</Text>
              </View>
              <Text style={styles.cardDetail}>Speed: {eq.speed} km/h | Fuel: {eq.fuel}% | Hours: {eq.engineHours}</Text>
              <Text style={styles.cardDetail}>GPS: {eq.lat.toFixed(4)}, {eq.lon.toFixed(4)}</Text>
            </View>
          ))}
        </View>
      )}

      {activeTab === 'maintenance' && (
        <View>
          {alerts.map((alert, i) => (
            <View key={i} style={[styles.card, alert.priority === 'high' ? styles.cardHighlight : {}]}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{alert.component}</Text>
                <Text style={[styles.badge,
                  alert.priority === 'high' ? styles.badgeRed : alert.priority === 'medium' ? styles.badgeOrange : styles.badgeGray
                ]}>{alert.priority.toUpperCase()}</Text>
              </View>
              <View style={styles.progressRow}>
                <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${alert.wearPct}%`, backgroundColor: alert.wearPct > 80 ? '#f44336' : alert.wearPct > 50 ? '#ff9800' : '#4caf50' }]} /></View>
                <Text style={styles.progressText}>{alert.wearPct}%</Text>
              </View>
              <Text style={styles.cardDetail}>Days to failure: {alert.daysToFailure} | Est. cost: ${alert.cost}</Text>
              <Text style={styles.cardAction}>{alert.action}</Text>
            </View>
          ))}
        </View>
      )}

      {activeTab === 'marketplace' && (
        <View>
          <Text style={styles.sectionTitle}>Equipment-as-a-Service</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hire Equipment Near You</Text>
            <Text style={styles.cardDetail}>Search for tractors, sprayers, harvesters within your area. Book by hour, hectare, or day.</Text>
            <TouchableOpacity style={[styles.actionButton, { marginTop: 8 }]} onPress={() => Alert.alert('Search', 'Uses GPS + Haversine distance to find nearby equipment')}>
              <Text style={styles.actionButtonText}>Search Nearby Equipment</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>List Your Equipment</Text>
            <Text style={styles.cardDetail}>Earn income by renting out idle equipment. Set your own rates and availability.</Text>
            <Text style={styles.cardDetail}>5% platform fee on all bookings.</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  tabBar: { flexDirection: 'row', marginBottom: 16 },
  tab: { flex: 1, padding: 10, alignItems: 'center', backgroundColor: '#e0e0e0', borderRadius: 8, marginHorizontal: 2 },
  activeTab: { backgroundColor: '#ff9800' },
  tabText: { color: '#333', fontWeight: '600' },
  activeTabText: { color: '#fff' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  stat: { alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 8, flex: 1, marginHorizontal: 4 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#ff9800' },
  statLabel: { fontSize: 11, color: '#888' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  actionButton: { backgroundColor: '#ff9800', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  actionButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, elevation: 2 },
  cardHighlight: { borderLeftWidth: 3, borderLeftColor: '#f44336' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDetail: { fontSize: 13, color: '#666', marginTop: 2 },
  cardAction: { fontSize: 13, color: '#ff9800', marginTop: 4, fontWeight: '500' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 11, overflow: 'hidden' },
  badgeGreen: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
  badgeOrange: { backgroundColor: '#fff3e0', color: '#e65100' },
  badgeRed: { backgroundColor: '#ffebee', color: '#c62828' },
  badgeGray: { backgroundColor: '#f5f5f5', color: '#757575' },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  progressBar: { flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 },
  progressFill: { height: 8, borderRadius: 4 },
  progressText: { marginLeft: 8, fontSize: 12, color: '#666' },
});
