import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

export default function CropDashboardScreen({ route, navigation }) {
  const { cropId } = route.params;

  const cropData = {
    ginger: { name: 'Ginger', icon: '🫚', journeys: ['Complete Season', 'Export', 'Climate Insurance'] },
    palm: { name: 'Palm Oil', icon: '🌴', journeys: ['Cooperative', 'Outgrower', 'Biodiesel'] },
    cocoa: { name: 'Cocoa', icon: '🍫', journeys: ['Export Certification', 'Fair Trade', 'Agroforestry'] },
  }[cropId] || { name: 'Unknown', icon: '❓', journeys: [] };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>{cropData.icon}</Text>
        <View>
          <Text style={styles.title}>{cropData.name}</Text>
          <Text style={styles.subtitle}>Dashboard</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Active Crops</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>0 tons</Text>
          <Text style={styles.statLabel}>Total Harvest</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>₦0</Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Available Journeys</Text>
      {cropData.journeys.map((journey, idx) => (
        <TouchableOpacity
          key={idx}
          style={styles.journeyCard}
          onPress={() => navigation.navigate('JourneyTracker', { cropId, journeyId: idx })}
        >
          <Text style={styles.journeyName}>{journey}</Text>
          <Text style={styles.journeySubtext}>Tap to start</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  icon: { fontSize: 64, marginRight: 16 },
  title: { fontSize: 28, fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#666' },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: { flex: 1, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8 },
  statValue: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#666' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  journeyCard: { padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8, marginBottom: 12 },
  journeyName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  journeySubtext: { fontSize: 14, color: '#666' },
});
