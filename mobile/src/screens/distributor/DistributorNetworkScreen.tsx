import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius, elevation } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';
import { useNavigation } from '@react-navigation/native';

interface Distributor {
  id: number;
  businessName: string;
  warehouseAddress: string;
  status: string;
  warehouseCapacityKg: string | null;
  coverageRegions: string | null;
  contactPerson: string;
  phoneNumber: string;
  averageRating: string | null;
  totalSalesCount: number | null;
}

interface Partnership {
  id: number;
  distributorId: number;
  distributorName: string;
  status: string;
  farmerProfitShare: number;
  distributorProfitShare: number;
  platformFee: number;
}

export default function DistributorNetworkScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'browse' | 'partnerships' | 'earnings'>('browse');
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [distData, partData] = await Promise.all([
        apiClient.trpc.distributorNetwork.getAll.query({ statusFilter: 'approved' }),
        apiClient.trpc.distributorNetwork.getMyPartnerships.query(),
      ]);
      setDistributors(distData as Distributor[]);
      setPartnerships(partData as Partnership[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load distributor data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);

  return (
    <View style={styles.container} accessibilityLabel="Distributor Network screen">
      <Header title="Distributor Network" />
      <View style={styles.tabRow}>
        {(['browse', 'partnerships', 'earnings'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityLabel={`${t} tab`}
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'browse' ? 'Distributors' : t === 'partnerships' ? 'Partnerships' : 'Earnings'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        {tab === 'browse' && (
          <View accessibilityLabel="Distributor list">
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{distributors.length}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{partnerships.length}</Text>
                <Text style={styles.statLabel}>Partnerships</Text>
              </Card>
            </View>
            {distributors.map((d) => (
              <Card key={d.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{d.businessName}</Text>
                  <Badge label={d.status} variant={d.status === 'approved' ? 'success' : 'warning'} />
                </View>
                <Text style={styles.cardSubtitle}>{d.warehouseAddress}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.metaText}>📦 {d.warehouseCapacityKg ? `${Number(d.warehouseCapacityKg).toLocaleString()} kg` : 'N/A'}</Text>
                  <Text style={styles.metaText}>⭐ {d.averageRating || 'New'}</Text>
                  <Text style={styles.metaText}>📞 {d.phoneNumber}</Text>
                </View>
                <Button
                  title="Propose Partnership"
                  onPress={() => Alert.alert('Partnership', `Send partnership request to ${d.businessName}?`, [
                    { text: 'Cancel' },
                    { text: 'Send', onPress: () => {} },
                  ])}
                  style={styles.cardButton}
                  accessibilityLabel={`Propose partnership with ${d.businessName}`}
                />
              </Card>
            ))}
            {distributors.length === 0 && (
              <Text style={styles.emptyText}>No approved distributors found</Text>
            )}
          </View>
        )}

        {tab === 'partnerships' && (
          <View accessibilityLabel="Partnership list">
            {partnerships.map((p) => (
              <Card key={p.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{p.distributorName}</Text>
                  <Badge label={p.status} variant={p.status === 'active' ? 'success' : 'info'} />
                </View>
                <View style={styles.splitRow}>
                  <View style={styles.splitItem}>
                    <Text style={styles.splitValue}>{p.farmerProfitShare}%</Text>
                    <Text style={styles.splitLabel}>Your Share</Text>
                  </View>
                  <View style={styles.splitItem}>
                    <Text style={styles.splitValue}>{p.distributorProfitShare}%</Text>
                    <Text style={styles.splitLabel}>Distributor</Text>
                  </View>
                  <View style={styles.splitItem}>
                    <Text style={styles.splitValue}>{p.platformFee}%</Text>
                    <Text style={styles.splitLabel}>Platform</Text>
                  </View>
                </View>
              </Card>
            ))}
            {partnerships.length === 0 && (
              <Text style={styles.emptyText}>No active partnerships. Browse distributors to propose one.</Text>
            )}
          </View>
        )}

        {tab === 'earnings' && (
          <View accessibilityLabel="Earnings summary">
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Earnings from Distributor Sales</Text>
              <Text style={styles.emptyText}>Earnings will appear here once your distributors make sales.</Text>
            </Card>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.mapFab}
        onPress={() => navigation.navigate('DistributorMap')}
        accessibilityLabel="View distributor map"
        accessibilityRole="button"
      >
        <Text style={styles.fabText}>🗺️</Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? darkColors.background : colors.background },
  content: { flex: 1, padding: spacing.md },
  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: borderRadius.md, backgroundColor: isDark ? darkColors.backgroundSecondary : colors.gray100 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '600', color: isDark ? darkColors.textSecondary : colors.gray600 },
  tabTextActive: { color: colors.white },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, alignItems: 'center', padding: spacing.md },
  statValue: { fontSize: fontSize.xxl, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  card: { marginBottom: spacing.md, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, flex: 1 },
  cardSubtitle: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600, marginBottom: spacing.sm },
  cardMeta: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  metaText: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  cardButton: { marginTop: spacing.sm },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, padding: spacing.xl, fontSize: fontSize.md },
  splitRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: isDark ? darkColors.border : colors.gray200 },
  splitItem: { alignItems: 'center' },
  splitValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.primary },
  splitLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  mapFab: { position: 'absolute', bottom: spacing.xl, right: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', ...elevation.lg },
  fabText: { fontSize: 24 },
});
