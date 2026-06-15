import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/services/api/client';

interface Sensor {
  id: number;
  name: string;
  type: string;
  status: string;
  lastReading: { value: number; unit: string; timestamp: string } | null;
  batteryLevel: number;
  farmId: number;
  farmName: string;
}

export default function IoTDashboardScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sensors, setSensors] = useState<Sensor[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.iot.getMySensors.query();
      setSensors(data as Sensor[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load sensor data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);
  const online = sensors.filter((s) => s.status === 'online');
  const alerts = sensors.filter((s) => s.batteryLevel < 20);

  const sensorIcon = (type: string) => {
    switch (type) {
      case 'soil_moisture': return '💧';
      case 'temperature': return '🌡️';
      case 'humidity': return '💦';
      case 'ph': return '🧪';
      case 'light': return '☀️';
      case 'rain': return '🌧️';
      default: return '📡';
    }
  };

  return (
    <View style={styles.container} accessibilityLabel="IoT Sensor Dashboard">
      <Header title="IoT Sensors" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{sensors.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.success }]}>{online.length}</Text>
            <Text style={styles.statLabel}>Online</Text>
          </Card>
          <Card style={[styles.statCard, alerts.length > 0 && styles.alertCard]}>
            <Text style={[styles.statValue, alerts.length > 0 && { color: colors.warning }]}>{alerts.length}</Text>
            <Text style={styles.statLabel}>Low Battery</Text>
          </Card>
        </View>

        {sensors.map((sensor) => (
          <Card key={sensor.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.sensorInfo}>
                <Text style={styles.sensorIcon}>{sensorIcon(sensor.type)}</Text>
                <View>
                  <Text style={styles.cardTitle}>{sensor.name}</Text>
                  <Text style={styles.cardSub}>{sensor.type.replace('_', ' ')} • {sensor.farmName}</Text>
                </View>
              </View>
              <Badge label={sensor.status} variant={sensor.status === 'online' ? 'success' : 'error'} />
            </View>
            {sensor.lastReading && (
              <View style={styles.readingRow}>
                <Text style={styles.readingValue}>{sensor.lastReading.value} {sensor.lastReading.unit}</Text>
                <Text style={styles.readingTime}>{new Date(sensor.lastReading.timestamp).toLocaleTimeString()}</Text>
              </View>
            )}
            <View style={styles.batteryRow}>
              <View style={styles.batteryBar}>
                <View style={[styles.batteryFill, { width: `${sensor.batteryLevel}%`, backgroundColor: sensor.batteryLevel < 20 ? colors.error : sensor.batteryLevel < 50 ? colors.warning : colors.success }]} />
              </View>
              <Text style={styles.batteryText}>{sensor.batteryLevel}%</Text>
            </View>
          </Card>
        ))}

        {sensors.length === 0 && (
          <Card style={styles.card}>
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📡</Text>
              <Text style={styles.emptyTitle}>No Sensors Connected</Text>
              <Text style={styles.emptyText}>Connect IoT sensors to monitor soil moisture, temperature, humidity, and more in real-time.</Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? darkColors.background : colors.background },
  content: { flex: 1, padding: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, alignItems: 'center', padding: spacing.md },
  alertCard: { borderWidth: 1, borderColor: colors.warning },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  card: { marginBottom: spacing.sm, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sensorInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  sensorIcon: { fontSize: 28, marginRight: spacing.sm },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  cardSub: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, textTransform: 'capitalize' },
  readingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: isDark ? darkColors.border : colors.gray100 },
  readingValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.primary },
  readingTime: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  batteryRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  batteryBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: isDark ? darkColors.backgroundSecondary : colors.gray200, marginRight: spacing.sm },
  batteryFill: { height: '100%', borderRadius: 3 },
  batteryText: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, width: 35 },
  emptyContainer: { alignItems: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.sm, lineHeight: 20 },
});
