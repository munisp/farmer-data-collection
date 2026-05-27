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
