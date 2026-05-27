import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';
import { apiClient, type MarketplaceProduct } from '@/services/api/client';

export default function MarketplaceDetailScreen() {
  const [item, setItem] = useState<MarketplaceProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params as { id: string };

  useEffect(() => {
    void loadItem();
  }, [id]);

  const loadItem = async () => {
    setLoading(true);
    try {
      const product = await apiClient.getMarketplaceProduct(id);
      setItem(product);
    } catch (error: any) {
      Alert.alert('Product unavailable', error?.message || 'Unable to load this product right now.');
      setItem(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyNow = () => {
    if (!item) return;
    navigation.navigate('Checkout' as never, { item } as never);
  };

  const handleContactSeller = () => {
    Alert.alert('Seller contact', 'Seller contact integration has not been enabled yet, but the listing data is now live.');
  };

  if (loading) return <Loading />;
  if (!item) return <View style={styles.empty}><Text>Product not found</Text></View>;

  return (
    <View style={styles.container}>
      <Header title="Product Details" showBack />
      <ScrollView style={styles.content}>
        <Text style={styles.name}>{item.name}</Text>
        <View style={styles.row}>
          <Badge text={item.category} variant="info" />
          {item.status === 'active' && <Badge text="Available" variant="success" />}
        </View>
        <Text style={styles.price}>${item.price.toFixed(2)} / {item.unit}</Text>
        <View style={styles.section}>
          <Text style={styles.label}>Available Quantity</Text>
          <Text style={styles.value}>{item.quantityAvailable} {item.unit}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Average Rating</Text>
          <Text style={styles.value}>{(item.averageRating || 0).toFixed(1)} / 5 ({item.totalReviews || 0} reviews)</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>
        <Button title="Buy Now" onPress={handleBuyNow} style={styles.button} />
        <Button title="Contact Seller" onPress={handleContactSeller} variant="outline" style={styles.button} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  name: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  price: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginBottom: 16 },
  section: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textLight, marginBottom: 4 },
  value: { fontSize: 16, color: COLORS.text },
  description: { fontSize: 16, color: COLORS.text, lineHeight: 24 },
  button: { marginTop: 16 },
});
