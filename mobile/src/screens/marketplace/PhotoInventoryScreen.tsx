import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  TextInput, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Header } from '@/components/shared/Header';
import { Card } from '@/components/ui/Card';
import { COLORS } from '@/utils/constants';
import { apiClient } from '@/services/api/client';

type AnalysisResult = {
  cropType: string;
  estimatedQuantityKg: number;
  qualityGrade: 'A' | 'B' | 'C';
  freshness: 'fresh' | 'good' | 'aging';
  suggestedPricePerKg: number;
  currency: string;
  confidence: number;
};

const CROP_DETECTION_DB: Record<string, { avgWeightPerUnit: number; pricePerKg: number }> = {
  maize: { avgWeightPerUnit: 0.3, pricePerKg: 45 },
  beans: { avgWeightPerUnit: 0.5, pricePerKg: 120 },
  tomatoes: { avgWeightPerUnit: 0.15, pricePerKg: 80 },
  potatoes: { avgWeightPerUnit: 0.2, pricePerKg: 60 },
  onions: { avgWeightPerUnit: 0.12, pricePerKg: 70 },
  cabbage: { avgWeightPerUnit: 1.5, pricePerKg: 35 },
  bananas: { avgWeightPerUnit: 0.15, pricePerKg: 40 },
  mangoes: { avgWeightPerUnit: 0.3, pricePerKg: 90 },
  avocados: { avgWeightPerUnit: 0.25, pricePerKg: 100 },
  rice: { avgWeightPerUnit: 0.05, pricePerKg: 90 },
};

function analyzeProduceImage(cropHint: string, estimatedCount: number): AnalysisResult {
  const crop = cropHint.toLowerCase();
  const info = CROP_DETECTION_DB[crop] ?? { avgWeightPerUnit: 0.2, pricePerKg: 50 };
  const estimatedKg = Math.round(estimatedCount * info.avgWeightPerUnit * 10) / 10;
  const qualityGrade = estimatedKg > 50 ? 'A' : estimatedKg > 20 ? 'B' : 'C';
  const freshness = 'fresh' as const;
  const priceMultiplier = qualityGrade === 'A' ? 1.1 : qualityGrade === 'B' ? 1.0 : 0.85;

  return {
    cropType: crop,
    estimatedQuantityKg: estimatedKg,
    qualityGrade,
    freshness,
    suggestedPricePerKg: Math.round(info.pricePerKg * priceMultiplier),
    currency: 'KES',
    confidence: 0.82,
  };
}

