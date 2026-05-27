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
import { useNavigation } from '@react-navigation/native';
import { database } from '@/services/database';
import { useSyncStore } from '@/stores/syncStore';

interface FarmerFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  nationalId: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
  village: string;
  district: string;
  region: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

const initialFormData: FarmerFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  nationalId: '',
  dateOfBirth: '',
  gender: 'male',
  village: '',
  district: '',
  region: '',
  address: '',
  latitude: null,
  longitude: null,
};

export default function FarmerRegistrationScreen() {
  const navigation = useNavigation();
  const { updatePendingCount } = useSyncStore();
  const [formData, setFormData] = useState<FarmerFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [step, setStep] = useState(1);

  const updateField = (field: keyof FarmerFormData, value: string) => {
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

      Alert.alert('Success', 'Location captured successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to get location. Please try again.');
      console.error('Location error:', error);
    } finally {
      setGettingLocation(false);
    }
  };

  const validateStep1 = () => {
    if (!formData.firstName.trim()) {
      Alert.alert('Validation Error', 'First name is required');
      return false;
    }
    if (!formData.lastName.trim()) {
      Alert.alert('Validation Error', 'Last name is required');
      return false;
    }
    if (!formData.phone.trim()) {
      Alert.alert('Validation Error', 'Phone number is required');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.village.trim()) {
      Alert.alert('Validation Error', 'Village is required');
      return false;
    }
    if (!formData.district.trim()) {
      Alert.alert('Validation Error', 'District is required');
      return false;
    }
    if (!formData.region.trim()) {
      Alert.alert('Validation Error', 'Region is required');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const farmerId = `farmer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const farmerRecord = {
        id: farmerId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        email: formData.email || null,
        nationalId: formData.nationalId || null,
        dateOfBirth: formData.dateOfBirth || null,
        gender: formData.gender,
        village: formData.village,
        district: formData.district,
        region: formData.region,
        address: formData.address || null,
        latitude: formData.latitude,
        longitude: formData.longitude,
        status: 'active',
        synced: false,
        createdAt: now,
        updatedAt: now,
      };

      await database.createFarmer(farmerRecord);
      await updatePendingCount();

      Alert.alert(
        'Success',
        'Farmer registered successfully! The data will sync when you have internet connection.',
        [
          {
            text: 'Register Another',
            onPress: () => {
              setFormData(initialFormData);
              setStep(1);
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
      Alert.alert('Error', 'Failed to register farmer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Personal Information</Text>
      <Text style={styles.stepDescription}>Enter the farmer's basic details</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>First Name *</Text>
        <TextInput
          style={styles.input}
          value={formData.firstName}
          onChangeText={(text) => updateField('firstName', text)}
          placeholder="Enter first name"
          autoCapitalize="words"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Last Name *</Text>
        <TextInput
          style={styles.input}
          value={formData.lastName}
          onChangeText={(text) => updateField('lastName', text)}
          placeholder="Enter last name"
          autoCapitalize="words"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phone Number *</Text>
        <TextInput
          style={styles.input}
          value={formData.phone}
          onChangeText={(text) => updateField('phone', text)}
          placeholder="e.g., +234 801 234 5678"
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email (Optional)</Text>
        <TextInput
          style={styles.input}
          value={formData.email}
          onChangeText={(text) => updateField('email', text)}
          placeholder="Enter email address"
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>National ID (Optional)</Text>
        <TextInput
          style={styles.input}
          value={formData.nationalId}
          onChangeText={(text) => updateField('nationalId', text)}
          placeholder="Enter national ID number"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Gender</Text>
        <View style={styles.genderContainer}>
          {(['male', 'female', 'other'] as const).map((gender) => (
            <TouchableOpacity
              key={gender}
              style={[
                styles.genderButton,
                formData.gender === gender && styles.genderButtonActive,
              ]}
              onPress={() => updateField('gender', gender)}
            >
              <Text
                style={[
                  styles.genderButtonText,
                  formData.gender === gender && styles.genderButtonTextActive,
                ]}
              >
                {gender.charAt(0).toUpperCase() + gender.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Location Information</Text>
      <Text style={styles.stepDescription}>Enter the farmer's location details</Text>

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
        <Text style={styles.label}>State/Region *</Text>
        <TextInput
          style={styles.input}
          value={formData.region}
          onChangeText={(text) => updateField('region', text)}
          placeholder="Enter state or region"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Address (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.address}
          onChangeText={(text) => updateField('address', text)}
          placeholder="Enter full address"
          multiline
          numberOfLines={3}
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
              {formData.latitude ? 'Update Location' : 'Capture GPS Location'}
            </Text>
          )}
        </TouchableOpacity>
        {formData.latitude && formData.longitude && (
          <Text style={styles.coordinatesText}>
            Lat: {formData.latitude.toFixed(6)}, Lng: {formData.longitude.toFixed(6)}
          </Text>
        )}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Review & Submit</Text>
      <Text style={styles.stepDescription}>Please review the information before submitting</Text>

      <View style={styles.reviewCard}>
        <Text style={styles.reviewSection}>Personal Information</Text>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Name:</Text>
          <Text style={styles.reviewValue}>{formData.firstName} {formData.lastName}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Phone:</Text>
          <Text style={styles.reviewValue}>{formData.phone}</Text>
        </View>
        {formData.email && (
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Email:</Text>
            <Text style={styles.reviewValue}>{formData.email}</Text>
          </View>
        )}
        {formData.nationalId && (
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>National ID:</Text>
            <Text style={styles.reviewValue}>{formData.nationalId}</Text>
          </View>
        )}
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Gender:</Text>
          <Text style={styles.reviewValue}>{formData.gender}</Text>
        </View>
      </View>

      <View style={styles.reviewCard}>
        <Text style={styles.reviewSection}>Location</Text>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Village:</Text>
          <Text style={styles.reviewValue}>{formData.village}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>District:</Text>
          <Text style={styles.reviewValue}>{formData.district}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Region:</Text>
          <Text style={styles.reviewValue}>{formData.region}</Text>
        </View>
        {formData.latitude && formData.longitude && (
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>GPS:</Text>
            <Text style={styles.reviewValue}>
              {formData.latitude.toFixed(4)}, {formData.longitude.toFixed(4)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Register Farmer</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.progressContainer}>
        {[1, 2, 3].map((s) => (
          <View
            key={s}
            style={[
              styles.progressStep,
              s <= step && styles.progressStepActive,
            ]}
          />
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>

      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity
            style={[styles.nextBtn, step === 1 && styles.nextBtnFull]}
            onPress={handleNext}
          >
            <Text style={styles.nextBtnText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Register Farmer</Text>
            )}
          </TouchableOpacity>
        )}
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
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#fff',
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
  },
  progressStepActive: {
    backgroundColor: '#166534',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  stepContainer: {
    paddingBottom: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  genderContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  genderButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  genderButtonActive: {
    borderColor: '#166534',
    backgroundColor: '#f0fdf4',
  },
  genderButtonText: {
    fontSize: 14,
    color: '#64748b',
  },
  genderButtonTextActive: {
    color: '#166534',
    fontWeight: '600',
  },
  locationButton: {
    backgroundColor: '#166534',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  coordinatesText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  reviewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reviewSection: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  reviewLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#166534',
    borderRadius: 8,
    alignItems: 'center',
  },
  nextBtnFull: {
    flex: 1,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  submitBtn: {
    flex: 1,
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
