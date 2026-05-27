import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface TraceabilityRecord {
  id: string;
  qrCode: string;
  productType: string;
  farmName: string;
  farmerName: string;
  harvestDate: string;
  quantity: number;
  unit: string;
  grade: string;
  certifications: string[];
  status: 'active' | 'sold' | 'expired';
  createdAt: string;
}

interface TraceabilityStats {
  totalRecords: number;
  activeRecords: number;
  soldProducts: number;
  scansThisMonth: number;
}

export default function TraceabilityDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'records' | 'scan' | 'create'>('records');
  const [stats, setStats] = useState<TraceabilityStats>({
    totalRecords: 0,
    activeRecords: 0,
    soldProducts: 0,
    scansThisMonth: 0,
  });
  const [records, setRecords] = useState<TraceabilityRecord[]>([]);

  useEffect(() => {
    loadTraceabilityData();
  }, []);

  const loadTraceabilityData = async () => {
    setStats({
      totalRecords: 1247,
      activeRecords: 892,
      soldProducts: 355,
      scansThisMonth: 2341,
    });

    setRecords([
      {
        id: '1',
        qrCode: 'TRACE-2024-001234',
        productType: 'Cocoa Beans',
        farmName: 'Okonkwo Cocoa Farm',
        farmerName: 'Adebayo Okonkwo',
        harvestDate: '2024-11-15',
        quantity: 500,
        unit: 'kg',
        grade: 'Premium',
        certifications: ['Organic', 'Fair Trade'],
        status: 'active',
        createdAt: '2024-11-16',
      },
      {
        id: '2',
        qrCode: 'TRACE-2024-001235',
        productType: 'Palm Oil',
        farmName: 'Nwosu Palm Plantation',
        farmerName: 'Chioma Nwosu',
        harvestDate: '2024-11-10',
        quantity: 200,
        unit: 'liters',
        grade: 'Grade A',
        certifications: ['RSPO Certified'],
        status: 'sold',
        createdAt: '2024-11-11',
      },
      {
        id: '3',
        qrCode: 'TRACE-2024-001236',
        productType: 'Cassava',
        farmName: 'Musa Mixed Farm',
        farmerName: 'Ibrahim Musa',
        harvestDate: '2024-11-20',
        quantity: 1000,
        unit: 'kg',
        grade: 'Standard',
        certifications: [],
        status: 'active',
        createdAt: '2024-11-21',
      },
      {
        id: '4',
        qrCode: 'TRACE-2024-001237',
        productType: 'Rice',
        farmName: 'Abdullahi Rice Paddies',
        farmerName: 'Fatima Abdullahi',
        harvestDate: '2024-11-18',
        quantity: 750,
        unit: 'kg',
        grade: 'Premium',
        certifications: ['Organic'],
        status: 'active',
        createdAt: '2024-11-19',
      },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTraceabilityData();
    setRefreshing(false);
  };

  const getStatusColor = (status: TraceabilityRecord['status']) => {
    const colors = {
      active: '#4CAF50',
      sold: '#2196F3',
      expired: '#9E9E9E',
    };
    return colors[status];
  };

  const filteredRecords = records.filter(
    (record) =>
      record.qrCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.productType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.farmerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderRecordItem = ({ item }: { item: TraceabilityRecord }) => (
    <TouchableOpacity style={styles.recordCard}>
      <View style={styles.recordHeader}>
        <View>
          <Text style={styles.qrCode}>{item.qrCode}</Text>
          <Text style={styles.productType}>{item.productType}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.recordDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Farm:</Text>
          <Text style={styles.detailValue}>{item.farmName}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Farmer:</Text>
          <Text style={styles.detailValue}>{item.farmerName}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Harvest:</Text>
          <Text style={styles.detailValue}>{item.harvestDate}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Quantity:</Text>
          <Text style={styles.detailValue}>{item.quantity} {item.unit}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Grade:</Text>
          <Text style={styles.detailValue}>{item.grade}</Text>
        </View>
      </View>

      {item.certifications.length > 0 && (
        <View style={styles.certifications}>
          {item.certifications.map((cert, index) => (
            <View key={index} style={styles.certBadge}>
              <Text style={styles.certText}>{cert}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.recordFooter}>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>View QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.secondaryAction]}>
          <Text style={[styles.actionButtonText, styles.secondaryActionText]}>History</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderRecords = () => (
    <View style={styles.recordsContainer}>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalRecords}</Text>
          <Text style={styles.statLabel}>Total Records</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.activeRecords}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.soldProducts}</Text>
          <Text style={styles.statLabel}>Sold</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.scansThisMonth}</Text>
          <Text style={styles.statLabel}>Scans</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by QR code, product, or farmer..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredRecords}
        renderItem={renderRecordItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.recordsList}
        scrollEnabled={false}
      />
    </View>
  );

  const renderScan = () => (
    <View style={styles.scanContainer}>
      <View style={styles.scanPlaceholder}>
        <Text style={styles.scanIcon}>📷</Text>
        <Text style={styles.scanTitle}>Scan QR Code</Text>
        <Text style={styles.scanDescription}>
          Point your camera at a traceability QR code to view product information
        </Text>
        <TouchableOpacity style={styles.scanButton}>
          <Text style={styles.scanButtonText}>Open Camera</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.manualEntry}>
        <Text style={styles.sectionTitle}>Or Enter Code Manually</Text>
        <TextInput
          style={styles.codeInput}
          placeholder="Enter QR code (e.g., TRACE-2024-001234)"
        />
        <TouchableOpacity style={styles.lookupButton}>
          <Text style={styles.lookupButtonText}>Look Up</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.recentScans}>
        <Text style={styles.sectionTitle}>Recent Scans</Text>
        <View style={styles.recentScanItem}>
          <Text style={styles.recentScanCode}>TRACE-2024-001234</Text>
          <Text style={styles.recentScanTime}>2 hours ago</Text>
        </View>
        <View style={styles.recentScanItem}>
          <Text style={styles.recentScanCode}>TRACE-2024-001230</Text>
          <Text style={styles.recentScanTime}>Yesterday</Text>
        </View>
        <View style={styles.recentScanItem}>
          <Text style={styles.recentScanCode}>TRACE-2024-001228</Text>
          <Text style={styles.recentScanTime}>2 days ago</Text>
        </View>
      </View>
    </View>
  );

  const renderCreate = () => (
    <View style={styles.createContainer}>
      <Text style={styles.sectionTitle}>Create Traceability Record</Text>
      <Text style={styles.createDescription}>
        Generate a new traceability QR code for your harvest
      </Text>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Select Harvest</Text>
        <TouchableOpacity style={styles.selectInput}>
          <Text style={styles.selectPlaceholder}>Choose a harvest record...</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Quality Grade</Text>
        <View style={styles.gradeOptions}>
          {['Premium', 'Grade A', 'Standard'].map((grade) => (
            <TouchableOpacity key={grade} style={styles.gradeOption}>
              <Text style={styles.gradeOptionText}>{grade}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Certifications</Text>
        <View style={styles.certOptions}>
          {['Organic', 'Fair Trade', 'RSPO', 'Rainforest Alliance'].map((cert) => (
            <TouchableOpacity key={cert} style={styles.certOption}>
              <Text style={styles.certOptionText}>{cert}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Additional Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Add any additional information..."
          multiline
          numberOfLines={3}
        />
      </View>

      <TouchableOpacity style={styles.createButton}>
        <Text style={styles.createButtonText}>Generate QR Code</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Traceability</Text>
        <Text style={styles.headerSubtitle}>Track products from farm to table</Text>
      </View>

      <View style={styles.tabBar}>
        {(['records', 'scan', 'create'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        style={styles.content}
      >
        {activeTab === 'records' && renderRecords()}
        {activeTab === 'scan' && renderScan()}
        {activeTab === 'create' && renderCreate()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    backgroundColor: '#1565C0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#1565C0',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#1565C0',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  recordsContainer: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  searchContainer: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  recordsList: {
    gap: 12,
  },
  recordCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  qrCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565C0',
  },
  productType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  recordDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    width: 70,
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
    flex: 1,
  },
  certifications: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  certBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  certText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '500',
  },
  recordFooter: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#1565C0',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  secondaryAction: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1565C0',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 13,
  },
  secondaryActionText: {
    color: '#1565C0',
  },
  scanContainer: {
    padding: 16,
  },
  scanPlaceholder: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  scanIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  scanTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  scanDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  scanButton: {
    backgroundColor: '#1565C0',
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  scanButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  manualEntry: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  codeInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  lookupButton: {
    backgroundColor: '#1565C0',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  lookupButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  recentScans: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  recentScanItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  recentScanCode: {
    fontSize: 14,
    color: '#1565C0',
    fontWeight: '500',
  },
  recentScanTime: {
    fontSize: 12,
    color: '#999',
  },
  createContainer: {
    padding: 16,
  },
  createDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  selectInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectPlaceholder: {
    color: '#999',
    fontSize: 14,
  },
  gradeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  gradeOption: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  gradeOptionText: {
    fontSize: 13,
    color: '#333',
  },
  certOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  certOption: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  certOptionText: {
    fontSize: 13,
    color: '#333',
  },
  notesInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlignVertical: 'top',
    minHeight: 80,
  },
  createButton: {
    backgroundColor: '#1565C0',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
