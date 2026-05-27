import React, { useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { database } from '@/services/database';
import { useSyncStore } from '@/stores/syncStore';
import type { Harvest } from '@/types/models';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';

export default function HarvestListScreen() {
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();
  const { updatePendingCount } = useSyncStore();

  useEffect(() => {
    loadHarvests();
  }, []);

  const loadHarvests = async () => {
    setLoading(true);
    const data = await database.getAllHarvests();
    setHarvests(data);
    await updatePendingCount();
    setLoading(false);
  };

  if (loading) return <Loading message="Loading harvests..." />;

  return (
    <View style={styles.container}>
      <Header title="Harvests" rightAction={{ label: '+ Add', onPress: () => navigation.navigate('HarvestCreate' as never) }} />
      {harvests.length === 0 ? (
        <EmptyState title="No Harvests" message="Start by recording your first harvest" actionLabel="Add Harvest" onAction={() => navigation.navigate('HarvestCreate' as never)} />
      ) : (
        <FlatList
          data={harvests}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('HarvestDetail' as never, { id: item.id } as never)}>
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.cropType}>{item.cropType}</Text>
                  {!item.synced && <Badge text="Pending" variant="warning" />}
                </View>
                <Text style={styles.quantity}>{item.quantity} {item.unit}</Text>
                <Text style={styles.date}>{new Date(item.harvestDate).toLocaleDateString()}</Text>
              </Card>
            </TouchableOpacity>
          )}
          onRefresh={loadHarvests}
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
  cropType: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  quantity: { fontSize: 16, color: COLORS.text, marginBottom: 4 },
  date: { fontSize: 14, color: COLORS.textLight },
});