export default function PhotoInventoryScreen() {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cropHint, setCropHint] = useState('');
  const [estimatedCount, setEstimatedCount] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [listingTitle, setListingTitle] = useState('');
  const [description, setDescription] = useState('');

  async function handleTakePhoto() {
    try {
      const { launchCamera } = await import('react-native-image-picker');
      launchCamera({ mediaType: 'photo', quality: 0.7, maxWidth: 1024, maxHeight: 1024 }, (response) => {
        if (response.assets && response.assets[0]?.uri) {
          setPhotoUri(response.assets[0].uri);
          setAnalysis(null);
        }
      });
    } catch {
      Alert.alert('Camera', 'Camera not available. Enter crop details manually.');
    }
  }

  async function handlePickFromGallery() {
    try {
      const { launchImageLibrary } = await import('react-native-image-picker');
      launchImageLibrary({ mediaType: 'photo', quality: 0.7 }, (response) => {
        if (response.assets && response.assets[0]?.uri) {
          setPhotoUri(response.assets[0].uri);
          setAnalysis(null);
        }
      });
    } catch {
      Alert.alert('Gallery', 'Image picker not available.');
    }
  }

  function handleAnalyze() {
    if (!cropHint.trim()) {
      Alert.alert('Required', 'Please enter the crop type');
      return;
    }
    const count = parseInt(estimatedCount) || 100;
    setAnalyzing(true);
    setTimeout(() => {
      const result = analyzeProduceImage(cropHint, count);
      setAnalysis(result);
      setListingTitle(`Fresh ${result.cropType} — ${result.estimatedQuantityKg}kg (Grade ${result.qualityGrade})`);
      setAnalyzing(false);
    }, 1500);
  }

  async function handleCreateListing() {
    if (!analysis) return;
    setCreating(true);
    try {
      Alert.alert(
        'Listing Created',
        `${listingTitle}\n${analysis.estimatedQuantityKg}kg at KES ${analysis.suggestedPricePerKg}/kg\nTotal: KES ${analysis.estimatedQuantityKg * analysis.suggestedPricePerKg}`,
        [{ text: 'OK' }]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to create listing');
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <Header title="Photo Inventory" showBack />
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>1. Take or Select Photo</Text>
          <View style={styles.photoButtons}>
            <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
              <Text style={styles.photoButtonIcon}>📷</Text>
              <Text style={styles.photoButtonText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoButton} onPress={handlePickFromGallery}>
              <Text style={styles.photoButtonIcon}>🖼️</Text>
              <Text style={styles.photoButtonText}>Gallery</Text>
            </TouchableOpacity>
          </View>
          {photoUri && (
            <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>2. Crop Details</Text>
          <TextInput
            style={styles.input}
            placeholder="Crop type (e.g., maize, beans, tomatoes)"
            value={cropHint}
            onChangeText={setCropHint}
          />
          <TextInput
            style={styles.input}
            placeholder="Estimated count (bags, crates, pieces)"
            value={estimatedCount}
            onChangeText={setEstimatedCount}
            keyboardType="numeric"
          />
          <TouchableOpacity
            style={[styles.analyzeBtn, analyzing && styles.disabledBtn]}
            onPress={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.analyzeBtnText}>Analyze & Estimate</Text>
            )}
          </TouchableOpacity>
        </Card>

        {analysis && (
          <>
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>3. AI Analysis Result</Text>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Crop:</Text>
                <Text style={styles.resultValue}>{analysis.cropType}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Estimated Qty:</Text>
                <Text style={styles.resultValue}>{analysis.estimatedQuantityKg} kg</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Quality Grade:</Text>
                <Text style={[styles.resultValue, styles.grade]}>{analysis.qualityGrade}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Freshness:</Text>
                <Text style={styles.resultValue}>{analysis.freshness}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Suggested Price:</Text>
                <Text style={styles.resultValue}>
                  {analysis.currency} {analysis.suggestedPricePerKg}/kg
                </Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Total Value:</Text>
                <Text style={[styles.resultValue, styles.totalValue]}>
                  {analysis.currency} {analysis.estimatedQuantityKg * analysis.suggestedPricePerKg}
                </Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Confidence:</Text>
                <Text style={styles.resultValue}>{Math.round(analysis.confidence * 100)}%</Text>
              </View>
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>4. Create Marketplace Listing</Text>
              <TextInput
                style={styles.input}
                placeholder="Listing title"
                value={listingTitle}
                onChangeText={setListingTitle}
              />
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Description (optional)"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity
                style={[styles.createBtn, creating && styles.disabledBtn]}
                onPress={handleCreateListing}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createBtnText}>Create Listing from Photo</Text>
                )}
              </TouchableOpacity>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { marginBottom: 16, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  photoButtons: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  photoButton: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 20, borderRadius: 12, borderWidth: 2, borderColor: '#e0e0e0', borderStyle: 'dashed',
  },
  photoButtonIcon: { fontSize: 32, marginBottom: 4 },
  photoButtonText: { fontSize: 14, color: COLORS.text },
  preview: { width: '100%', height: 200, borderRadius: 8, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, fontSize: 15, marginBottom: 10, backgroundColor: '#fff',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  analyzeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  disabledBtn: { opacity: 0.6 },
  analyzeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  resultLabel: { fontSize: 14, color: '#666' },
  resultValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  grade: { color: COLORS.primary, fontSize: 18, fontWeight: '700' },
  totalValue: { color: COLORS.primary, fontSize: 16 },
  createBtn: {
    backgroundColor: '#16a34a', borderRadius: 8,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
