import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, ScrollView, Text, StyleSheet, Alert, Platform,
  TouchableOpacity, ActivityIndicator, Dimensions,
} from 'react-native';
import { Header } from '@/components/shared/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS } from '@/utils/constants';

// Types for soil analysis
interface LabReadings {
  ph: string;
  nitrogen_ppm: string;
  phosphorus_ppm: string;
  potassium_ppm: string;
  organic_matter_pct: string;
  cec_meq_100g: string;
  moisture_pct: string;
}

interface LabInterpretation {
  value: number;
  unit: string;
  status: 'low' | 'optimal' | 'high';
  optimal_range: string;
  action: string;
}

interface Recommendation {
  action: string;
  confidence: number;
  description: string;
}

interface CropSuitability {
  crop: string;
  suitability: string;
  note?: string;
}

interface SoilResult {
  health_score: number;
  health_category: string;
  fertility_class: string;
  fertility_confidence: number;
  recommendations: Recommendation[];
  lab_interpretation: Record<string, LabInterpretation>;
  crop_suitability: CropSuitability[];
  modalities_used: { photo: boolean; lab_readings: boolean; location: boolean };
  inference_ms: number;
}

interface HistoricalTest {
  id: string;
  timestamp: string;
  health_score: number;
  health_category: string;
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
}

interface BluetoothDevice {
  id: string;
  name: string;
  type: 'ph_meter' | 'npk_sensor' | 'cec_meter' | 'multi_meter';
  connected: boolean;
}

const OPTIMAL_RANGES = {
  ph: { min: 6.0, max: 7.0, label: 'pH' },
  nitrogen_ppm: { min: 40, max: 120, label: 'Nitrogen (ppm)' },
  phosphorus_ppm: { min: 15, max: 60, label: 'Phosphorus (ppm)' },
  potassium_ppm: { min: 100, max: 250, label: 'Potassium (ppm)' },
  organic_matter_pct: { min: 2.0, max: 6.0, label: 'Organic Matter (%)' },
  cec_meq_100g: { min: 10, max: 30, label: 'CEC (meq/100g)' },
  moisture_pct: { min: 20, max: 60, label: 'Moisture (%)' },
};

const STATUS_COLORS = {
  low: '#E74C3C',
  optimal: '#27AE60',
  high: '#F39C12',
};

