import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface CarbonProject {
  id: string;
  name: string;
  farmId: string;
  farmName: string;
  type: 'agroforestry' | 'soil_carbon' | 'methane_reduction' | 'reforestation';
  status: 'registered' | 'verified' | 'pending' | 'rejected';
  estimatedCredits: number;
  verifiedCredits: number;
  pricePerCredit: number;
  startDate: string;
  verificationDate?: string;
}

interface CarbonStats {
  totalProjects: number;
  totalEstimatedCredits: number;
  totalVerifiedCredits: number;
  totalRevenue: number;
  avgPricePerCredit: number;
}

export default function CarbonCredits() {
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'marketplace'>('overview');
  const [stats, setStats] = useState<CarbonStats>({
    totalProjects: 0,
    totalEstimatedCredits: 0,
    totalVerifiedCredits: 0,
    totalRevenue: 0,
    avgPricePerCredit: 0,
  });
  const [projects, setProjects] = useState<CarbonProject[]>([]);

  useEffect(() => {
    loadCarbonData();
  }, []);

  const loadCarbonData = async () => {
    setStats({
      totalProjects: 24,
      totalEstimatedCredits: 15420,
      totalVerifiedCredits: 8750,
      totalRevenue: 43750000,
      avgPricePerCredit: 5000,
    });

    setProjects([
      {
        id: '1',
        name: 'Cocoa Agroforestry Project',
        farmId: 'farm-1',
        farmName: 'Okonkwo Cocoa Farm',
        type: 'agroforestry',
        status: 'verified',
        estimatedCredits: 2500,
        verifiedCredits: 2100,
        pricePerCredit: 5200,
        startDate: '2024-01-15',
        verificationDate: '2024-06-20',
      },
      {
        id: '2',
        name: 'Soil Carbon Sequestration',
        farmId: 'farm-2',
        farmName: 'Nwosu Mixed Farm',
        type: 'soil_carbon',
        status: 'verified',
        estimatedCredits: 1800,
        verifiedCredits: 1650,
        pricePerCredit: 4800,
        startDate: '2024-02-10',
        verificationDate: '2024-07-15',
      },
      {
        id: '3',
        name: 'Rice Methane Reduction',
        farmId: 'farm-3',
        farmName: 'Musa Rice Paddies',
        type: 'methane_reduction',
        status: 'pending',
        estimatedCredits: 3200,
        verifiedCredits: 0,
        pricePerCredit: 5500,
        startDate: '2024-05-01',
      },
      {
        id: '4',
        name: 'Farm Boundary Reforestation',
        farmId: 'farm-4',
        farmName: 'Abdullahi Farm',
        type: 'reforestation',
        status: 'registered',
        estimatedCredits: 4500,
        verifiedCredits: 0,
        pricePerCredit: 4500,
        startDate: '2024-08-01',
      },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCarbonData();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getProjectTypeLabel = (type: CarbonProject['type']) => {
    const labels = {
      agroforestry: 'Agroforestry',
      soil_carbon: 'Soil Carbon',
      methane_reduction: 'Methane Reduction',
      reforestation: 'Reforestation',
    };
    return labels[type];
  };

  const getStatusColor = (status: CarbonProject['status']) => {
    const colors = {
      verified: '#4CAF50',
      registered: '#2196F3',
      pending: '#FF9800',
      rejected: '#f44336',
    };
    return colors[status];
  };

  const renderOverview = () => (
    <View style={styles.overviewContainer}>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Carbon Credit Portfolio</Text>
        <Text style={styles.heroValue}>{stats.totalVerifiedCredits.toLocaleString()}</Text>
        <Text style={styles.heroLabel}>Verified Credits</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{stats.totalEstimatedCredits.toLocaleString()}</Text>
            <Text style={styles.heroStatLabel}>Estimated</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{formatCurrency(stats.totalRevenue)}</Text>
            <Text style={styles.heroStatLabel}>Total Revenue</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalProjects}</Text>
          <Text style={styles.statLabel}>Active Projects</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatCurrency(stats.avgPricePerCredit)}</Text>
          <Text style={styles.statLabel}>Avg Price/Credit</Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>How Carbon Credits Work</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Register Project</Text>
              <Text style={styles.stepText}>Register your farm for carbon credit programs based on sustainable practices.</Text>
            </View>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Implement Practices</Text>
              <Text style={styles.stepText}>Adopt agroforestry, soil carbon sequestration, or methane reduction methods.</Text>
            </View>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Get Verified</Text>
              <Text style={styles.stepText}>Third-party verification confirms your carbon sequestration or emission reduction.</Text>
            </View>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Earn Revenue</Text>
              <Text style={styles.stepText}>Sell verified credits to buyers seeking to offset their carbon footprint.</Text>
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.ctaButton}>
        <Text style={styles.ctaButtonText}>Register New Project</Text>
      </TouchableOpacity>
    </View>
  );

  const renderProjectItem = ({ item }: { item: CarbonProject }) => (
    <TouchableOpacity style={styles.projectCard}>
      <View style={styles.projectHeader}>
        <View>
          <Text style={styles.projectName}>{item.name}</Text>
          <Text style={styles.projectFarm}>{item.farmName}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.projectType}>
        <Text style={styles.projectTypeLabel}>{getProjectTypeLabel(item.type)}</Text>
      </View>

      <View style={styles.projectStats}>
        <View style={styles.projectStat}>
          <Text style={styles.projectStatValue}>{item.estimatedCredits.toLocaleString()}</Text>
          <Text style={styles.projectStatLabel}>Estimated</Text>
        </View>
        <View style={styles.projectStat}>
          <Text style={styles.projectStatValue}>{item.verifiedCredits.toLocaleString()}</Text>
          <Text style={styles.projectStatLabel}>Verified</Text>
        </View>
        <View style={styles.projectStat}>
          <Text style={styles.projectStatValue}>{formatCurrency(item.pricePerCredit)}</Text>
          <Text style={styles.projectStatLabel}>Price/Credit</Text>
        </View>
      </View>

      <View style={styles.projectFooter}>
        <Text style={styles.projectDate}>Started: {item.startDate}</Text>
        {item.verificationDate && (
          <Text style={styles.projectDate}>Verified: {item.verificationDate}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderProjects = () => (
    <FlatList
      data={projects}
      renderItem={renderProjectItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.projectsList}
    />
  );

  const renderMarketplace = () => (
    <View style={styles.marketplaceContainer}>
      <View style={styles.marketHeader}>
        <Text style={styles.sectionTitle}>Carbon Credit Marketplace</Text>
        <Text style={styles.marketSubtitle}>Buy and sell verified carbon credits</Text>
      </View>

      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>Current Market Price</Text>
        <Text style={styles.priceValue}>{formatCurrency(5000)}</Text>
        <Text style={styles.priceChange}>+2.5% from last week</Text>
      </View>

      <Text style={styles.sectionTitle}>Available for Sale</Text>
      <View style={styles.listingCard}>
        <View style={styles.listingHeader}>
          <Text style={styles.listingTitle}>Cocoa Agroforestry Credits</Text>
          <Text style={styles.listingCredits}>500 credits</Text>
        </View>
        <Text style={styles.listingPrice}>{formatCurrency(5200)} per credit</Text>
        <TouchableOpacity style={styles.buyButton}>
          <Text style={styles.buyButtonText}>Contact Seller</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listingCard}>
        <View style={styles.listingHeader}>
          <Text style={styles.listingTitle}>Soil Carbon Credits</Text>
          <Text style={styles.listingCredits}>1,200 credits</Text>
        </View>
        <Text style={styles.listingPrice}>{formatCurrency(4800)} per credit</Text>
        <TouchableOpacity style={styles.buyButton}>
          <Text style={styles.buyButtonText}>Contact Seller</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.sellButton}>
        <Text style={styles.sellButtonText}>List Your Credits for Sale</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Carbon Credits</Text>
      </View>

      <View style={styles.tabBar}>
        {(['overview', 'projects', 'marketplace'] as const).map((tab) => (
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
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'projects' && renderProjects()}
        {activeTab === 'marketplace' && renderMarketplace()}
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
    backgroundColor: '#2E7D32',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
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
    borderBottomColor: '#2E7D32',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  overviewContainer: {
    padding: 16,
  },
  heroCard: {
    backgroundColor: '#2E7D32',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  heroLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 16,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 32,
  },
  heroStat: {
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  heroStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  infoSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  infoStep: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  stepText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  ctaButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  projectsList: {
    padding: 16,
  },
  projectCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  projectFarm: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
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
  projectType: {
    marginBottom: 12,
  },
  projectTypeLabel: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '500',
  },
  projectStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  projectStat: {
    alignItems: 'center',
  },
  projectStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  projectStatLabel: {
    fontSize: 11,
    color: '#999',
  },
  projectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  projectDate: {
    fontSize: 11,
    color: '#999',
  },
  marketplaceContainer: {
    padding: 16,
  },
  marketHeader: {
    marginBottom: 16,
  },
  marketSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  priceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
  },
  priceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginVertical: 8,
  },
  priceChange: {
    fontSize: 12,
    color: '#4CAF50',
  },
  listingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  listingCredits: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '500',
  },
  listingPrice: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
  },
  buyButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  buyButtonText: {
    color: '#fff',
    fontWeight: '500',
  },
  sellButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#2E7D32',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  sellButtonText: {
    color: '#2E7D32',
    fontWeight: '600',
    fontSize: 16,
  },
});
