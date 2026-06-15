import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';

interface Flight {
  id: number;
  missionName: string;
  droneId: string;
  status: string;
  startTime: string;
  duration: number;
  areaCoveredHa: number;
  altitude: number;
  imagesCapture: number;
  missionType: string;
}

export default function DroneFlightScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.drone.getFlightHistory.query();
      setFlights(data as Flight[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load drone flights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);
  const totalFlights = flights.length;
  const totalArea = flights.reduce((s, f) => s + f.areaCoveredHa, 0);
  const totalImages = flights.reduce((s, f) => s + f.imagesCapture, 0);

  return (
    <View style={styles.container} accessibilityLabel="Drone Flight Dashboard">
      <Header title="Drone Flights" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{totalFlights}</Text>
            <Text style={styles.statLabel}>Flights</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{totalArea.toFixed(1)} ha</Text>
            <Text style={styles.statLabel}>Area Mapped</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{totalImages}</Text>
            <Text style={styles.statLabel}>Images</Text>
          </Card>
        </View>

        <Button
          title="🚁 Plan New Mission"
          onPress={() => Alert.alert('New Mission', 'Select field and mission type to plan a drone flight')}
          style={styles.missionBtn}
          accessibilityLabel="Plan new drone mission"
        />

        {flights.map((flight) => (
          <Card key={flight.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{flight.missionName}</Text>
                <Text style={styles.cardSub}>{flight.missionType} • Drone {flight.droneId}</Text>
              </View>
              <Badge label={flight.status} variant={flight.status === 'completed' ? 'success' : flight.status === 'in_progress' ? 'info' : 'warning'} />
            </View>
            <View style={styles.flightMeta}>
              <Text style={styles.metaItem}>🕐 {flight.duration} min</Text>
              <Text style={styles.metaItem}>📐 {flight.areaCoveredHa} ha</Text>
              <Text style={styles.metaItem}>🔼 {flight.altitude}m</Text>
              <Text style={styles.metaItem}>📸 {flight.imagesCapture}</Text>
            </View>
            <Text style={styles.flightDate}>{new Date(flight.startTime).toLocaleString()}</Text>
          </Card>
        ))}

        {flights.length === 0 && (
          <Card style={styles.card}>
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🚁</Text>
              <Text style={styles.emptyTitle}>No Flight History</Text>
              <Text style={styles.emptyText}>Plan and execute drone missions for crop monitoring, spraying, and mapping.</Text>
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
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  missionBtn: { marginBottom: spacing.md },
  card: { marginBottom: spacing.sm, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  cardSub: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  flightMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xs },
  metaItem: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600 },
  flightDate: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  emptyContainer: { alignItems: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.sm },
});
