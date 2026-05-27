import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { database } from '@/services/database';
import { useCamera } from '@/hooks/useCamera';
import { useLocation } from '@/hooks/useLocation';
import { Header } from '@/components/shared/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { COLORS, CROP_TYPES, UNITS } from '@/utils/constants';

export default function HarvestCreateScreen() {
  const [cropType, setCropType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const { takePicture } = useCamera();
  const { getCurrentLocation } = useLocation();

  const handleTakePhoto = async () => {
    const uri = await takePicture();
    if (uri) setPhotoUri(uri);
  };

  const handleSubmit = async () => {
    if (!cropType || !quantity) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const location = await getCurrentLocation();
      await database.createHarvest({
        cropType,
        quantity: parseFloat(quantity),
        unit,
        harvestDate: new Date().toISOString(),
        photoUri: photoUri || undefined,
        notes: notes || undefined,
        location: location || undefined,
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
      <Header title="Add Harvest" showBack />
      <ScrollView style={styles.content}>
        <Input label="Crop Type *" value={cropType} onChangeText={setCropType} placeholder="e.g., Wheat, Rice" />
        <Input label="Quantity *" value={quantity} onChangeText={setQuantity} placeholder="0" keyboardType="numeric" />
        <Input label="Unit" value={unit} onChangeText={setUnit} placeholder="kg" />
        <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline numberOfLines={4} />
        <Button title={photoUri ? 'Retake Photo' : 'Take Photo'} onPress={handleTakePhoto} variant="outline" style={styles.button} />
        <Button title="Save Harvest" onPress={handleSubmit} loading={loading} style={styles.button} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  button: { marginTop: 16 },
});
