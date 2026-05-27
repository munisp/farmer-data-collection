import { useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity, Text, StyleSheet, TextInput, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';
import { apiClient, type MarketplaceProduct } from '@/services/api/client';

export default function MarketplaceBrowseScreen() {
  const [items, setItems] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const navigation = useNavigation();

  useEffect(() => {
    void loadItems();
  }, []);

  const loadItems = async (keyword?: string, silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const results = await apiClient.searchMarketplaceProducts(keyword);
      setItems(results);
    } catch (error: any) {
      Alert.alert('Marketplace unavailable', error?.message || 'Unable to load marketplace products right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
  });

  if (loading) return <Loading message="Loading marketplace..." />;

  return (
    <View style={styles.container}>
      <Header title="Marketplace" />
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            void loadItems(value, true);
          }}
        />
      </View>
      {filteredItems.length === 0 ? (
        <EmptyState title="No Products" message="No active marketplace listings match your search." />
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadItems(search);
              }}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('MarketplaceDetail' as never, { id: item.id } as never)}>
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.status === 'active' && <Badge text="Available" variant="success" />}
                </View>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.price}>${item.price.toFixed(2)} / {item.unit}</Text>
                <Text style={styles.seller}>Stock available: {item.quantityAvailable} {item.unit}</Text>
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
  searchContainer: { padding: 16 },
  searchInput: { backgroundColor: '#fff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  card: { margin: 16, marginTop: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 },
  name: { flex: 1, fontSize: 18, fontWeight: '600', color: COLORS.text },
  category: { fontSize: 14, color: COLORS.textLight, marginBottom: 4 },
  price: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary, marginBottom: 4 },
  seller: { fontSize: 14, color: COLORS.textLight },
});
