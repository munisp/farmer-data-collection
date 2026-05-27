import React, { useState } from 'react';
import { View, ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { Header } from '@/components/shared/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';

export default function PriceForecastScreen() {
  const [cropType, setCropType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<{
    currentPrice: number;
    forecast7Days: number;
    forecast30Days: number;
    trend: 'up' | 'down' | 'stable';
  } | null>(null);

  const handleForecast = async () => {
    if (!cropType || !quantity) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    // Simulate ML API call
    setTimeout(() => {
      const basePrice = Math.random() * 50 + 20;
      const trend = ['up', 'down', 'stable'][Math.floor(Math.random() * 3)] as 'up' | 'down' | 'stable';
      const multiplier = trend === 'up' ? 1.1 : trend === 'down' ? 0.9 : 1.0;
      
      setForecast({
        currentPrice: basePrice,
        forecast7Days: basePrice * (multiplier + (Math.random() * 0.05 - 0.025)),
        forecast30Days: basePrice * (multiplier * multiplier + (Math.random() * 0.1 - 0.05)),
        trend,
      });
      setLoading(false);
    }, 2000);
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return '#4CAF50';
      case 'down': return '#F44336';
      default: return '#FFC107';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return '↑';
      case 'down': return '↓';
      default: return '→';
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Price Forecast" showBack />
      <ScrollView style={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.description}>
            Get AI-powered price forecasts to make informed decisions about when to sell your crops.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Crop Information</Text>
          <Input 
            label="Crop Type *" 
            value={cropType} 
            onChangeText={setCropType}
            placeholder="e.g., Wheat, Rice, Corn"
          />
          <Input 
            label="Quantity (kg) *" 
            value={quantity} 
            onChangeText={setQuantity}
            placeholder="0.0"
            keyboardType="numeric"
          />
        </Card>

        <Button 
          title="Get Price Forecast" 
          onPress={handleForecast} 
          loading={loading}
          style={styles.button}
        />

        {forecast && (
          <Card style={[styles.card, styles.resultCard]}>
            <Text style={styles.resultTitle}>Price Forecast</Text>
            
            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>Current Market Price</Text>
              <Text style={styles.priceValue}>${forecast.currentPrice.toFixed(2)}/kg</Text>
            </View>

            <View style={styles.forecastRow}>
              <View style={styles.forecastItem}>
                <Text style={styles.forecastLabel}>7-Day Forecast</Text>
                <Text style={styles.forecastValue}>${forecast.forecast7Days.toFixed(2)}/kg</Text>
              </View>
              <View style={styles.forecastItem}>
                <Text style={styles.forecastLabel}>30-Day Forecast</Text>
                <Text style={styles.forecastValue}>${forecast.forecast30Days.toFixed(2)}/kg</Text>
              </View>
            </View>

            <View style={styles.trendContainer}>
              <Text style={styles.trendLabel}>Market Trend:</Text>
              <View style={[styles.trendBadge, { backgroundColor: getTrendColor(forecast.trend) }]}>
                <Text style={styles.trendText}>
                  {getTrendIcon(forecast.trend)} {forecast.trend.toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={styles.resultNote}>
              Forecasts are based on historical market data and current trends. Actual prices may vary.
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
  resultCard: { backgroundColor: '#E3F2FD' },
  resultTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginBottom: 16 },
  priceCard: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 16, alignItems: 'center' },
  priceLabel: { fontSize: 14, color: COLORS.textLight, marginBottom: 8 },
  priceValue: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary },
  forecastRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  forecastItem: { flex: 1, backgroundColor: '#fff', padding: 12, borderRadius: 8, marginHorizontal: 4 },
  forecastLabel: { fontSize: 12, color: COLORS.textLight, marginBottom: 4 },
  forecastValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  trendContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  trendLabel: { fontSize: 16, color: COLORS.text, marginRight: 8 },
  trendBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  trendText: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  resultNote: { fontSize: 12, color: COLORS.textLight, marginTop: 8, fontStyle: 'italic' },
});
