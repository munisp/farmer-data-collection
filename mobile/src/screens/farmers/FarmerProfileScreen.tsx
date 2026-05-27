import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { database } from '@/services/database';

interface FarmerProfile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  village: string;
  district: string;
  region: string;
  status: string;
  createdAt: string;
}

interface LoanSummary {
  totalLoans: number;
  activeLoans: number;
  totalBorrowed: number;
  totalRepaid: number;
  outstandingBalance: number;
  onTimePayments: number;
  latePayments: number;
}

interface FarmSummary {
  totalFarms: number;
  totalArea: number;
  areaUnit: string;
  crops: string[];
}

interface HarvestSummary {
  totalHarvests: number;
  totalQuantity: number;
  totalValue: number;
  lastHarvestDate?: string;
}

export default function FarmerProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const farmerId = (route.params as any)?.farmerId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [farmer, setFarmer] = useState<FarmerProfile | null>(null);
  const [loanSummary, setLoanSummary] = useState<LoanSummary | null>(null);
  const [farmSummary, setFarmSummary] = useState<FarmSummary | null>(null);
  const [harvestSummary, setHarvestSummary] = useState<HarvestSummary | null>(null);

  const loadFarmerData = async () => {
    try {
      // Load farmer profile
      const farmerData = await database.getFarmerById(farmerId);
      if (farmerData) {
        setFarmer(farmerData);
      }

      // Load loan summary
      const loans = await database.getLoansByFarmerId(farmerId);
      const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'disbursed');
      const totalBorrowed = loans.reduce((sum, l) => sum + (l.amount || 0), 0);
      const totalRepaid = loans.reduce((sum, l) => sum + (l.amountRepaid || 0), 0);
      
      setLoanSummary({
        totalLoans: loans.length,
        activeLoans: activeLoans.length,
        totalBorrowed,
        totalRepaid,
        outstandingBalance: totalBorrowed - totalRepaid,
        onTimePayments: loans.filter(l => l.paymentStatus === 'on_time').length,
        latePayments: loans.filter(l => l.paymentStatus === 'late').length,
      });

      // Load farm summary
      const farms = await database.getFarmsByFarmerId(farmerId);
      const totalArea = farms.reduce((sum, f) => sum + (f.size || 0), 0);
      const crops = [...new Set(farms.flatMap(f => f.crops || []))];
      
      setFarmSummary({
        totalFarms: farms.length,
        totalArea,
        areaUnit: 'hectares',
        crops,
      });

      // Load harvest summary
      const harvests = await database.getHarvestsByFarmerId(farmerId);
      const totalQuantity = harvests.reduce((sum, h) => sum + (h.quantity || 0), 0);
      const totalValue = harvests.reduce((sum, h) => sum + (h.totalValue || 0), 0);
      const lastHarvest = harvests.sort((a, b) => 
        new Date(b.harvestDate).getTime() - new Date(a.harvestDate).getTime()
      )[0];

      setHarvestSummary({
        totalHarvests: harvests.length,
        totalQuantity,
        totalValue,
        lastHarvestDate: lastHarvest?.harvestDate,
      });

    } catch (error) {
      console.error('Error loading farmer data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFarmerData();
  }, [farmerId]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFarmerData();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getCreditScoreColor = () => {
    if (!loanSummary) return '#64748b';
    const ratio = loanSummary.onTimePayments / (loanSummary.onTimePayments + loanSummary.latePayments || 1);
    if (ratio >= 0.9) return '#16a34a';
    if (ratio >= 0.7) return '#ca8a04';
    return '#dc2626';
  };

  const getCreditScoreLabel = () => {
    if (!loanSummary) return 'N/A';
    const ratio = loanSummary.onTimePayments / (loanSummary.onTimePayments + loanSummary.latePayments || 1);
    if (ratio >= 0.9) return 'Excellent';
    if (ratio >= 0.7) return 'Good';
    if (ratio >= 0.5) return 'Fair';
    return 'Poor';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#166534" />
          <Text style={styles.loadingText}>Loading farmer profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!farmer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Farmer Profile</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Farmer not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Farmer Profile</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Farmer Info Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {farmer.firstName[0]}{farmer.lastName[0]}
            </Text>
          </View>
          <Text style={styles.farmerName}>
            {farmer.firstName} {farmer.lastName}
          </Text>
          <Text style={styles.farmerLocation}>
            {farmer.village}, {farmer.district}
          </Text>
          <View style={styles.contactRow}>
            <Text style={styles.contactText}>{farmer.phone}</Text>
          </View>
          <View style={[styles.statusBadge, farmer.status === 'active' && styles.statusBadgeActive]}>
            <Text style={[styles.statusText, farmer.status === 'active' && styles.statusTextActive]}>
              {farmer.status.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Credit Score Card */}
        <View style={styles.creditCard}>
          <Text style={styles.sectionTitle}>Credit Standing</Text>
          <View style={styles.creditScoreContainer}>
            <View style={[styles.creditScoreBadge, { backgroundColor: getCreditScoreColor() }]}>
              <Text style={styles.creditScoreText}>{getCreditScoreLabel()}</Text>
            </View>
            <View style={styles.creditDetails}>
              <View style={styles.creditRow}>
                <Text style={styles.creditLabel}>On-time Payments</Text>
                <Text style={styles.creditValue}>{loanSummary?.onTimePayments || 0}</Text>
              </View>
              <View style={styles.creditRow}>
                <Text style={styles.creditLabel}>Late Payments</Text>
                <Text style={styles.creditValue}>{loanSummary?.latePayments || 0}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Loan Summary Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Loan Summary</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{loanSummary?.totalLoans || 0}</Text>
              <Text style={styles.statLabel}>Total Loans</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{loanSummary?.activeLoans || 0}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>Total Borrowed</Text>
            <Text style={styles.financialValue}>
              {formatCurrency(loanSummary?.totalBorrowed || 0)}
            </Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>Total Repaid</Text>
            <Text style={[styles.financialValue, styles.financialValuePositive]}>
              {formatCurrency(loanSummary?.totalRepaid || 0)}
            </Text>
          </View>
          <View style={[styles.financialRow, styles.financialRowHighlight]}>
            <Text style={styles.financialLabelBold}>Outstanding Balance</Text>
            <Text style={[styles.financialValue, styles.financialValueNegative]}>
              {formatCurrency(loanSummary?.outstandingBalance || 0)}
            </Text>
          </View>
        </View>

        {/* Farm Summary Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Farm Summary</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{farmSummary?.totalFarms || 0}</Text>
              <Text style={styles.statLabel}>Farms</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {farmSummary?.totalArea?.toFixed(1) || 0}
              </Text>
              <Text style={styles.statLabel}>Hectares</Text>
            </View>
          </View>
          {farmSummary?.crops && farmSummary.crops.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.cropsLabel}>Crops Grown</Text>
              <View style={styles.cropsContainer}>
                {farmSummary.crops.map((crop, index) => (
                  <View key={index} style={styles.cropChip}>
                    <Text style={styles.cropChipText}>{crop}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Harvest Summary Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Harvest History</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{harvestSummary?.totalHarvests || 0}</Text>
              <Text style={styles.statLabel}>Harvests</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {(harvestSummary?.totalQuantity || 0).toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>kg Total</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>Total Value</Text>
            <Text style={[styles.financialValue, styles.financialValuePositive]}>
              {formatCurrency(harvestSummary?.totalValue || 0)}
            </Text>
          </View>
          {harvestSummary?.lastHarvestDate && (
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Last Harvest</Text>
              <Text style={styles.financialValue}>
                {formatDate(harvestSummary.lastHarvestDate)}
              </Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('LoanApplication' as never, { 
              farmerId: farmer.id,
              farmerName: `${farmer.firstName} ${farmer.lastName}`,
              farmerPhone: farmer.phone,
            } as never)}
          >
            <Text style={styles.actionButtonText}>Apply for Loan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => navigation.navigate('FarmRegistration' as never, { 
              farmerId: farmer.id 
            } as never)}
          >
            <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>
              Register New Farm
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => navigation.navigate('CreateHarvest' as never, { 
              farmerId: farmer.id 
            } as never)}
          >
            <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>
              Record Harvest
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#dc2626',
  },
  content: {
    flex: 1,
  },
  profileCard: {
    backgroundColor: '#166534',
    padding: 24,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  farmerName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  farmerLocation: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  contactRow: {
    marginBottom: 12,
  },
  contactText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  statusBadgeActive: {
    backgroundColor: '#22c55e',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  statusTextActive: {
    color: '#fff',
  },
  creditCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  creditScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  creditScoreBadge: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  creditScoreText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  creditDetails: {
    flex: 1,
  },
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  creditLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  creditValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 12,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  financialRowHighlight: {
    backgroundColor: '#f8fafc',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: -16,
    paddingBottom: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  financialLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  financialLabelBold: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  financialValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  financialValuePositive: {
    color: '#16a34a',
  },
  financialValueNegative: {
    color: '#dc2626',
  },
  cropsLabel: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
  },
  cropsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cropChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  cropChipText: {
    fontSize: 13,
    color: '#166534',
  },
  actionsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionButton: {
    backgroundColor: '#166534',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#166534',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionButtonTextSecondary: {
    color: '#166534',
  },
  bottomPadding: {
    height: 24,
  },
});
