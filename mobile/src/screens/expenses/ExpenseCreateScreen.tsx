import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { database } from '@/services/database';
import { useCamera } from '@/hooks/useCamera';
import { Header } from '@/components/shared/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/utils/constants';

export default function ExpenseCreateScreen() {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const { takePicture } = useCamera();

  const handleTakePhoto = async () => {
    const uri = await takePicture();
    if (uri) setReceiptUri(uri);
  };

  const handleSubmit = async () => {
    if (!category || !amount) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      await database.createExpense({
        category,
        amount: parseFloat(amount),
        expenseDate: new Date().toISOString(),
        receiptUri: receiptUri || undefined,
        notes: notes || undefined,
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Add Expense" showBack />
      <ScrollView style={styles.content}>
        <Input label="Category *" value={category} onChangeText={setCategory} placeholder="e.g., Seeds, Fertilizer" />
        <Input label="Amount *" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="numeric" />
        <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline numberOfLines={4} />
        <Button title={receiptUri ? 'Retake Photo' : 'Take Receipt Photo'} onPress={handleTakePhoto} variant="outline" style={styles.button} />
        <Button title="Save Expense" onPress={handleSubmit} loading={loading} style={styles.button} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  button: { marginTop: 16 },
});
