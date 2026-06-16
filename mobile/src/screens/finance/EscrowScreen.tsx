import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';

interface EscrowTransaction {
  id: number;
  type: string;
  amount: number;
  currency: string;
  status: string;
  counterparty: string;
  description: string;
  createdAt: string;
}

export default function EscrowScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<EscrowTransaction[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.escrow.getMyTransactions.query();
      setTransactions(data as EscrowTransaction[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load escrow data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);
  const activeEscrows = transactions.filter((t) => t.status === 'held' || t.status === 'pending');
  const totalHeld = activeEscrows.reduce((s, t) => s + t.amount, 0);

  return (
    <View style={styles.container} accessibilityLabel="Escrow screen">
      <Header title="Escrow Payments" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{activeEscrows.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>₦{totalHeld.toLocaleString()}</Text>
            <Text style={styles.statLabel}>In Escrow</Text>
          </Card>
        </View>

        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>🔒 Secure Transactions</Text>
          <Text style={styles.infoText}>Escrow holds funds until both parties confirm delivery. Protects buyers and sellers.</Text>
        </Card>

        {transactions.map((t) => (
          <Card key={t.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>₦{t.amount.toLocaleString()}</Text>
              <Badge label={t.status} variant={t.status === 'released' ? 'success' : t.status === 'held' ? 'info' : 'warning'} />
            </View>
            <Text style={styles.cardDesc}>{t.description}</Text>
            <Text style={styles.cardMeta}>With: {t.counterparty} • {new Date(t.createdAt).toLocaleDateString()}</Text>
            {t.status === 'held' && (
              <Button
                title="Confirm Delivery"
                onPress={() => Alert.alert('Confirm', 'Release funds to seller?', [
                  { text: 'Cancel' },
                  { text: 'Release', style: 'destructive' },
                ])}
                style={styles.releaseBtn}
                accessibilityLabel="Confirm delivery and release escrow"
              />
            )}
          </Card>
        ))}

        {transactions.length === 0 && (
          <Text style={styles.emptyText}>No escrow transactions. Escrow is automatically created for marketplace purchases.</Text>
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
  infoCard: { padding: spacing.md, marginBottom: spacing.md, backgroundColor: isDark ? '#1a2e1a' : '#f0fdf4' },
  infoTitle: { fontSize: fontSize.md, fontWeight: '700', color: isDark ? '#86efac' : '#166534', marginBottom: 4 },
  infoText: { fontSize: fontSize.sm, color: isDark ? '#bbf7d0' : '#15803d', lineHeight: 20 },
  card: { marginBottom: spacing.md, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  cardDesc: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600, marginBottom: spacing.xs },
  cardMeta: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  releaseBtn: { marginTop: spacing.sm },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, padding: spacing.xl, fontSize: fontSize.md },
});
