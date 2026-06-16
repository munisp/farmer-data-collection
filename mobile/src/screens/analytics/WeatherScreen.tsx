import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { apiClient } from '@/services/api/client';

interface WeatherData {
  temperature: number;
  humidity: number;
  rainfall: number;
  windSpeed: number;
  condition: string;
  forecast: Array<{ day: string; high: number; low: number; condition: string; rainfall: number }>;
}

export default function WeatherScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.weather.getCurrent.query({ lat: 9.082, lng: 8.6753 });
      setWeather(data as WeatherData);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load weather data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);
  const conditionIcon = (c: string) => {
    if (c.includes('rain')) return '🌧️';
    if (c.includes('cloud')) return '☁️';
    if (c.includes('sun') || c.includes('clear')) return '☀️';
    if (c.includes('storm')) return '⛈️';
    return '🌤️';
  };

  return (
    <View style={styles.container} accessibilityLabel="Weather screen">
      <Header title="Weather & Climate" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        {weather ? (
          <>
            <Card style={styles.currentCard}>
              <Text style={styles.currentIcon}>{conditionIcon(weather.condition)}</Text>
              <Text style={styles.currentTemp}>{weather.temperature}°C</Text>
              <Text style={styles.currentCondition}>{weather.condition}</Text>
              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>💧 {weather.humidity}%</Text>
                  <Text style={styles.metricLabel}>Humidity</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>🌧️ {weather.rainfall}mm</Text>
                  <Text style={styles.metricLabel}>Rainfall</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>💨 {weather.windSpeed}km/h</Text>
                  <Text style={styles.metricLabel}>Wind</Text>
                </View>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>7-Day Forecast</Text>
            {weather.forecast?.map((day, i) => (
              <Card key={i} style={styles.forecastCard}>
                <View style={styles.forecastRow}>
                  <Text style={styles.forecastDay}>{day.day}</Text>
                  <Text style={styles.forecastIcon}>{conditionIcon(day.condition)}</Text>
                  <View style={styles.forecastTemps}>
                    <Text style={styles.forecastHigh}>{day.high}°</Text>
                    <Text style={styles.forecastLow}>{day.low}°</Text>
                  </View>
                  <Text style={styles.forecastRain}>🌧️ {day.rainfall}mm</Text>
                </View>
              </Card>
            ))}

            <Card style={styles.advisoryCard}>
              <Text style={styles.advisoryTitle}>🌾 Farming Advisory</Text>
              <Text style={styles.advisoryText}>
                {weather.rainfall > 50
                  ? 'Heavy rainfall expected. Delay planting and ensure proper drainage.'
                  : weather.temperature > 35
                  ? 'High temperatures. Increase irrigation frequency and provide shade for seedlings.'
                  : 'Good conditions for farming activities. Optimal time for planting and field work.'}
              </Text>
            </Card>
          </>
        ) : (
          <Card style={styles.currentCard}>
            <Text style={styles.emptyText}>Weather data unavailable. Check your location settings.</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? darkColors.background : colors.background },
  content: { flex: 1, padding: spacing.md },
  currentCard: { alignItems: 'center', padding: spacing.xl, marginBottom: spacing.md },
  currentIcon: { fontSize: 64, marginBottom: spacing.sm },
  currentTemp: { fontSize: 48, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  currentCondition: { fontSize: fontSize.lg, color: isDark ? darkColors.textSecondary : colors.gray600, marginBottom: spacing.md, textTransform: 'capitalize' },
  metricsRow: { flexDirection: 'row', gap: spacing.xl },
  metric: { alignItems: 'center' },
  metricValue: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  metricLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.sm, marginTop: spacing.sm },
  forecastCard: { marginBottom: spacing.xs, padding: spacing.sm },
  forecastRow: { flexDirection: 'row', alignItems: 'center' },
  forecastDay: { flex: 1, fontSize: fontSize.md, fontWeight: '500', color: isDark ? darkColors.text : colors.gray900 },
  forecastIcon: { fontSize: 24, marginHorizontal: spacing.sm },
  forecastTemps: { flexDirection: 'row', gap: spacing.xs, marginRight: spacing.md },
  forecastHigh: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  forecastLow: { fontSize: fontSize.md, color: isDark ? darkColors.textMuted : colors.gray500 },
  forecastRain: { fontSize: fontSize.sm, color: colors.secondary },
  advisoryCard: { marginTop: spacing.md, padding: spacing.md, backgroundColor: isDark ? '#1a2e1a' : '#f0fdf4' },
  advisoryTitle: { fontSize: fontSize.md, fontWeight: '700', color: isDark ? '#86efac' : '#166534', marginBottom: spacing.xs },
  advisoryText: { fontSize: fontSize.sm, color: isDark ? '#bbf7d0' : '#15803d', lineHeight: 20 },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.md },
});
