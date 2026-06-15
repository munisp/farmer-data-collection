import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';

interface Policy {
  id: number;
  policyNumber: string;
  type: string;
  status: string;
  coverageAmount: number;
  premium: number;
  startDate: string;
  endDate: string;
  cropType?: string;
}

interface Claim {
  id: number;
  claimNumber: string;
  policyId: number;
  status: string;
  claimAmount: number;
  description: string;
  filedAt: string;
}

export default function InsuranceScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'policies' | 'claims' | 'products'>('policies');
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [policyData, claimData] = await Promise.all([
        apiClient.trpc.insurance.getMyPolicies.query(),
        apiClient.trpc.insurance.getMyClaims.query(),
      ]);
      setPolicies(policyData as Policy[]);
      setClaims(claimData as Claim[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load insurance data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);

  return (
    <View style={styles.container} accessibilityLabel="Insurance screen">
      <Header title="Crop Insurance" />
      <View style={styles.tabRow}>
        {(['policies', 'claims', 'products'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'policies' ? '🛡️ Policies' : t === 'claims' ? '📄 Claims' : '📦 Products'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        {tab === 'policies' && (
          <View accessibilityLabel="My policies">
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{policies.length}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>₦{policies.reduce((s, p) => s + p.coverageAmount, 0).toLocaleString()}</Text>
                <Text style={styles.statLabel}>Total Coverage</Text>
              </Card>
            </View>
            {policies.map((p) => (
              <Card key={p.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{p.type} Insurance</Text>
                  <Badge label={p.status} variant={p.status === 'active' ? 'success' : 'warning'} />
                </View>
                <Text style={styles.policyNumber}>{p.policyNumber}</Text>
                <View style={styles.policyDetails}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Coverage</Text>
                    <Text style={styles.detailValue}>₦{p.coverageAmount.toLocaleString()}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Premium</Text>
                    <Text style={styles.detailValue}>₦{p.premium.toLocaleString()}/mo</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Expires</Text>
                    <Text style={styles.detailValue}>{new Date(p.endDate).toLocaleDateString()}</Text>
                  </View>
                </View>
                {p.cropType && <Text style={styles.cropTag}>🌾 {p.cropType}</Text>}
              </Card>
            ))}
            {policies.length === 0 && (
              <Text style={styles.emptyText}>No active policies. Browse products to get covered.</Text>
            )}
          </View>
        )}

        {tab === 'claims' && (
          <View accessibilityLabel="Insurance claims">
            {claims.map((c) => (
              <Card key={c.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{c.claimNumber}</Text>
                  <Badge label={c.status} variant={c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'error' : 'info'} />
                </View>
                <Text style={styles.claimDesc}>{c.description}</Text>
                <View style={styles.claimMeta}>
                  <Text style={styles.claimAmount}>₦{c.claimAmount.toLocaleString()}</Text>
                  <Text style={styles.claimDate}>Filed: {new Date(c.filedAt).toLocaleDateString()}</Text>
                </View>
              </Card>
            ))}
            {claims.length === 0 && (
              <Text style={styles.emptyText}>No claims filed.</Text>
            )}
            <Button
              title="File New Claim"
              onPress={() => Alert.alert('Claim', 'Select a policy to file a claim against')}
              accessibilityLabel="File new insurance claim"
            />
          </View>
        )}

        {tab === 'products' && (
          <View accessibilityLabel="Insurance products">
            {[
              { name: 'Crop Weather Index', desc: 'Automatic payout when rainfall deviates from norm', premium: '₦2,500/season', coverage: '₦500,000' },
              { name: 'Livestock Mortality', desc: 'Coverage for unexpected livestock loss', premium: '₦1,800/quarter', coverage: '₦300,000' },
              { name: 'Input Protection', desc: 'Covers cost of seeds/fertilizer if crop fails', premium: '₦1,200/season', coverage: '₦200,000' },
              { name: 'Market Price Floor', desc: 'Guaranteed minimum price for your harvest', premium: '₦3,000/season', coverage: 'Price guarantee' },
            ].map((product, i) => (
              <Card key={i} style={styles.card}>
                <Text style={styles.cardTitle}>{product.name}</Text>
                <Text style={styles.productDesc}>{product.desc}</Text>
                <View style={styles.productMeta}>
                  <Text style={styles.metaText}>Premium: {product.premium}</Text>
                  <Text style={styles.metaText}>Coverage: {product.coverage}</Text>
                </View>
                <Button
                  title="Get Quote"
                  onPress={() => Alert.alert('Quote', `Request a quote for ${product.name}`)}
                  style={styles.quoteBtn}
                  accessibilityLabel={`Get quote for ${product.name}`}
                />
              </Card>
            ))}
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
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '600', color: isDark ? darkColors.textSecondary : colors.gray600 },
  tabTextActive: { color: colors.white },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, alignItems: 'center', padding: spacing.md },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  card: { marginBottom: spacing.md, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  policyNumber: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginBottom: spacing.sm },
  policyDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  detailItem: { alignItems: 'center' },
  detailLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  detailValue: { fontSize: fontSize.sm, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginTop: 2 },
  cropTag: { marginTop: spacing.sm, fontSize: fontSize.xs, color: colors.primary },
  claimDesc: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600, marginBottom: spacing.sm },
  claimMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  claimAmount: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  claimDate: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  productDesc: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600, marginTop: 4, marginBottom: spacing.sm },
  productMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  metaText: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  quoteBtn: { marginTop: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, padding: spacing.xl, fontSize: fontSize.md },
});
