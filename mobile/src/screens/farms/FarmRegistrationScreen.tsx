import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useNavigation, useRoute } from '@react-navigation/native';
import { database } from '@/services/database';
import { useSyncStore } from '@/stores/syncStore';

const SOIL_TYPES = ['Clay', 'Sandy', 'Loamy', 'Silt', 'Peat', 'Chalky', 'Mixed'];
const IRRIGATION_METHODS = ['Rainfed', 'Drip', 'Sprinkler', 'Flood', 'Canal', 'Well', 'None'];

interface FarmFormData {
  name: string;
  farmerId: string;
  size: string;
  sizeUnit: 'hectares' | 'acres';
  soilType: string;
  irrigationMethod: string;
  village: string;
  district: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
}

const initialFormData: FarmFormData = {
  name: '',
  farmerId: '',
  size: '',
  sizeUnit: 'hectares',
  soilType: '',
  irrigationMethod: '',
  village: '',
  district: '',
  region: '',
  latitude: null,
  longitude: null,
  notes: '',
};

export default function FarmRegistrationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { updatePendingCount } = useSyncStore();
  
  const preselectedFarmerId = (route.params as any)?.farmerId || '';
  
  const [formData, setFormData] = useState<FarmFormData>({
    ...initialFormData,
    farmerId: preselectedFarmerId,
  });
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  const updateField = (field: keyof FarmFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to capture GPS coordinates.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setFormData((prev) => ({
        ...prev,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }));

      Alert.alert('Success', 'Farm location captured successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to get location. Please try again.');
      console.error('Location error:', error);
    } finally {
      setGettingLocation(false);
    }
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      Alert.alert('Validation Error', 'Farm name is required');
      return false;
    }
    if (!formData.size.trim() || isNaN(parseFloat(formData.size))) {
      Alert.alert('Validation Error', 'Valid farm size is required');
      return false;
    }
    if (!formData.village.trim()) {
      Alert.alert('Validation Error', 'Village is required');
      return false;
    }
    if (!formData.district.trim()) {
      Alert.alert('Validation Error', 'District is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const farmId = `farm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const farmRecord = {
        id: farmId,
        name: formData.name,
        farmerId: formData.farmerId || null,
        size: parseFloat(formData.size),
        sizeUnit: formData.sizeUnit,
        soilType: formData.soilType || null,
        irrigationMethod: formData.irrigationMethod || null,
        village: formData.village,
        district: formData.district,
        region: formData.region || null,
        latitude: formData.latitude,
        longitude: formData.longitude,
        notes: formData.notes || null,
        status: 'active',
        synced: false,
        createdAt: now,
        updatedAt: now,
      };

      await database.createFarm(farmRecord);
      await updatePendingCount();

      Alert.alert(
        'Success',
        'Farm registered successfully! The data will sync when you have internet connection.',
        [
          {
            text: 'Register Another',
            onPress: () => {
              setFormData({
                ...initialFormData,
                farmerId: preselectedFarmerId,
              });
            },
          },
          {
            text: 'Go Back',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Registration error:', error);
      Alert.alert('Error', 'Failed to register farm. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Register Farm</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Farm Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Farm Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => updateField('name', text)}
              placeholder="e.g., North Field, Main Farm"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Farm Size *</Text>
            <View style={styles.sizeContainer}>
              <TextInput
                style={[styles.input, styles.sizeInput]}
                value={formData.size}
                onChangeText={(text) => updateField('size', text)}
                placeholder="Enter size"
                keyboardType="decimal-pad"
              />
              <View style={styles.unitContainer}>
                {(['hectares', 'acres'] as const).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.unitButton,
                      formData.sizeUnit === unit && styles.unitButtonActive,
                    ]}
                    onPress={() => updateField('sizeUnit', unit)}
                  >
                    <Text
                      style={[
                        styles.unitButtonText,
                        formData.sizeUnit === unit && styles.unitButtonTextActive,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Soil Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipContainer}>
                {SOIL_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.chip,
                      formData.soilType === type && styles.chipActive,
                    ]}
                    onPress={() => updateField('soilType', type)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        formData.soilType === type && styles.chipTextActive,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Irrigation Method</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipContainer}>
                {IRRIGATION_METHODS.map((method) => (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.chip,
                      formData.irrigationMethod === method && styles.chipActive,
                    ]}
                    onPress={() => updateField('irrigationMethod', method)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        formData.irrigationMethod === method && styles.chipTextActive,
                      ]}
                    >
                      {method}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Village *</Text>
            <TextInput
              style={styles.input}
              value={formData.village}
              onChangeText={(text) => updateField('village', text)}
              placeholder="Enter village name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>District/LGA *</Text>
            <TextInput
              style={styles.input}
              value={formData.district}
              onChangeText={(text) => updateField('district', text)}
              placeholder="Enter district or LGA"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>State/Region</Text>
            <TextInput
              style={styles.input}
              value={formData.region}
              onChangeText={(text) => updateField('region', text)}
              placeholder="Enter state or region"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>GPS Coordinates</Text>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={getCurrentLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.locationButtonText}>
                  {formData.latitude ? 'Update Farm Location' : 'Capture Farm GPS'}
                </Text>
              )}
            </TouchableOpacity>
            {formData.latitude && formData.longitude && (
              <View style={styles.coordinatesCard}>
                <Text style={styles.coordinatesLabel}>Captured Coordinates:</Text>
                <Text style={styles.coordinatesValue}>
                  {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Information</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.notes}
              onChangeText={(text) => updateField('notes', text)}
              placeholder="Any additional notes about the farm..."
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Register Farm</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    fontSize: 16,
    color: '#166534',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  headerRight: {
    width: 50,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sizeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  sizeInput: {
    flex: 1,
  },
  unitContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  unitButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  unitButtonActive: {
    borderColor: '#166534',
    backgroundColor: '#f0fdf4',
  },
  unitButtonText: {
    fontSize: 14,
    color: '#64748b',
  },
  unitButtonTextActive: {
    color: '#166534',
    fontWeight: '600',
  },
  chipContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: '#166534',
    backgroundColor: '#f0fdf4',
  },
  chipText: {
    fontSize: 14,
    color: '#64748b',
  },
  chipTextActive: {
    color: '#166534',
    fontWeight: '600',
  },
  locationButton: {
    backgroundColor: '#166534',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  coordinatesCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  coordinatesLabel: {
    fontSize: 12,
    color: '#166534',
    marginBottom: 4,
  },
  coordinatesValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  bottomPadding: {
    height: 24,
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  submitBtn: {
    paddingVertical: 14,
    backgroundColor: '#166534',
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
