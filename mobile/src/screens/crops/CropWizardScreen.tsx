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
