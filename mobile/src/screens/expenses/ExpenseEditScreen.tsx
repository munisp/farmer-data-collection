import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { database } from '@/services/database';
import { Header } from '@/components/shared/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/shared/Loading';
import { COLORS } from '@/utils/constants';

export default function ExpenseEditScreen() {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params as { id: string };

  useEffect(() => {
    loadExpense();
  }, [id]);

  const loadExpense = async () => {
    const expense = await database.getExpenseById(id);
    if (expense) {
      setCategory(expense.category);
      setAmount(String(expense.amount));
      setNotes(expense.notes || '');
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!category || !amount) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const expense = await database.getExpenseById(id);
      if (expense) {
        await database.updateExpense({
          ...expense,
          category,
          amount: parseFloat(amount),
          notes,
          synced: false,
        });
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', String(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <View style={styles.container}>
      <Header title="Edit Expense" showBack />
      <ScrollView style={styles.content}>
        <Input label="Category *" value={category} onChangeText={setCategory} />
        <Input label="Amount *" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Input label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={4} />
        <Button title="Save Changes" onPress={handleSubmit} loading={saving} style={styles.button} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  button: { marginTop: 16 },
});