export default function SoilAnalysisScreen() {
  // Photo state
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoTensor, setPhotoTensor] = useState<number[][][] | null>(null);

  // Lab readings (manual or from Bluetooth kit)
  const [labReadings, setLabReadings] = useState<LabReadings>({
    ph: '', nitrogen_ppm: '', phosphorus_ppm: '',
    potassium_ppm: '', organic_matter_pct: '',
    cec_meq_100g: '', moisture_pct: '',
  });

  // GPS
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Bluetooth
  const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [scanning, setScanning] = useState(false);

  // Results
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SoilResult | null>(null);
  const [history, setHistory] = useState<HistoricalTest[]>([]);

  // Active tab
  const [activeTab, setActiveTab] = useState<'input' | 'results' | 'history'>('input');

  // Capture GPS on mount
  useEffect(() => {
    captureGPS();
  }, []);

  const captureGPS = useCallback(() => {
    setGpsLoading(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude);
          setLongitude(pos.coords.longitude);
          setGpsLoading(false);
        },
        () => {
          Alert.alert('GPS Error', 'Unable to get location. Soil analysis will proceed without location context.');
          setGpsLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      setGpsLoading(false);
    }
  }, []);

  const handleCapturePhoto = useCallback(async () => {
    try {
      // Use ImagePicker or Camera API
      // In production, use react-native-image-picker or expo-image-picker
      Alert.alert(
        'Capture Soil Photo',
        'Take a photo of the soil surface (top 15cm). Hold the phone 30cm above the soil for best results.',
        [
          { text: 'Camera', onPress: () => simulatePhotoCapture('camera') },
          { text: 'Gallery', onPress: () => simulatePhotoCapture('gallery') },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to capture photo');
    }
  }, []);

  const simulatePhotoCapture = (source: string) => {
    // In production, this uses react-native-camera or expo-camera
    // and converts the image to a 3×64×64 tensor
    setPhotoUri(`soil_sample_${Date.now()}.jpg`);

    // Generate a placeholder tensor representing captured soil photo
    // In production, the actual camera frame is resized to 64×64 and normalized
    const tensor: number[][][] = [];
    for (let c = 0; c < 3; c++) {
      const channel: number[][] = [];
      for (let h = 0; h < 64; h++) {
        const row: number[] = [];
        for (let w = 0; w < 64; w++) {
          row.push(Math.random() * 0.5 + 0.2); // Soil-like color range
        }
        channel.push(row);
      }
      tensor.push(channel);
    }
    setPhotoTensor(tensor);
  };

  const scanBluetoothDevices = useCallback(async () => {
    setScanning(true);
    // In production, use react-native-ble-plx or expo-ble
    // Simulate device discovery
    setTimeout(() => {
      setBluetoothDevices([
        { id: 'BLM-001', name: 'Bluelab Multimedia Meter', type: 'multi_meter', connected: false },
        { id: 'HAN-002', name: 'Hanna HI98195', type: 'ph_meter', connected: false },
        { id: 'NPK-003', name: 'Jxct NPK Sensor', type: 'npk_sensor', connected: false },
        { id: 'CEC-004', name: 'CEC Portable Analyzer', type: 'cec_meter', connected: false },
      ]);
      setScanning(false);
    }, 2000);
  }, []);

  const connectDevice = useCallback((device: BluetoothDevice) => {
    // In production: BLE connection, service/characteristic discovery, data subscription
    const updatedDevices = bluetoothDevices.map(d =>
      d.id === device.id ? { ...d, connected: true } : d
    );
    setBluetoothDevices(updatedDevices);
    setConnectedDevice({ ...device, connected: true });

    // Auto-fill readings based on device type
    Alert.alert('Connected', `Reading data from ${device.name}...`);
    setTimeout(() => {
      // Simulate receiving readings from the device
      if (device.type === 'multi_meter' || device.type === 'ph_meter') {
        setLabReadings(prev => ({ ...prev, ph: '6.4' }));
      }
      if (device.type === 'multi_meter' || device.type === 'npk_sensor') {
        setLabReadings(prev => ({
          ...prev,
          nitrogen_ppm: '52.3',
          phosphorus_ppm: '18.7',
          potassium_ppm: '145.2',
        }));
      }
      if (device.type === 'multi_meter') {
        setLabReadings(prev => ({
          ...prev,
          organic_matter_pct: '3.1',
          moisture_pct: '28.5',
        }));
      }
      if (device.type === 'cec_meter') {
        setLabReadings(prev => ({ ...prev, cec_meq_100g: '18.4' }));
      }
    }, 1500);
  }, [bluetoothDevices]);

  const handleAnalyze = useCallback(async () => {
    // Validate required fields
    const requiredFields = ['ph', 'nitrogen_ppm', 'phosphorus_ppm', 'potassium_ppm', 'organic_matter_pct', 'cec_meq_100g'];
    const missing = requiredFields.filter(f => !labReadings[f as keyof LabReadings]);
    if (missing.length > 0) {
      Alert.alert('Missing Data', `Please provide: ${missing.map(f => OPTIMAL_RANGES[f as keyof typeof OPTIMAL_RANGES]?.label || f).join(', ')}`);
      return;
    }

    setLoading(true);
    try {
      const requestBody = {
        photo: photoTensor || undefined,
        ph: parseFloat(labReadings.ph),
        nitrogen_ppm: parseFloat(labReadings.nitrogen_ppm),
        phosphorus_ppm: parseFloat(labReadings.phosphorus_ppm),
        potassium_ppm: parseFloat(labReadings.potassium_ppm),
        organic_matter_pct: parseFloat(labReadings.organic_matter_pct),
        cec_meq_100g: parseFloat(labReadings.cec_meq_100g),
        moisture_pct: parseFloat(labReadings.moisture_pct || '30'),
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
      };

      // Call the ML inference API
      const ML_API_URL = Platform.OS === 'web'
        ? 'http://localhost:8096'
        : 'http://10.0.2.2:8096'; // Android emulator

      const response = await fetch(`${ML_API_URL}/predict/soil`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const data: SoilResult = await response.json();
      setResult(data);
      setActiveTab('results');

      // Save to history
      setHistory(prev => [{
        id: `soil-${Date.now()}`,
        timestamp: new Date().toISOString(),
        health_score: data.health_score,
        health_category: data.health_category,
        ph: parseFloat(labReadings.ph),
        nitrogen: parseFloat(labReadings.nitrogen_ppm),
        phosphorus: parseFloat(labReadings.phosphorus_ppm),
        potassium: parseFloat(labReadings.potassium_ppm),
      }, ...prev]);
    } catch (err) {
      Alert.alert('Analysis Error', `Failed to analyze soil: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [labReadings, photoTensor, latitude, longitude]);

  const updateReading = (field: keyof LabReadings, value: string) => {
    setLabReadings(prev => ({ ...prev, [field]: value }));
  };

  // Health score color
  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#27AE60';
    if (score >= 60) return '#2ECC71';
    if (score >= 40) return '#F39C12';
    if (score >= 20) return '#E67E22';
    return '#E74C3C';
  };

  return (
    <View style={styles.container}>
      <Header title="Soil Analysis" showBack />

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['input', 'results', 'history'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'input' ? 'Input' : tab === 'results' ? 'Results' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {/* INPUT TAB */}
        {activeTab === 'input' && (
          <>
            {/* Photo capture */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Soil Photo</Text>
              <Text style={styles.hint}>
                Take a photo of the soil surface for AI texture/color analysis.
                Hold your phone 30cm above freshly dug soil.
              </Text>
              <TouchableOpacity style={styles.photoButton} onPress={handleCapturePhoto}>
                {photoUri ? (
                  <View style={styles.photoPreview}>
                    <Text style={styles.photoText}>Photo captured</Text>
                    <Text style={styles.photoSubtext}>{photoUri}</Text>
                  </View>
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoIcon}>📷</Text>
                    <Text style={styles.photoText}>Tap to capture soil photo</Text>
                  </View>
                )}
              </TouchableOpacity>
            </Card>

            {/* Bluetooth kit pairing */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Test Kit Connection</Text>
              <Text style={styles.hint}>
                Connect a Bluetooth soil meter to auto-fill readings.
                Supported: Bluelab, Hanna, Jxct NPK sensors, CEC analyzers.
              </Text>
              <Button
                title={scanning ? 'Scanning...' : 'Scan for Devices'}
                onPress={scanBluetoothDevices}
                loading={scanning}
                style={styles.scanButton}
              />
              {bluetoothDevices.map(device => (
                <TouchableOpacity
                  key={device.id}
                  style={[styles.deviceItem, device.connected && styles.deviceConnected]}
                  onPress={() => !device.connected && connectDevice(device)}
                >
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={[styles.deviceStatus, device.connected && styles.deviceStatusConnected]}>
                    {device.connected ? 'Connected' : 'Tap to connect'}
                  </Text>
                </TouchableOpacity>
              ))}
              {connectedDevice && (
                <Text style={styles.connectedText}>
                  Auto-filling readings from {connectedDevice.name}
                </Text>
              )}
            </Card>

            {/* Manual lab readings */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Soil Test Readings</Text>
              <Text style={styles.hint}>
                Enter readings from your test kit, or let Bluetooth auto-fill.
              </Text>
              <Input
                label="pH *"
                value={labReadings.ph}
                onChangeText={(v: string) => updateReading('ph', v)}
                placeholder="e.g., 6.5 (range: 0-14)"
                keyboardType="numeric"
              />
              <Input
                label="Nitrogen (ppm) *"
                value={labReadings.nitrogen_ppm}
                onChangeText={(v: string) => updateReading('nitrogen_ppm', v)}
                placeholder="e.g., 50 (typical: 5-200)"
                keyboardType="numeric"
              />
              <Input
                label="Phosphorus (ppm) *"
                value={labReadings.phosphorus_ppm}
                onChangeText={(v: string) => updateReading('phosphorus_ppm', v)}
                placeholder="e.g., 25 (typical: 2-100)"
                keyboardType="numeric"
              />
              <Input
                label="Potassium (ppm) *"
                value={labReadings.potassium_ppm}
                onChangeText={(v: string) => updateReading('potassium_ppm', v)}
                placeholder="e.g., 150 (typical: 20-400)"
                keyboardType="numeric"
              />
              <Input
                label="Organic Matter (%) *"
                value={labReadings.organic_matter_pct}
                onChangeText={(v: string) => updateReading('organic_matter_pct', v)}
                placeholder="e.g., 3.5 (typical: 1-8)"
                keyboardType="numeric"
              />
              <Input
                label="CEC (meq/100g) *"
                value={labReadings.cec_meq_100g}
                onChangeText={(v: string) => updateReading('cec_meq_100g', v)}
                placeholder="e.g., 18 (typical: 2-50)"
                keyboardType="numeric"
              />
              <Input
                label="Moisture (%)"
                value={labReadings.moisture_pct}
                onChangeText={(v: string) => updateReading('moisture_pct', v)}
                placeholder="e.g., 30 (optional, default: 30)"
                keyboardType="numeric"
              />
            </Card>

            {/* GPS */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Farm Location</Text>
              {gpsLoading ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : latitude && longitude ? (
                <View>
                  <Text style={styles.gpsText}>
                    Lat: {latitude.toFixed(4)}, Lon: {longitude.toFixed(4)}
                  </Text>
                  <Text style={styles.hint}>
                    Location captured. Satellite data (NDVI, elevation, weather) will enhance analysis.
                  </Text>
                </View>
              ) : (
                <View>
                  <Text style={styles.hint}>Location not available. Analysis will proceed without satellite context.</Text>
                  <Button title="Retry GPS" onPress={captureGPS} style={styles.retryButton} />
                </View>
              )}
            </Card>

            {/* Analyze button */}
            <Button
              title="Analyze Soil"
              onPress={handleAnalyze}
              loading={loading}
              style={styles.analyzeButton}
            />
          </>
        )}

        {/* RESULTS TAB */}
        {activeTab === 'results' && result && (
          <>
            {/* Health score */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Soil Health Score</Text>
              <View style={styles.scoreContainer}>
                <Text style={[styles.scoreValue, { color: getScoreColor(result.health_score) }]}>
                  {result.health_score}
                </Text>
                <Text style={styles.scoreLabel}>/ 100</Text>
              </View>
              <Text style={[styles.categoryBadge, { backgroundColor: getScoreColor(result.health_score) }]}>
                {result.health_category.toUpperCase()}
              </Text>
              <Text style={styles.fertilityText}>
                Fertility: {result.fertility_class} ({(result.fertility_confidence * 100).toFixed(0)}% confidence)
              </Text>
              <Text style={styles.inferenceText}>
                Analysis: {result.inference_ms}ms | Modalities: {
                  [result.modalities_used.photo && 'Photo',
                   result.modalities_used.lab_readings && 'Lab',
                   result.modalities_used.location && 'GPS'].filter(Boolean).join(' + ')
                }
              </Text>
            </Card>

            {/* Lab interpretations */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Lab Reading Analysis</Text>
              {Object.entries(result.lab_interpretation).map(([key, interp]) => (
                <View key={key} style={styles.labRow}>
                  <View style={styles.labInfo}>
                    <Text style={styles.labName}>
                      {OPTIMAL_RANGES[key as keyof typeof OPTIMAL_RANGES]?.label || key}
                    </Text>
                    <Text style={styles.labValue}>
                      {interp.value} {interp.unit}
                    </Text>
                  </View>
                  <View style={styles.labStatus}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[interp.status] }]} />
                    <Text style={[styles.statusText, { color: STATUS_COLORS[interp.status] }]}>
                      {interp.status.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.labOptimal}>Optimal: {interp.optimal_range}</Text>
                </View>
              ))}
            </Card>

            {/* Recommendations */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              {result.recommendations.length > 0 ? (
                result.recommendations.map((rec, idx) => (
                  <View key={idx} style={styles.recItem}>
                    <Text style={styles.recAction}>{rec.action.replace(/_/g, ' ').toUpperCase()}</Text>
                    <Text style={styles.recDescription}>{rec.description}</Text>
                    <Text style={styles.recConfidence}>Confidence: {(rec.confidence * 100).toFixed(0)}%</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noRecs}>
                  No immediate improvements needed. Maintain current soil management practices.
                </Text>
              )}
            </Card>

            {/* Crop suitability */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Crop Suitability</Text>
              {result.crop_suitability.map((crop, idx) => (
                <View key={idx} style={styles.cropItem}>
                  <Text style={styles.cropName}>{crop.crop}</Text>
                  <Text style={[
                    styles.cropSuitability,
                    { color: crop.suitability === 'high' ? '#27AE60' : crop.suitability === 'medium' ? '#F39C12' : '#E74C3C' },
                  ]}>
                    {crop.suitability}
                  </Text>
                  {crop.note && <Text style={styles.cropNote}>{crop.note}</Text>}
                </View>
              ))}
            </Card>
          </>
        )}

        {activeTab === 'results' && !result && (
          <Card style={styles.card}>
            <Text style={styles.hint}>No results yet. Go to Input tab and run soil analysis.</Text>
          </Card>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <>
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Soil Test History</Text>
              <Text style={styles.hint}>
                Track soil health over time. Regular testing (every season) helps detect improvement or degradation.
              </Text>
            </Card>
            {history.length > 0 ? (
              <>
                {/* Simple trend chart */}
                <Card style={styles.card}>
                  <Text style={styles.sectionTitle}>Health Trend</Text>
                  <View style={styles.trendChart}>
                    {history.slice(0, 10).reverse().map((test, idx) => (
                      <View key={test.id} style={styles.trendBar}>
                        <View
                          style={[
                            styles.trendFill,
                            {
                              height: `${test.health_score}%`,
                              backgroundColor: getScoreColor(test.health_score),
                            },
                          ]}
                        />
                        <Text style={styles.trendLabel}>{test.health_score.toFixed(0)}</Text>
                      </View>
                    ))}
                  </View>
                </Card>

                {history.map(test => (
                  <Card key={test.id} style={styles.card}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyDate}>
                        {new Date(test.timestamp).toLocaleDateString()}
                      </Text>
                      <Text style={[styles.historyScore, { color: getScoreColor(test.health_score) }]}>
                        {test.health_score.toFixed(1)}
                      </Text>
                    </View>
                    <Text style={styles.historyDetail}>
                      pH: {test.ph} | N: {test.nitrogen} | P: {test.phosphorus} | K: {test.potassium}
                    </Text>
                    <Text style={[styles.categoryBadge, { backgroundColor: getScoreColor(test.health_score) }]}>
                      {test.health_category.toUpperCase()}
                    </Text>
                  </Card>
                ))}
              </>
            ) : (
              <Card style={styles.card}>
                <Text style={styles.hint}>No previous tests. Run your first soil analysis to start tracking.</Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { flex: 1, padding: 16 },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, color: '#666' },
  tabTextActive: { color: COLORS.primary, fontWeight: '600' },
  card: { marginBottom: 16, padding: 16, borderRadius: 12, backgroundColor: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 8 },
  hint: { fontSize: 13, color: '#888', marginBottom: 12, lineHeight: 18 },
  photoButton: { borderWidth: 2, borderColor: '#DDD', borderStyle: 'dashed', borderRadius: 12, padding: 24, alignItems: 'center' },
  photoPlaceholder: { alignItems: 'center' },
  photoPreview: { alignItems: 'center' },
  photoIcon: { fontSize: 48, marginBottom: 8 },
  photoText: { fontSize: 14, color: '#666', fontWeight: '500' },
  photoSubtext: { fontSize: 12, color: '#999', marginTop: 4 },
  scanButton: { marginBottom: 12 },
  deviceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, backgroundColor: '#F9F9F9', marginBottom: 8, borderWidth: 1, borderColor: '#EEE' },
  deviceConnected: { borderColor: '#27AE60', backgroundColor: '#F0FFF4' },
  deviceName: { fontSize: 14, fontWeight: '500', color: '#333', flex: 1 },
  deviceStatus: { fontSize: 12, color: '#999' },
  deviceStatusConnected: { color: '#27AE60', fontWeight: '600' },
  connectedText: { fontSize: 13, color: '#27AE60', fontStyle: 'italic', marginTop: 4 },
  gpsText: { fontSize: 14, color: '#333', fontWeight: '500', marginBottom: 4 },
  retryButton: { marginTop: 8, width: 120 },
  analyzeButton: { marginTop: 8, marginBottom: 24 },
  scoreContainer: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginVertical: 16 },
  scoreValue: { fontSize: 64, fontWeight: '800' },
  scoreLabel: { fontSize: 24, color: '#999', marginLeft: 4 },
  categoryBadge: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, marginVertical: 8 },
  fertilityText: { textAlign: 'center', fontSize: 14, color: '#555', marginTop: 8 },
  inferenceText: { textAlign: 'center', fontSize: 12, color: '#AAA', marginTop: 4 },
  labRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  labInfo: { flexDirection: 'row', justifyContent: 'space-between' },
  labName: { fontSize: 14, fontWeight: '500', color: '#333' },
  labValue: { fontSize: 14, fontWeight: '600', color: '#333' },
  labStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  labOptimal: { fontSize: 12, color: '#999', marginTop: 2 },
  recItem: { padding: 12, borderRadius: 8, backgroundColor: '#FFF8E1', marginBottom: 8 },
  recAction: { fontSize: 13, fontWeight: '700', color: '#E65100', marginBottom: 4 },
  recDescription: { fontSize: 13, color: '#555', lineHeight: 18 },
  recConfidence: { fontSize: 11, color: '#999', marginTop: 4 },
  noRecs: { fontSize: 14, color: '#27AE60', fontStyle: 'italic', textAlign: 'center', padding: 16 },
  cropItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  cropName: { fontSize: 14, fontWeight: '500', color: '#333', flex: 1, textTransform: 'capitalize' },
  cropSuitability: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  cropNote: { fontSize: 12, color: '#888', marginTop: 2 },
  trendChart: { flexDirection: 'row', height: 120, alignItems: 'flex-end', justifyContent: 'space-around', paddingHorizontal: 8 },
  trendBar: { alignItems: 'center', width: 28 },
  trendFill: { width: 20, borderRadius: 4, minHeight: 4 },
  trendLabel: { fontSize: 10, color: '#666', marginTop: 4 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDate: { fontSize: 14, color: '#666' },
  historyScore: { fontSize: 20, fontWeight: '700' },
  historyDetail: { fontSize: 13, color: '#888', marginTop: 4 },
});
