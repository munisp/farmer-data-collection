import React, { useState } from 'react';
import { View, FlatList, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Header } from '@/components/shared/Header';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/utils/constants';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
}

export default function CartScreen() {
  const [cartItems, setCartItems] = useState<CartItem[]>([
    { id: '1', name: 'Wheat Seeds', price: 45.00, quantity: 10, unit: 'kg' },
    { id: '2', name: 'Organic Fertilizer', price: 30.00, quantity: 5, unit: 'bag' },
  ]);
  const navigation = useNavigation();

  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleRemoveItem = (id: string) => {
    Alert.alert('Remove Item', 'Remove this item from cart?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        setCartItems(prev => prev.filter(item => item.id !== id));
      }},
    ]);
  };

  const handleCheckout = () => {
    navigation.navigate('Checkout' as never);
  };

  if (cartItems.length === 0) {
    return (
      <View style={styles.container}>
        <Header title="Cart" />
        <EmptyState 
          title="Cart is Empty" 
          message="Add products from marketplace to your cart" 
          actionLabel="Browse Marketplace"
          onAction={() => navigation.navigate('MarketplaceBrowse' as never)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Cart" />
      <FlatList
        data={cartItems}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.quantity}>{item.quantity} {item.unit} × ${item.price.toFixed(2)}</Text>
            <Text style={styles.subtotal}>${(item.price * item.quantity).toFixed(2)}</Text>
            <Button title="Remove" onPress={() => handleRemoveItem(item.id)} variant="danger" size="small" style={styles.removeButton} />
          </Card>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalAmount}>${total.toFixed(2)}</Text>
        </View>
        <Button title="Proceed to Checkout" onPress={handleCheckout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  card: { margin: 16, marginBottom: 0 },
  name: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  quantity: { fontSize: 14, color: COLORS.textLight, marginBottom: 4 },
  subtotal: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  removeButton: { marginTop: 8 },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  totalAmount: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
});
