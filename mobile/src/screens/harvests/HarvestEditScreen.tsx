import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { database } from '@/services/database';
import { Header } from '@/components/shared/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/shared/Loading';
import { COLORS } from '@/utils/constants';

export default function HarvestEditScreen() {
  const [cropType, setCropType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params as { id: string };

  useEffect(() => {
    loadHarvest();
  }, [id]);

  const loadHarvest = async () => {
    const harvest = await database.getHarvestById(id);
    if (harvest) {
      setCropType(harvest.cropType);
      setQuantity(String(harvest.quantity));
      setUnit(harvest.unit);
      setNotes(harvest.notes || '');
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!cropType || !quantity) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const harvest = await database.getHarvestById(id);
      if (harvest) {
        await database.updateHarvest({
          ...harvest,
          cropType,
          quantity: parseFloat(quantity),
          unit,
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
      <Header title="Edit Harvest" showBack />
      <ScrollView style={styles.content}>
        <Input label="Crop Type *" value={cropType} onChangeText={setCropType} />
        <Input label="Quantity *" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
        <Input label="Unit" value={unit} onChangeText={setUnit} />
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
