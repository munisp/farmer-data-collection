import React, { useState } from 'react';
import { View, ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { Header } from '@/components/shared/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS } from '@/utils/constants';

export default function YieldPredictionScreen() {
  const [cropType, setCropType] = useState('');
  const [fieldSize, setFieldSize] = useState('');
  const [soilType, setSoilType] = useState('');
  const [rainfall, setRainfall] = useState('');
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<{yield: number; confidence: number} | null>(null);

  const handlePredict = async () => {
    if (!cropType || !fieldSize || !soilType || !rainfall) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    // Simulate ML API call
    setTimeout(() => {
      const predictedYield = parseFloat(fieldSize) * (Math.random() * 3 + 2); // Mock calculation
      setPrediction({
        yield: predictedYield,
        confidence: Math.random() * 20 + 75, // 75-95% confidence
      });
      setLoading(false);
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <Header title="Yield Prediction" showBack />
      <ScrollView style={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.description}>
            Use AI-powered yield prediction to estimate your harvest based on field conditions and historical data.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Field Information</Text>
          <Input 
            label="Crop Type *" 
            value={cropType} 
            onChangeText={setCropType}
            placeholder="e.g., Wheat, Rice, Corn"
          />
          <Input 
            label="Field Size (hectares) *" 
            value={fieldSize} 
            onChangeText={setFieldSize}
            placeholder="0.0"
            keyboardType="numeric"
          />
          <Input 
            label="Soil Type *" 
            value={soilType} 
            onChangeText={setSoilType}
            placeholder="e.g., Clay, Sandy, Loam"
          />
          <Input 
            label="Average Rainfall (mm) *" 
            value={rainfall} 
            onChangeText={setRainfall}
            placeholder="0.0"
            keyboardType="numeric"
          />
        </Card>

        <Button 
          title="Predict Yield" 
          onPress={handlePredict} 
          loading={loading}
          style={styles.button}
        />

        {prediction && (
          <Card style={[styles.card, styles.resultCard]}>
            <Text style={styles.resultTitle}>Prediction Results</Text>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Estimated Yield:</Text>
              <Text style={styles.resultValue}>{prediction.yield.toFixed(2)} tons</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Confidence:</Text>
              <Text style={styles.resultValue}>{prediction.confidence.toFixed(1)}%</Text>
            </View>
            <Text style={styles.resultNote}>
              This prediction is based on historical data and current field conditions. Actual results may vary.
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  card: { marginBottom: 16 },
  description: { fontSize: 14, color: COLORS.textLight, lineHeight: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  button: { marginBottom: 16 },
  resultCard: { backgroundColor: '#E8F5E9' },
  resultTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginBottom: 16 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  resultLabel: { fontSize: 16, color: COLORS.text },
  resultValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  resultNote: { fontSize: 12, color: COLORS.textLight, marginTop: 8, fontStyle: 'italic' },
});
