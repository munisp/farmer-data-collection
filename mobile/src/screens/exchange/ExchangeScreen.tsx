import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, useColorScheme, TextInput } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius, elevation } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';

interface Order {
  id: number;
  orderType: string;
  commodity: string;
  quantity: number;
  pricePerUnit: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface Balance {
  currency: string;
  available: number;
  locked: number;
}

export default function ExchangeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'market' | 'orders' | 'wallet'>('market');
  const [orders, setOrders] = useState<Order[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orderBook, setOrderBook] = useState<any>({ bids: [], asks: [] });

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ordersData, balanceData, bookData] = await Promise.all([
        apiClient.trpc.exchange.getMyOrders.query(),
        apiClient.trpc.exchange.getBalances.query(),
        apiClient.trpc.exchange.getOrderBook.query({ commodity: 'MAIZE' }),
      ]);
      setOrders(ordersData as Order[]);
      setBalances(balanceData as Balance[]);
      setOrderBook(bookData || { bids: [], asks: [] });
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load exchange data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);

  return (
    <View style={styles.container} accessibilityLabel="Commodity Exchange screen">
      <Header title="Commodity Exchange" />
      <View style={styles.tabRow}>
        {(['market', 'orders', 'wallet'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'market' ? '📊 Market' : t === 'orders' ? '📋 Orders' : '💰 Wallet'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        {tab === 'market' && (
          <View accessibilityLabel="Market order book">
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>MAIZE Order Book</Text>
              <View style={styles.bookRow}>
                <View style={styles.bookSide}>
                  <Text style={styles.bookHeader}>Bids (Buy)</Text>
                  {orderBook.bids?.slice(0, 5).map((b: any, i: number) => (
                    <View key={i} style={styles.bookEntry}>
                      <Text style={[styles.bookPrice, { color: colors.success }]}>₦{b.price}</Text>
                      <Text style={styles.bookQty}>{b.quantity} kg</Text>
                    </View>
                  ))}
                  {(!orderBook.bids || orderBook.bids.length === 0) && (
                    <Text style={styles.noData}>No bids</Text>
                  )}
                </View>
                <View style={styles.bookDivider} />
                <View style={styles.bookSide}>
                  <Text style={styles.bookHeader}>Asks (Sell)</Text>
                  {orderBook.asks?.slice(0, 5).map((a: any, i: number) => (
                    <View key={i} style={styles.bookEntry}>
                      <Text style={[styles.bookPrice, { color: colors.error }]}>₦{a.price}</Text>
                      <Text style={styles.bookQty}>{a.quantity} kg</Text>
                    </View>
                  ))}
                  {(!orderBook.asks || orderBook.asks.length === 0) && (
                    <Text style={styles.noData}>No asks</Text>
                  )}
                </View>
              </View>
            </Card>
            <Button
              title="Place Buy Order"
              onPress={() => Alert.alert('Trade', 'Order placement coming soon')}
              style={styles.tradeBtn}
              accessibilityLabel="Place buy order"
            />
          </View>
        )}

        {tab === 'orders' && (
          <View accessibilityLabel="My orders">
            {orders.map((o) => (
              <Card key={o.id} style={styles.card}>
                <View style={styles.orderHeader}>
                  <Text style={styles.cardTitle}>{o.commodity}</Text>
                  <Badge label={o.orderType} variant={o.orderType === 'buy' ? 'success' : 'error'} />
                </View>
                <View style={styles.orderMeta}>
                  <Text style={styles.metaText}>{o.quantity} kg @ ₦{o.pricePerUnit}/{o.currency}</Text>
                  <Badge label={o.status} variant={o.status === 'filled' ? 'success' : 'info'} />
                </View>
              </Card>
            ))}
            {orders.length === 0 && (
              <Text style={styles.emptyText}>No orders yet. Place your first trade on the Market tab.</Text>
            )}
          </View>
        )}

        {tab === 'wallet' && (
          <View accessibilityLabel="Exchange wallet">
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Exchange Balances</Text>
              {balances.map((b, i) => (
                <View key={i} style={styles.balanceRow}>
                  <Text style={styles.balanceCurrency}>{b.currency}</Text>
                  <View>
                    <Text style={styles.balanceAmount}>₦{b.available.toLocaleString()}</Text>
                    {b.locked > 0 && <Text style={styles.balanceLocked}>🔒 ₦{b.locked.toLocaleString()}</Text>}
                  </View>
                </View>
              ))}
              {balances.length === 0 && (
                <Text style={styles.noData}>No balances. Deposit to start trading.</Text>
              )}
            </Card>
            <View style={styles.actionRow}>
              <Button title="Deposit" onPress={() => Alert.alert('Deposit', 'Mobile money deposit coming soon')} style={styles.actionBtn} accessibilityLabel="Deposit funds" />
              <Button title="Withdraw" onPress={() => Alert.alert('Withdraw', 'Withdrawal coming soon')} style={styles.actionBtn} accessibilityLabel="Withdraw funds" />
            </View>
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
  card: { marginBottom: spacing.md, padding: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.sm },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  bookRow: { flexDirection: 'row' },
  bookSide: { flex: 1 },
  bookDivider: { width: 1, backgroundColor: isDark ? darkColors.border : colors.gray200, marginHorizontal: spacing.sm },
  bookHeader: { fontSize: fontSize.xs, fontWeight: '700', color: isDark ? darkColors.textMuted : colors.gray500, marginBottom: spacing.xs, textAlign: 'center' },
  bookEntry: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  bookPrice: { fontSize: fontSize.sm, fontWeight: '600' },
  bookQty: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  noData: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray400, fontSize: fontSize.xs, padding: spacing.sm },
  tradeBtn: { marginTop: spacing.sm },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  orderMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600 },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, padding: spacing.xl, fontSize: fontSize.md },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: isDark ? darkColors.border : colors.gray100 },
  balanceCurrency: { fontSize: fontSize.lg, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  balanceAmount: { fontSize: fontSize.md, fontWeight: '600', color: colors.success, textAlign: 'right' },
  balanceLocked: { fontSize: fontSize.xs, color: colors.warning, textAlign: 'right' },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1 },
});
