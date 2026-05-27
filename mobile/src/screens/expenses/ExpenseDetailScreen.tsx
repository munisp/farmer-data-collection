import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { database } from '@/services/database';
import type { Expense } from '@/types/models';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';

export default function ExpenseDetailScreen() {
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params as { id: string };

  useEffect(() => {
    loadExpense();
  }, [id]);

  const loadExpense = async () => {
    const data = await database.getExpenseById(id);
    setExpense(data);
    setLoading(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete Expense', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await database.deleteExpense(id);
        navigation.goBack();
      }},
    ]);
  };

  if (loading) return <Loading />;
  if (!expense) return <View><Text>Expense not found</Text></View>;

  return (
    <View style={styles.container}>
      <Header title="Expense Details" showBack />
      <ScrollView style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.label}>Category</Text>
          <Text style={styles.value}>{expense.category}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Amount</Text>
          <Text style={styles.value}>${expense.amount.toFixed(2)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{new Date(expense.expenseDate).toLocaleDateString()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Sync Status</Text>
          <Badge text={expense.synced ? 'Synced' : 'Pending'} variant={expense.synced ? 'success' : 'warning'} />
        </View>
        {expense.receiptUri && <Image source={{ uri: expense.receiptUri }} style={styles.photo} />}
        {expense.notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.notes}>{expense.notes}</Text>
          </View>
        )}
        <Button title="Edit" onPress={() => navigation.navigate('ExpenseEdit' as never, { id } as never)} style={styles.button} />
        <Button title="Delete" onPress={handleDelete} variant="danger" style={styles.button} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textLight },
  value: { fontSize: 16, color: COLORS.text },
  photo: { width: '100%', height: 200, borderRadius: 12, marginVertical: 16 },
  notesContainer: { marginVertical: 16 },
  notes: { fontSize: 14, color: COLORS.text, marginTop: 8 },
  button: { marginTop: 16 },
});
