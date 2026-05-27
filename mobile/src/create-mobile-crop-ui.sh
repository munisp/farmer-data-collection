#!/bin/bash

# Create Mobile Crop Wizard Screen
cat > screens/crops/CropWizardScreen.tsx << 'EOF'
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

const CROPS = [
  { id: 'ginger', name: 'Ginger', icon: '🫚' },
  { id: 'palm', name: 'Palm Oil', icon: '🌴' },
  { id: 'cocoa', name: 'Cocoa', icon: '🍫' },
  { id: 'cassava', name: 'Cassava', icon: '🥔' },
  { id: 'yam', name: 'Yam', icon: '🍠' },
  { id: 'rice', name: 'Rice', icon: '🌾' },
  { id: 'maize', name: 'Maize', icon: '🌽' },
  { id: 'soybean', name: 'Soybean', icon: '🫘' },
  { id: 'groundnut', name: 'Groundnut', icon: '🥜' },
  { id: 'cotton', name: 'Cotton', icon: '☁️' },
];

export default function CropWizardScreen({ navigation }) {
  const [selectedCrop, setSelectedCrop] = useState(null);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Select Your Crop</Text>
      <Text style={styles.subtitle}>
        Choose the crop you want to manage
      </Text>

      <View style={styles.grid}>
        {CROPS.map((crop) => (
          <TouchableOpacity
            key={crop.id}
            style={[
              styles.cropCard,
              selectedCrop === crop.id && styles.selectedCard
            ]}
            onPress={() => setSelectedCrop(crop.id)}
          >
            <Text style={styles.cropIcon}>{crop.icon}</Text>
            <Text style={styles.cropName}>{crop.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedCrop && (
        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => navigation.navigate('CropDashboard', { cropId: selectedCrop })}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cropCard: {
    width: '48%',
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    alignItems: 'center',
  },
  selectedCard: { backgroundColor: '#e0f2fe', borderWidth: 2, borderColor: '#0284c7' },
  cropIcon: { fontSize: 48, marginBottom: 8 },
  cropName: { fontSize: 14, fontWeight: '600' },
  continueButton: {
    backgroundColor: '#0284c7',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  continueButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
EOF

# Create Mobile Crop Dashboard Screen
cat > screens/crops/CropDashboardScreen.tsx << 'EOF'
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
EOF

# Create Mobile Journey Tracker Screen
cat > screens/journeys/JourneyTrackerScreen.tsx << 'EOF'
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

export default function JourneyTrackerScreen({ route }) {
  const { cropId, journeyId } = route.params;

  const steps = [
    { name: 'Land Preparation', status: 'completed', progress: 100 },
    { name: 'Planting', status: 'completed', progress: 100 },
    { name: 'Fertilizer Application', status: 'in_progress', progress: 60 },
    { name: 'Pest Control', status: 'pending', progress: 0 },
    { name: 'Harvest', status: 'pending', progress: 0 },
  ];

  const overallProgress = steps.reduce((sum, s) => sum + s.progress, 0) / steps.length;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Journey Progress</Text>
      
      <View style={styles.progressCard}>
        <Text style={styles.progressLabel}>Overall Progress</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${overallProgress}%` }]} />
        </View>
        <Text style={styles.progressText}>{Math.round(overallProgress)}% complete</Text>
      </View>

      {steps.map((step, idx) => (
        <View key={idx} style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepName}>{idx + 1}. {step.name}</Text>
            <View style={[
              styles.statusBadge,
              step.status === 'completed' && styles.completedBadge,
              step.status === 'in_progress' && styles.inProgressBadge,
            ]}>
              <Text style={styles.statusText}>{step.status.replace('_', ' ')}</Text>
            </View>
          </View>
          <View style={styles.stepProgressBar}>
            <View style={[styles.stepProgressFill, { width: `${step.progress}%` }]} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 16 },
  progressCard: { padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8, marginBottom: 24 },
  progressLabel: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  progressBar: { height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#0284c7', borderRadius: 4 },
  progressText: { fontSize: 14, color: '#666' },
  stepCard: { padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8, marginBottom: 12 },
  stepHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  stepName: { fontSize: 16, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e0e0e0' },
  completedBadge: { backgroundColor: '#d1fae5' },
  inProgressBadge: { backgroundColor: '#dbeafe' },
  statusText: { fontSize: 12, fontWeight: '600' },
  stepProgressBar: { height: 6, backgroundColor: '#e0e0e0', borderRadius: 3 },
  stepProgressFill: { height: '100%', backgroundColor: '#0284c7', borderRadius: 3 },
});
EOF

echo "Mobile crop UI created successfully!"
