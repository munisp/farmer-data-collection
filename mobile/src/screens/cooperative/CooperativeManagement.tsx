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

interface CooperativeMember {
  id: string;
  name: string;
  phone: string;
  farmCount: number;
  totalArea: number;
  contribution: number;
  status: 'active' | 'inactive' | 'pending';
}

interface CooperativeStats {
  totalMembers: number;
  totalFarms: number;
  totalArea: number;
  totalFunds: number;
  pendingPayouts: number;
}

export default function CooperativeManagement() {
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'funds'>('overview');
  const [stats, setStats] = useState<CooperativeStats>({
    totalMembers: 0,
    totalFarms: 0,
    totalArea: 0,
    totalFunds: 0,
    pendingPayouts: 0,
  });
  const [members, setMembers] = useState<CooperativeMember[]>([]);

  useEffect(() => {
    loadCooperativeData();
  }, []);

  const loadCooperativeData = async () => {
    // Load cooperative data from local database and/or API
    setStats({
      totalMembers: 156,
      totalFarms: 234,
      totalArea: 1250.5,
      totalFunds: 8500000,
      pendingPayouts: 1200000,
    });

    setMembers([
      { id: '1', name: 'Adebayo Okonkwo', phone: '+234 801 234 5678', farmCount: 3, totalArea: 12.5, contribution: 150000, status: 'active' },
      { id: '2', name: 'Chioma Nwosu', phone: '+234 802 345 6789', farmCount: 2, totalArea: 8.2, contribution: 95000, status: 'active' },
      { id: '3', name: 'Ibrahim Musa', phone: '+234 803 456 7890', farmCount: 4, totalArea: 18.7, contribution: 220000, status: 'active' },
      { id: '4', name: 'Fatima Abdullahi', phone: '+234 804 567 8901', farmCount: 1, totalArea: 5.0, contribution: 60000, status: 'pending' },
      { id: '5', name: 'Emeka Obi', phone: '+234 805 678 9012', farmCount: 2, totalArea: 9.3, contribution: 110000, status: 'active' },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCooperativeData();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const renderOverview = () => (
    <View style={styles.overviewContainer}>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalMembers}</Text>
          <Text style={styles.statLabel}>Total Members</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalFarms}</Text>
          <Text style={styles.statLabel}>Total Farms</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalArea.toFixed(1)}</Text>
          <Text style={styles.statLabel}>Total Area (ha)</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatCurrency(stats.totalFunds)}</Text>
          <Text style={styles.statLabel}>Total Funds</Text>
        </View>
      </View>

      <View style={styles.actionsContainer}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Process Payouts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]}>
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>Add New Member</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]}>
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>Generate Report</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.recentActivity}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.activityItem}>
          <View style={[styles.activityDot, { backgroundColor: '#4CAF50' }]} />
          <View style={styles.activityContent}>
            <Text style={styles.activityText}>Payout of {formatCurrency(250000)} processed</Text>
            <Text style={styles.activityTime}>2 hours ago</Text>
          </View>
        </View>
        <View style={styles.activityItem}>
          <View style={[styles.activityDot, { backgroundColor: '#2196F3' }]} />
          <View style={styles.activityContent}>
            <Text style={styles.activityText}>New member Fatima Abdullahi joined</Text>
            <Text style={styles.activityTime}>5 hours ago</Text>
          </View>
        </View>
        <View style={styles.activityItem}>
          <View style={[styles.activityDot, { backgroundColor: '#FF9800' }]} />
          <View style={styles.activityContent}>
            <Text style={styles.activityText}>Contribution of {formatCurrency(150000)} received</Text>
            <Text style={styles.activityTime}>1 day ago</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderMemberItem = ({ item }: { item: CooperativeMember }) => (
    <TouchableOpacity style={styles.memberCard}>
      <View style={styles.memberHeader}>
        <Text style={styles.memberName}>{item.name}</Text>
        <View style={[styles.statusBadge, styles[`status_${item.status}`]]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.memberPhone}>{item.phone}</Text>
      <View style={styles.memberStats}>
        <View style={styles.memberStat}>
          <Text style={styles.memberStatValue}>{item.farmCount}</Text>
          <Text style={styles.memberStatLabel}>Farms</Text>
        </View>
        <View style={styles.memberStat}>
          <Text style={styles.memberStatValue}>{item.totalArea}</Text>
          <Text style={styles.memberStatLabel}>Hectares</Text>
        </View>
        <View style={styles.memberStat}>
          <Text style={styles.memberStatValue}>{formatCurrency(item.contribution)}</Text>
          <Text style={styles.memberStatLabel}>Contribution</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderMembers = () => (
    <FlatList
      data={members}
      renderItem={renderMemberItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.membersList}
    />
  );

  const renderFunds = () => (
    <View style={styles.fundsContainer}>
      <View style={styles.fundsSummary}>
        <View style={styles.fundCard}>
          <Text style={styles.fundLabel}>Available Funds</Text>
          <Text style={styles.fundValue}>{formatCurrency(stats.totalFunds)}</Text>
        </View>
        <View style={styles.fundCard}>
          <Text style={styles.fundLabel}>Pending Payouts</Text>
          <Text style={[styles.fundValue, { color: '#FF9800' }]}>{formatCurrency(stats.pendingPayouts)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Fund Distribution</Text>
      <View style={styles.distributionChart}>
        <View style={styles.distributionItem}>
          <View style={[styles.distributionBar, { width: '70%', backgroundColor: '#4CAF50' }]} />
          <Text style={styles.distributionLabel}>Member Payouts (70%)</Text>
        </View>
        <View style={styles.distributionItem}>
          <View style={[styles.distributionBar, { width: '20%', backgroundColor: '#2196F3' }]} />
          <Text style={styles.distributionLabel}>Reserve Fund (20%)</Text>
        </View>
        <View style={styles.distributionItem}>
          <View style={[styles.distributionBar, { width: '10%', backgroundColor: '#FF9800' }]} />
          <Text style={styles.distributionLabel}>Operations (10%)</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recent Transactions</Text>
      <View style={styles.transactionsList}>
        <View style={styles.transactionItem}>
          <View>
            <Text style={styles.transactionTitle}>Payout to Adebayo Okonkwo</Text>
            <Text style={styles.transactionDate}>Dec 15, 2025</Text>
          </View>
          <Text style={[styles.transactionAmount, { color: '#f44336' }]}>-{formatCurrency(85000)}</Text>
        </View>
        <View style={styles.transactionItem}>
          <View>
            <Text style={styles.transactionTitle}>Contribution from Ibrahim Musa</Text>
            <Text style={styles.transactionDate}>Dec 14, 2025</Text>
          </View>
          <Text style={[styles.transactionAmount, { color: '#4CAF50' }]}>+{formatCurrency(50000)}</Text>
        </View>
        <View style={styles.transactionItem}>
          <View>
            <Text style={styles.transactionTitle}>Bulk Payout (12 members)</Text>
            <Text style={styles.transactionDate}>Dec 10, 2025</Text>
          </View>
          <Text style={[styles.transactionAmount, { color: '#f44336' }]}>-{formatCurrency(450000)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cooperative Management</Text>
        <Text style={styles.headerSubtitle}>Farmers United Cooperative</Text>
      </View>

      <View style={styles.tabBar}>
        {(['overview', 'members', 'funds'] as const).map((tab) => (
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
        {activeTab === 'members' && renderMembers()}
        {activeTab === 'funds' && renderFunds()}
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
    backgroundColor: '#4CAF50',
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
    borderBottomColor: '#4CAF50',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  overviewContainer: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  actionsContainer: {
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButtonText: {
    color: '#4CAF50',
  },
  recentActivity: {
    marginBottom: 24,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: '#333',
  },
  activityTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  membersList: {
    padding: 16,
  },
  memberCard: {
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
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  status_active: {
    backgroundColor: '#e8f5e9',
  },
  status_inactive: {
    backgroundColor: '#ffebee',
  },
  status_pending: {
    backgroundColor: '#fff3e0',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  memberPhone: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  memberStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  memberStat: {
    alignItems: 'center',
  },
  memberStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  memberStatLabel: {
    fontSize: 11,
    color: '#999',
  },
  fundsContainer: {
    padding: 16,
  },
  fundsSummary: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  fundCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fundLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  fundValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  distributionChart: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  distributionItem: {
    marginBottom: 12,
  },
  distributionBar: {
    height: 24,
    borderRadius: 4,
    marginBottom: 4,
  },
  distributionLabel: {
    fontSize: 12,
    color: '#666',
  },
  transactionsList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  transactionTitle: {
    fontSize: 14,
    color: '#333',
  },
  transactionDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
});
