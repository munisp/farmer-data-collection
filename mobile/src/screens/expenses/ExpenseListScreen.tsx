import React, { useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { database } from '@/services/database';
import type { Expense } from '@/types/models';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';

export default function ExpenseListScreen() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    setLoading(true);
    const data = await database.getAllExpenses();
    setExpenses(data);
    setLoading(false);
  };

  if (loading) return <Loading message="Loading expenses..." />;

  return (
    <View style={styles.container}>
      <Header title="Expenses" rightAction={{ label: '+ Add', onPress: () => navigation.navigate('ExpenseCreate' as never) }} />
      {expenses.length === 0 ? (
        <EmptyState title="No Expenses" message="Start tracking your farm expenses" actionLabel="Add Expense" onAction={() => navigation.navigate('ExpenseCreate' as never)} />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('ExpenseDetail' as never, { id: item.id } as never)}>
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.category}>{item.category}</Text>
                  {!item.synced && <Badge text="Pending" variant="warning" />}
                </View>
                <Text style={styles.amount}>${item.amount.toFixed(2)}</Text>
                <Text style={styles.date}>{new Date(item.expenseDate).toLocaleDateString()}</Text>
              </Card>
            </TouchableOpacity>
          )}
          onRefresh={loadExpenses}
          refreshing={loading}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  card: { margin: 16, marginBottom: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  category: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  amount: { fontSize: 16, color: COLORS.text, marginBottom: 4 },
  date: { fontSize: 14, color: COLORS.textLight },
});
