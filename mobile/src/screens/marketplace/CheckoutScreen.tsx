import { useMemo, useState } from 'react';
import { View, ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Header } from '@/components/shared/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS } from '@/utils/constants';
import { apiClient, type MarketplaceProduct } from '@/services/api/client';

export default function CheckoutScreen() {
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const item = ((route.params as any)?.item || null) as MarketplaceProduct | null;

  const parsedQuantity = Math.max(1, Number.parseInt(quantity || '1', 10) || 1);
  const deliveryFee = useMemo(() => (item ? 20 : 0), [item]);
  const subtotal = useMemo(() => (item ? item.price * parsedQuantity : 0), [item, parsedQuantity]);
  const total = subtotal + deliveryFee;

  const handlePlaceOrder = async () => {
    if (!item) {
      Alert.alert('No item selected', 'Please return to the marketplace and choose a product first.');
      return;
    }

    if (!deliveryAddress || !phone) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (parsedQuantity > item.quantityAvailable) {
      Alert.alert('Insufficient stock', 'The requested quantity exceeds the available stock.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.createMarketplaceOrder({
        productId: Number(item.id),
        quantity: parsedQuantity,
        price: item.price,
        shippingAddress: {
          street: deliveryAddress,
          city: notes || 'Unspecified',
          state: 'N/A',
          zipCode: phone,
          country: 'Kenya',
        },
        paymentMethod: 'cash_on_delivery',
      });

      setLoading(false);
      Alert.alert('Order Placed', 'Your marketplace order has been created successfully.', [
        { text: 'View Orders', onPress: () => navigation.navigate('Orders' as never) },
      ]);
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Order failed', error?.message || 'Unable to place your order right now.');
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Checkout" showBack />
      <ScrollView style={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          {item ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Product:</Text>
                <Text style={styles.value}>{item.name}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Unit Price:</Text>
                <Text style={styles.value}>${item.price.toFixed(2)}</Text>
              </View>
              <Input
                label="Quantity *"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                placeholder={`Max ${item.quantityAvailable}`}
              />
              <View style={styles.row}>
                <Text style={styles.label}>Subtotal:</Text>
                <Text style={styles.value}>${subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Delivery Fee:</Text>
                <Text style={styles.value}>${deliveryFee.toFixed(2)}</Text>
              </View>
              <View style={[styles.row, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total:</Text>
                <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.value}>No product selected.</Text>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery Information</Text>
          <Input
            label="Delivery Address *"
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
            placeholder="Enter your delivery address"
            multiline
            numberOfLines={3}
          />
          <Input
            label="Phone Number *"
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter your phone number"
            keyboardType="phone-pad"
          />
          <Input
            label="Delivery Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional delivery instructions"
            multiline
            numberOfLines={3}
          />
        </Card>

        <Button
          title="Place Order"
          onPress={handlePlaceOrder}
          loading={loading}
          style={styles.button}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  card: { marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 12 },
  label: { fontSize: 16, color: COLORS.textLight, flex: 1 },
  value: { fontSize: 16, color: COLORS.text, flex: 1, textAlign: 'right' },
  totalRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  button: { marginTop: 16 },
});
