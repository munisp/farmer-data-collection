import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';

interface CollectionItem {
  id: number;
  loanId: number;
  amount: number;
  currency: string;
  status: string;
  dueDate: string;
  daysOverdue: number;
  stage: string;
}

export default function CollectionsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collections, setCollections] = useState<CollectionItem[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.collections.getMyCollections.query();
      setCollections(data as CollectionItem[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load collections data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const totalDue = collections.reduce((s, c) => s + c.amount, 0);
  const overdue = collections.filter((c) => c.daysOverdue > 0);
  const styles = getStyles(isDark);

  return (
    <View style={styles.container} accessibilityLabel="Collections screen">
      <Header title="Loan Collections" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>₦{totalDue.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total Due</Text>
          </Card>
          <Card style={[styles.statCard, overdue.length > 0 && styles.alertCard]}>
            <Text style={[styles.statValue, overdue.length > 0 && { color: colors.error }]}>{overdue.length}</Text>
            <Text style={styles.statLabel}>Overdue</Text>
          </Card>
        </View>

        {collections.map((c) => (
          <Card key={c.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>₦{c.amount.toLocaleString()}</Text>
              <Badge
                label={c.stage}
                variant={c.stage === 'performing' ? 'success' : c.stage === 'watchlist' ? 'warning' : 'error'}
              />
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.metaText}>Due: {new Date(c.dueDate).toLocaleDateString()}</Text>
              {c.daysOverdue > 0 && <Text style={styles.overdueText}>{c.daysOverdue} days overdue</Text>}
            </View>
            <Button
              title="Make Payment"
              onPress={() => Alert.alert('Payment', `Pay ₦${c.amount.toLocaleString()} via mobile money?`)}
              style={styles.payBtn}
              accessibilityLabel={`Pay collection of ${c.amount}`}
            />
          </Card>
        ))}

        {collections.length === 0 && (
          <Card style={styles.card}>
            <Text style={styles.emptyText}>No pending collections. Your loan payments are up to date! 🎉</Text>
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  metaText: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600 },
  overdueText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.error },
  payBtn: { marginTop: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.md, padding: spacing.md },
});
