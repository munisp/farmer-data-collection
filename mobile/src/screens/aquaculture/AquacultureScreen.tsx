import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/services/api/client';

interface Pond {
  id: number;
  name: string;
  species: string;
  stockCount: number;
  waterTemp: number;
  ph: number;
  dissolvedOxygen: number;
  feedSchedule: string;
  lastFed: string;
  harvestDate: string | null;
  status: string;
}

export default function AquacultureScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [tab, setTab] = useState<'ponds' | 'feed' | 'harvest'>('ponds');

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.aquaculture.getMyPonds.query();
      setPonds(data as Pond[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load aquaculture data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);
  const totalStock = ponds.reduce((s, p) => s + p.stockCount, 0);
  const readyToHarvest = ponds.filter((p) => p.status === 'ready_to_harvest');

  return (
    <View style={styles.container} accessibilityLabel="Aquaculture Dashboard">
      <Header title="Aquaculture" />
      <View style={styles.tabRow}>
        {(['ponds', 'feed', 'harvest'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'ponds' ? '🐟 Ponds' : t === 'feed' ? '🍽️ Feed' : '🎣 Harvest'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        {tab === 'ponds' && (
          <>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{ponds.length}</Text>
                <Text style={styles.statLabel}>Ponds</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{totalStock.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Total Stock</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={[styles.statValue, { color: colors.success }]}>{readyToHarvest.length}</Text>
                <Text style={styles.statLabel}>Ready</Text>
              </Card>
            </View>

            {ponds.map((pond) => (
              <Card key={pond.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{pond.name}</Text>
                  <Badge label={pond.status.replace('_', ' ')} variant={pond.status === 'active' ? 'success' : pond.status === 'ready_to_harvest' ? 'info' : 'warning'} />
                </View>
                <Text style={styles.species}>{pond.species} • {pond.stockCount} fish</Text>
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>🌡️ {pond.waterTemp}°C</Text>
                    <Text style={styles.metricLabel}>Temp</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>🧪 {pond.ph}</Text>
                    <Text style={styles.metricLabel}>pH</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>💨 {pond.dissolvedOxygen} mg/L</Text>
                    <Text style={styles.metricLabel}>DO</Text>
                  </View>
                </View>
              </Card>
            ))}

            {ponds.length === 0 && (
              <Card style={styles.card}>
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>🐟</Text>
                  <Text style={styles.emptyTitle}>No Ponds Registered</Text>
                  <Text style={styles.emptyText}>Register your fish ponds to monitor water quality, feeding, and harvest schedules.</Text>
                </View>
              </Card>
            )}
          </>
        )}

        {tab === 'feed' && (
          <View>
            {ponds.map((pond) => (
              <Card key={pond.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{pond.name}</Text>
                  <Text style={styles.feedSchedule}>{pond.feedSchedule}</Text>
                </View>
                <Text style={styles.lastFed}>Last fed: {pond.lastFed ? new Date(pond.lastFed).toLocaleString() : 'Not recorded'}</Text>
              </Card>
            ))}
            {ponds.length === 0 && <Text style={styles.emptyText}>No feed schedules. Register ponds first.</Text>}
          </View>
        )}

        {tab === 'harvest' && (
          <View>
            {readyToHarvest.length > 0 ? readyToHarvest.map((pond) => (
              <Card key={pond.id} style={styles.card}>
                <Text style={styles.cardTitle}>{pond.name} — {pond.species}</Text>
                <Text style={styles.species}>{pond.stockCount} fish ready</Text>
                {pond.harvestDate && <Text style={styles.lastFed}>Planned: {new Date(pond.harvestDate).toLocaleDateString()}</Text>}
              </Card>
            )) : (
              <Text style={styles.emptyText}>No ponds ready for harvest at this time.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? darkColors.background : colors.background },
  content: { flex: 1, padding: spacing.md },
  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: borderRadius.md, backgroundColor: isDark ? darkColors.backgroundSecondary : colors.gray100 },
  tabActive: { backgroundColor: colors.secondary },
  tabText: { fontSize: fontSize.sm, fontWeight: '600', color: isDark ? darkColors.textSecondary : colors.gray600 },
  tabTextActive: { color: colors.white },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, alignItems: 'center', padding: spacing.md },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  card: { marginBottom: spacing.sm, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  species: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600, marginBottom: spacing.sm },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: isDark ? darkColors.border : colors.gray100 },
  metric: { alignItems: 'center' },
  metricValue: { fontSize: fontSize.sm, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  metricLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  feedSchedule: { fontSize: fontSize.xs, color: colors.secondary, fontWeight: '500' },
  lastFed: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  emptyContainer: { alignItems: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.sm, padding: spacing.md },
});
