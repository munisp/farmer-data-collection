import { useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity, Text, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';
import { apiClient, type MarketplaceOrderSummary } from '@/services/api/client';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<MarketplaceOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    void loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await apiClient.listMarketplaceOrders();
      setOrders(data);
    } catch (error: any) {
      Alert.alert('Orders unavailable', error?.message || 'Unable to load your orders right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getStatusVariant = (status: MarketplaceOrderSummary['status']) => {
    switch (status) {
      case 'delivered': return 'success';
      case 'shipped': return 'info';
      case 'processing': return 'warning';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  if (loading) return <Loading message="Loading orders..." />;

  return (
    <View style={styles.container}>
      <Header title="My Orders" />
      {orders.length === 0 ? (
        <EmptyState
          title="No Orders"
          message="You haven't placed any marketplace orders yet."
          actionLabel="Browse Marketplace"
          onAction={() => navigation.navigate('MarketplaceBrowse' as never)}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadOrders();
              }}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity>
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                  <Badge text={item.status} variant={getStatusVariant(item.status)} />
                </View>
                <Text style={styles.date}>{new Date(item.date).toLocaleDateString()}</Text>
                <Text style={styles.items}>{item.itemCount} item{item.itemCount === 1 ? '' : 's'}</Text>
                <Text style={styles.total}>${item.total.toFixed(2)}</Text>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  card: { margin: 16, marginBottom: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderNumber: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  date: { fontSize: 14, color: COLORS.textLight, marginBottom: 4 },
  items: { fontSize: 14, color: COLORS.textLight, marginBottom: 4 },
  total: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
});
