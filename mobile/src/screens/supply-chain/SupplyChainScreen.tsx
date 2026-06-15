import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/services/api/client';

interface TraceabilityItem {
  id: number;
  batchId: string;
  product: string;
  origin: string;
  currentLocation: string;
  status: string;
  certifications: string[];
  timestamp: string;
}

export default function SupplyChainScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<TraceabilityItem[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.traceability.getMyBatches.query();
      setItems(data as TraceabilityItem[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load supply chain data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);

  return (
    <View style={styles.container} accessibilityLabel="Supply Chain Traceability screen">
      <Header title="Supply Chain" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>🔗 Blockchain Traceability</Text>
          <Text style={styles.infoText}>Track your produce from farm to table with tamper-proof records on the blockchain.</Text>
        </Card>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{items.length}</Text>
            <Text style={styles.statLabel}>Active Batches</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{items.filter((i) => i.certifications.length > 0).length}</Text>
            <Text style={styles.statLabel}>Certified</Text>
          </Card>
        </View>

        {items.map((item) => (
          <Card key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.product}</Text>
              <Badge label={item.status} variant={item.status === 'delivered' ? 'success' : item.status === 'in_transit' ? 'info' : 'warning'} />
            </View>
            <Text style={styles.batchId}>Batch: {item.batchId}</Text>
            <View style={styles.routeRow}>
              <Text style={styles.routeText}>📍 {item.origin}</Text>
              <Text style={styles.routeArrow}>→</Text>
              <Text style={styles.routeText}>📦 {item.currentLocation}</Text>
            </View>
            {item.certifications.length > 0 && (
              <View style={styles.certRow}>
                {item.certifications.map((cert, i) => (
                  <View key={i} style={styles.certBadge}>
                    <Text style={styles.certText}>✓ {cert}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        ))}

        {items.length === 0 && (
          <Card style={styles.card}>
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>No Active Shipments</Text>
              <Text style={styles.emptyText}>Your supply chain records will appear here when produce is shipped.</Text>
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
  infoCard: { padding: spacing.md, marginBottom: spacing.md, backgroundColor: isDark ? '#1a2e1a' : '#f0fdf4' },
  infoTitle: { fontSize: fontSize.md, fontWeight: '700', color: isDark ? '#86efac' : '#166534', marginBottom: 4 },
  infoText: { fontSize: fontSize.sm, color: isDark ? '#bbf7d0' : '#15803d', lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, alignItems: 'center', padding: spacing.md },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  card: { marginBottom: spacing.md, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  batchId: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, fontFamily: 'monospace', marginBottom: spacing.sm },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routeText: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600 },
  routeArrow: { fontSize: fontSize.lg, color: colors.primary },
  certRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  certBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full, backgroundColor: isDark ? '#1a2e1a' : '#dcfce7' },
  certText: { fontSize: fontSize.xs, color: colors.success, fontWeight: '500' },
  emptyContainer: { alignItems: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.sm },
});
