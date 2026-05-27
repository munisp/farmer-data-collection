import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { database } from '@/services/database';
import type { Harvest } from '@/types/models';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';

export default function HarvestDetailScreen() {
  const [harvest, setHarvest] = useState<Harvest | null>(null);
  const [loading, setLoading] = useState(true);
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params as { id: string };

  useEffect(() => {
    loadHarvest();
  }, [id]);

  const loadHarvest = async () => {
    const data = await database.getHarvestById(id);
    setHarvest(data);
    setLoading(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete Harvest', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await database.deleteHarvest(id);
        navigation.goBack();
      }},
    ]);
  };

  if (loading) return <Loading />;
  if (!harvest) return <View><Text>Harvest not found</Text></View>;

  return (
    <View style={styles.container}>
      <Header title="Harvest Details" showBack />
      <ScrollView style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.label}>Crop Type</Text>
          <Text style={styles.value}>{harvest.cropType}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Quantity</Text>
          <Text style={styles.value}>{harvest.quantity} {harvest.unit}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{new Date(harvest.harvestDate).toLocaleDateString()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Sync Status</Text>
          <Badge text={harvest.synced ? 'Synced' : 'Pending'} variant={harvest.synced ? 'success' : 'warning'} />
        </View>
        {harvest.photoUri && <Image source={{ uri: harvest.photoUri }} style={styles.photo} />}
        {harvest.notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.notes}>{harvest.notes}</Text>
          </View>
        )}
        <Button title="Edit" onPress={() => navigation.navigate('HarvestEdit' as never, { id } as never)} style={styles.button} />
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
