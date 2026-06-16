import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/services/api/client';

interface ColdChainShipment {
  id: number;
  shipmentId: string;
  commodity: string;
  currentTemp: number;
  targetTemp: number;
  humidity: number;
  status: string;
  origin: string;
  destination: string;
  estimatedArrival: string;
}

export default function ColdChainScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shipments, setShipments] = useState<ColdChainShipment[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.coldChain.getActiveShipments.query();
      setShipments(data as ColdChainShipment[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load cold chain data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);
  const alerts = shipments.filter((s) => Math.abs(s.currentTemp - s.targetTemp) > 3);

  return (
    <View style={styles.container} accessibilityLabel="Cold Chain Monitoring screen">
      <Header title="Cold Chain Monitor" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{shipments.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </Card>
          <Card style={[styles.statCard, alerts.length > 0 && styles.alertCard]}>
            <Text style={[styles.statValue, alerts.length > 0 && { color: colors.error }]}>{alerts.length}</Text>
            <Text style={styles.statLabel}>Alerts</Text>
          </Card>
        </View>

        {shipments.map((s) => {
          const tempDiff = Math.abs(s.currentTemp - s.targetTemp);
          const isAlert = tempDiff > 3;
          return (
            <Card key={s.id} style={[styles.card, isAlert && styles.alertBorder]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{s.commodity}</Text>
                <Badge label={isAlert ? 'ALERT' : s.status} variant={isAlert ? 'error' : 'success'} />
              </View>
              <Text style={styles.shipmentId}>{s.shipmentId}</Text>
              <View style={styles.tempRow}>
                <View style={styles.tempItem}>
                  <Text style={[styles.tempValue, isAlert && { color: colors.error }]}>🌡️ {s.currentTemp}°C</Text>
                  <Text style={styles.tempLabel}>Current</Text>
                </View>
                <View style={styles.tempItem}>
                  <Text style={styles.tempValue}>🎯 {s.targetTemp}°C</Text>
                  <Text style={styles.tempLabel}>Target</Text>
                </View>
                <View style={styles.tempItem}>
                  <Text style={styles.tempValue}>💧 {s.humidity}%</Text>
                  <Text style={styles.tempLabel}>Humidity</Text>
                </View>
              </View>
              <View style={styles.routeRow}>
                <Text style={styles.routeText}>{s.origin} → {s.destination}</Text>
                <Text style={styles.etaText}>ETA: {new Date(s.estimatedArrival).toLocaleDateString()}</Text>
              </View>
            </Card>
          );
        })}

        {shipments.length === 0 && (
          <Card style={styles.card}>
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>❄️</Text>
              <Text style={styles.emptyTitle}>No Active Shipments</Text>
              <Text style={styles.emptyText}>Cold chain monitoring will show here when produce is in transit.</Text>
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
  alertCard: { borderWidth: 1, borderColor: colors.error },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  card: { marginBottom: spacing.md, padding: spacing.md },
  alertBorder: { borderWidth: 1, borderColor: colors.error },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  shipmentId: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginBottom: spacing.sm },
  tempRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: isDark ? darkColors.border : colors.gray100, borderBottomWidth: 1, borderBottomColor: isDark ? darkColors.border : colors.gray100 },
  tempItem: { alignItems: 'center' },
  tempValue: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  tempLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  routeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  routeText: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600 },
  etaText: { fontSize: fontSize.xs, color: colors.secondary },
  emptyContainer: { alignItems: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.sm },
});
