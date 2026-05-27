/**
 * Drone Control & Flight Monitor Screen
 * Features: flight planning, live telemetry, spray prescriptions, drift risk
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';

type FlightPlan = {
  id: string;
  type: string;
  area: number;
  time: number;
  status: string;
  waypoints: number;
};

type DroneStatus = {
  id: string;
  model: string;
  battery: number;
  status: string;
  altitude: number;
  speed: number;
};

export default function DroneControlScreen() {
  const [activeTab, setActiveTab] = useState<'flights' | 'fleet' | 'spray'>('flights');
  const [loading, setLoading] = useState(false);

  const [flights] = useState<FlightPlan[]>([
    { id: 'FP-001', type: 'survey', area: 12.5, time: 18, status: 'planned', waypoints: 84 },
    { id: 'FP-002', type: 'spray', area: 8.2, time: 25, status: 'completed', waypoints: 156 },
    { id: 'FP-003', type: 'scout', area: 5.0, time: 12, status: 'in_progress', waypoints: 42 },
  ]);

  const [drones] = useState<DroneStatus[]>([
    { id: 'DRONE-001', model: 'DJI Agras T40', battery: 85, status: 'idle', altitude: 0, speed: 0 },
    { id: 'DRONE-002', model: 'DJI Mavic 3M', battery: 92, status: 'idle', altitude: 0, speed: 0 },
  ]);

  const planNewFlight = () => {
    Alert.alert('Plan Flight', 'Select farm boundary on map to generate flight plan. Requires GPS enabled.', [
      { text: 'Survey (NDVI)', onPress: () => {} },
      { text: 'Spray', onPress: () => {} },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const checkDriftRisk = () => {
    const windSpeed = 4.5;
    const temp = 28;
    const humidity = 55;
    const driftIndex = (windSpeed / 15) * 0.5 + (temp > 30 ? 0.3 : 0) + (humidity < 40 ? 0.2 : 0);
    const risk = driftIndex > 0.5 ? 'HIGH' : driftIndex > 0.3 ? 'MEDIUM' : 'LOW';
    Alert.alert(`Drift Risk: ${risk}`, `Wind: ${windSpeed} m/s\nTemp: ${temp}°C\nHumidity: ${humidity}%\nDrift Index: ${driftIndex.toFixed(2)}\n\nBuffer zone: ${Math.round(driftIndex * 100)}m`);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Drone Operations</Text>
      <Text style={styles.subtitle}>Flight planning, spray prescriptions, NDVI imagery</Text>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['flights', 'fleet', 'spray'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.activeTab]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}><Text style={styles.statValue}>{drones.length}</Text><Text style={styles.statLabel}>Drones</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{flights.filter(f => f.status === 'completed').length}</Text><Text style={styles.statLabel}>Completed</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{flights.reduce((s, f) => s + f.area, 0).toFixed(1)}ha</Text><Text style={styles.statLabel}>Coverage</Text></View>
      </View>

      {activeTab === 'flights' && (
        <View>
          <TouchableOpacity style={styles.actionButton} onPress={planNewFlight}>
            <Text style={styles.actionButtonText}>+ Plan New Flight</Text>
          </TouchableOpacity>
          {flights.map(flight => (
            <View key={flight.id} style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{flight.id} — {flight.type.toUpperCase()}</Text>
                <Text style={[styles.badge, flight.status === 'completed' ? styles.badgeGreen : flight.status === 'in_progress' ? styles.badgeBlue : styles.badgeGray]}>{flight.status}</Text>
              </View>
              <Text style={styles.cardDetail}>{flight.area} ha • {flight.time} min • {flight.waypoints} waypoints</Text>
            </View>
          ))}
        </View>
      )}

      {activeTab === 'fleet' && (
        <View>
          {drones.map(drone => (
            <View key={drone.id} style={styles.card}>
              <Text style={styles.cardTitle}>{drone.id}</Text>
              <Text style={styles.cardDetail}>{drone.model}</Text>
              <View style={styles.batteryRow}>
                <View style={styles.batteryBar}><View style={[styles.batteryFill, { width: `${drone.battery}%` }]} /></View>
                <Text style={styles.batteryText}>{drone.battery}%</Text>
              </View>
              <Text style={styles.cardDetail}>Status: {drone.status} | Alt: {drone.altitude}m | Speed: {drone.speed} m/s</Text>
            </View>
          ))}
        </View>
      )}

      {activeTab === 'spray' && (
        <View>
          <TouchableOpacity style={styles.actionButton} onPress={checkDriftRisk}>
            <Text style={styles.actionButtonText}>Check Drift Risk</Text>
          </TouchableOpacity>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Variable-Rate Spray Zones</Text>
            <Text style={styles.cardDetail}>Low NDVI (&lt;0.3): 15 L/ha (heavy)</Text>
            <Text style={styles.cardDetail}>Moderate (0.3-0.5): 10 L/ha</Text>
            <Text style={styles.cardDetail}>Good (0.5-0.7): 5 L/ha</Text>
            <Text style={styles.cardDetail}>Healthy (&gt;0.7): 2 L/ha (maintenance)</Text>
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
  activeTab: { backgroundColor: '#2196F3' },
  tabText: { color: '#333', fontWeight: '600' },
  activeTabText: { color: '#fff' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  stat: { alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 8, flex: 1, marginHorizontal: 4 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#2196F3' },
  statLabel: { fontSize: 11, color: '#888' },
  actionButton: { backgroundColor: '#2196F3', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  actionButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, elevation: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDetail: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 11, overflow: 'hidden' },
  badgeGreen: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
  badgeBlue: { backgroundColor: '#e3f2fd', color: '#1565c0' },
  badgeGray: { backgroundColor: '#f5f5f5', color: '#757575' },
  batteryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  batteryBar: { flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 },
  batteryFill: { height: 8, backgroundColor: '#4caf50', borderRadius: 4 },
  batteryText: { marginLeft: 8, fontSize: 12, color: '#666' },
});
