import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type JourneyStatus = 'not_started' | 'in_progress' | 'completed' | 'failed' | 'blocked';
type JourneyChannel = 'USSD' | 'SMS' | 'WhatsApp' | 'PWA' | 'Mobile' | 'Voice';
type JourneyCategory = 'onboarding' | 'farming' | 'financial' | 'marketplace' | 'analytics' | 'compliance' | 'sustainability';

interface JourneyStep {
  id: string;
  title: string;
  description?: string;
  status: JourneyStatus;
}

interface JourneySummary {
  id: string;
  title: string;
  description: string;
  category: JourneyCategory;
  channels: JourneyChannel[];
  status: JourneyStatus;
  progress: number;
  lastUpdate: string;
  steps: JourneyStep[];
  icon: string;
  color: string;
}

const JOURNEY_CATALOG: JourneySummary[] = [
  {
    id: 'farmer_onboarding',
    title: 'Farmer Onboarding with KYC',
    description: 'Complete farmer registration with identity verification',
    category: 'onboarding',
    channels: ['USSD', 'SMS', 'WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'person-add',
    color: '#3B82F6',
    steps: [
      { id: 'create_account', title: 'Create Account', status: 'not_started' },
      { id: 'verify_otp', title: 'Verify OTP', status: 'not_started' },
      { id: 'basic_info', title: 'Basic Information', status: 'not_started' },
      { id: 'kyc_documents', title: 'KYC Documents', status: 'not_started' },
      { id: 'credit_score', title: 'Credit Score', status: 'not_started' },
      { id: 'erpnext_sync', title: 'System Sync', status: 'not_started' },
    ],
  },
  {
    id: 'farm_geotagging',
    title: 'Farm Geotagging & Boundary',
    description: 'Map farm boundaries with GPS coordinates',
    category: 'farming',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'location',
    color: '#10B981',
    steps: [
      { id: 'gps_accuracy', title: 'GPS Accuracy Check', status: 'not_started' },
      { id: 'center_point', title: 'Mark Center Point', status: 'not_started' },
      { id: 'boundary_walk', title: 'Walk Boundary', status: 'not_started' },
      { id: 'area_calculation', title: 'Calculate Area', status: 'not_started' },
      { id: 'postgis_save', title: 'Save to Database', status: 'not_started' },
    ],
  },
  {
    id: 'loan_application',
    title: 'Loan Application',
    description: 'Apply for farm loans with ML credit scoring',
    category: 'financial',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'cash',
    color: '#F59E0B',
    steps: [
      { id: 'kyc_check', title: 'KYC Verification', status: 'not_started' },
      { id: 'credit_score', title: 'Credit Score', status: 'not_started' },
      { id: 'risk_assessment', title: 'Risk Assessment', status: 'not_started' },
      { id: 'loan_terms', title: 'Loan Terms', status: 'not_started' },
      { id: 'approval', title: 'Approval', status: 'not_started' },
    ],
  },
  {
    id: 'marketplace_listing',
    title: 'Marketplace Listing',
    description: 'List products with quality grading',
    category: 'marketplace',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'cart',
    color: '#8B5CF6',
    steps: [
      { id: 'product_info', title: 'Product Details', status: 'not_started' },
      { id: 'quality_grade', title: 'Quality Grading', status: 'not_started' },
      { id: 'traceability', title: 'Traceability', status: 'not_started' },
      { id: 'listing_live', title: 'Go Live', status: 'not_started' },
    ],
  },
  {
    id: 'order_processing',
    title: 'Order Processing',
    description: 'Process orders with TigerBeetle escrow',
    category: 'marketplace',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'card',
    color: '#EC4899',
    steps: [
      { id: 'verify_listing', title: 'Verify Availability', status: 'not_started' },
      { id: 'create_order', title: 'Create Order', status: 'not_started' },
      { id: 'escrow', title: 'Escrow Payment', status: 'not_started' },
      { id: 'delivery', title: 'Delivery', status: 'not_started' },
      { id: 'release_funds', title: 'Release Funds', status: 'not_started' },
    ],
  },
  {
    id: 'yield_prediction',
    title: 'Yield Prediction with AI',
    description: 'AI-powered yield forecasts',
    category: 'analytics',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'trending-up',
    color: '#06B6D4',
    steps: [
      { id: 'weather_data', title: 'Weather Data', status: 'not_started' },
      { id: 'soil_data', title: 'Soil Analysis', status: 'not_started' },
      { id: 'ml_prediction', title: 'ML Prediction', status: 'not_started' },
      { id: 'harvest_date', title: 'Optimal Harvest', status: 'not_started' },
      { id: 'recommendations', title: 'Recommendations', status: 'not_started' },
    ],
  },
  {
    id: 'land_suitability',
    title: 'Land Suitability Assessment',
    description: 'Analyze land for crop suitability',
    category: 'farming',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'layers',
    color: '#84CC16',
    steps: [
      { id: 'soil_analysis', title: 'Soil Analysis', status: 'not_started' },
      { id: 'climate_analysis', title: 'Climate Analysis', status: 'not_started' },
      { id: 'suitability_score', title: 'Suitability Score', status: 'not_started' },
      { id: 'crop_recommendations', title: 'Crop Recommendations', status: 'not_started' },
    ],
  },
  {
    id: 'cooperative_management',
    title: 'Cooperative Management',
    description: 'Manage members and distribute revenue',
    category: 'financial',
    channels: ['USSD', 'SMS', 'WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'people',
    color: '#6366F1',
    steps: [
      { id: 'member_payments', title: 'Process Payments', status: 'not_started' },
      { id: 'cooperative_fund', title: 'Cooperative Fund', status: 'not_started' },
      { id: 'notifications', title: 'Notifications', status: 'not_started' },
    ],
  },
  {
    id: 'loan_disbursement',
    title: 'Loan Disbursement',
    description: 'Disburse loans and track repayments',
    category: 'financial',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'wallet',
    color: '#F97316',
    steps: [
      { id: 'create_loan', title: 'Create Loan Record', status: 'not_started' },
      { id: 'ledger_entry', title: 'Ledger Entry', status: 'not_started' },
      { id: 'bank_transfer', title: 'Bank Transfer', status: 'not_started' },
      { id: 'repayment_schedule', title: 'Repayment Schedule', status: 'not_started' },
      { id: 'erpnext_sync', title: 'ERPNext Sync', status: 'not_started' },
    ],
  },
  {
    id: 'crop_insurance',
    title: 'Weather-Indexed Insurance',
    description: 'Crop insurance with weather triggers',
    category: 'financial',
    channels: ['USSD', 'SMS', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'shield-checkmark',
    color: '#EF4444',
    steps: [
      { id: 'risk_assessment', title: 'Risk Assessment', status: 'not_started' },
      { id: 'create_policy', title: 'Create Policy', status: 'not_started' },
      { id: 'premium_payment', title: 'Premium Payment', status: 'not_started' },
      { id: 'weather_monitoring', title: 'Weather Monitoring', status: 'not_started' },
    ],
  },
  {
    id: 'input_financing',
    title: 'Input Financing',
    description: 'Finance seeds and fertilizers',
    category: 'financial',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'cube',
    color: '#14B8A6',
    steps: [
      { id: 'eligibility', title: 'Check Eligibility', status: 'not_started' },
      { id: 'create_financing', title: 'Create Financing', status: 'not_started' },
      { id: 'input_orders', title: 'Input Orders', status: 'not_started' },
      { id: 'ledger_entry', title: 'Ledger Entry', status: 'not_started' },
    ],
  },
  {
    id: 'harvest_recording',
    title: 'Harvest Recording',
    description: 'Record harvests with AI quality grading',
    category: 'farming',
    channels: ['USSD', 'SMS', 'WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'leaf',
    color: '#A3E635',
    steps: [
      { id: 'record_harvest', title: 'Record Harvest', status: 'not_started' },
      { id: 'quality_grade', title: 'Quality Grading', status: 'not_started' },
      { id: 'market_price', title: 'Market Price', status: 'not_started' },
      { id: 'storage_recommendation', title: 'Storage Advice', status: 'not_started' },
    ],
  },
  {
    id: 'agent_tasks',
    title: 'Agent Task Assignment',
    description: 'Assign and verify field agent tasks',
    category: 'compliance',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'clipboard',
    color: '#64748B',
    steps: [
      { id: 'create_task', title: 'Create Task', status: 'not_started' },
      { id: 'assign_agent', title: 'Assign Agent', status: 'not_started' },
      { id: 'notification', title: 'Send Notification', status: 'not_started' },
      { id: 'verification', title: 'Verification', status: 'not_started' },
    ],
  },
  {
    id: 'kyc_verification',
    title: 'KYC Verification',
    description: 'Identity verification with documents',
    category: 'compliance',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'id-card',
    color: '#0EA5E9',
    steps: [
      { id: 'document_upload', title: 'Upload Documents', status: 'not_started' },
      { id: 'identity_verify', title: 'Identity Verification', status: 'not_started' },
      { id: 'kyc_score', title: 'KYC Score', status: 'not_started' },
      { id: 'permify_sync', title: 'Authorization Sync', status: 'not_started' },
    ],
  },
  {
    id: 'carbon_credits',
    title: 'Carbon Credit Registration',
    description: 'Register for carbon credit programs',
    category: 'sustainability',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'leaf',
    color: '#22C55E',
    steps: [
      { id: 'register_project', title: 'Register Project', status: 'not_started' },
      { id: 'estimate_credits', title: 'Estimate Credits', status: 'not_started' },
      { id: 'market_price', title: 'Market Price', status: 'not_started' },
      { id: 'verification_request', title: 'Request Verification', status: 'not_started' },
    ],
  },
  {
    id: 'traceability',
    title: 'Traceability Chain',
    description: 'Create product traceability with QR',
    category: 'compliance',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'qr-code',
    color: '#7C3AED',
    steps: [
      { id: 'create_record', title: 'Create Record', status: 'not_started' },
      { id: 'link_harvest', title: 'Link Harvest', status: 'not_started' },
      { id: 'generate_qr', title: 'Generate QR Code', status: 'not_started' },
      { id: 'blockchain_record', title: 'Blockchain Record', status: 'not_started' },
    ],
  },
  {
    id: 'weather_alerts',
    title: 'Weather Alert & Advisory',
    description: 'Receive weather alerts and advisories',
    category: 'farming',
    channels: ['USSD', 'SMS', 'Voice', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'rainy',
    color: '#0284C7',
    steps: [
      { id: 'create_alert', title: 'Create Alert', status: 'not_started' },
      { id: 'affected_crops', title: 'Affected Crops', status: 'not_started' },
      { id: 'recommendations', title: 'Recommendations', status: 'not_started' },
      { id: 'notifications', title: 'Send Notifications', status: 'not_started' },
    ],
  },
  {
    id: 'expense_tracking',
    title: 'Expense Tracking',
    description: 'Track expenses with budget alerts',
    category: 'financial',
    channels: ['SMS', 'WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'receipt',
    color: '#DC2626',
    steps: [
      { id: 'record_expense', title: 'Record Expense', status: 'not_started' },
      { id: 'ledger_entry', title: 'Ledger Entry', status: 'not_started' },
      { id: 'budget_check', title: 'Budget Check', status: 'not_started' },
      { id: 'erpnext_sync', title: 'ERPNext Sync', status: 'not_started' },
    ],
  },
  {
    id: 'analytics_dashboard',
    title: 'Analytics Dashboard',
    description: 'Generate comprehensive analytics',
    category: 'analytics',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'bar-chart',
    color: '#9333EA',
    steps: [
      { id: 'fetch_data', title: 'Fetch Data', status: 'not_started' },
      { id: 'calculate_metrics', title: 'Calculate Metrics', status: 'not_started' },
      { id: 'ml_insights', title: 'ML Insights', status: 'not_started' },
      { id: 'cache_report', title: 'Cache Report', status: 'not_started' },
    ],
  },
  {
    id: 'season_planning',
    title: 'Season Planning',
    description: 'Plan farming season with crops',
    category: 'farming',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'calendar',
    color: '#059669',
    steps: [
      { id: 'create_season', title: 'Create Season', status: 'not_started' },
      { id: 'crop_selection', title: 'Select Crops', status: 'not_started' },
      { id: 'suitability_check', title: 'Suitability Check', status: 'not_started' },
      { id: 'yield_forecast', title: 'Yield Forecast', status: 'not_started' },
      { id: 'price_forecast', title: 'Price Forecast', status: 'not_started' },
    ],
  },
];

const CATEGORY_CONFIG: Record<JourneyCategory, { label: string; color: string }> = {
  onboarding: { label: 'Onboarding', color: '#3B82F6' },
  farming: { label: 'Farming', color: '#10B981' },
  financial: { label: 'Financial', color: '#F59E0B' },
  marketplace: { label: 'Marketplace', color: '#8B5CF6' },
  analytics: { label: 'Analytics', color: '#06B6D4' },
  compliance: { label: 'Compliance', color: '#64748B' },
  sustainability: { label: 'Sustainability', color: '#22C55E' },
};

export default function JourneyListScreen({ navigation }: any) {
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<JourneyCategory | 'all'>('all');

  useEffect(() => {
    loadJourneys();
  }, []);

  const loadJourneys = () => {
    const mockJourneys: JourneySummary[] = JOURNEY_CATALOG.map((journey, index) => {
      const completedSteps = index < 5 ? journey.steps.length : index < 10 ? Math.floor(journey.steps.length * 0.6) : 0;
      const progress = Math.round((completedSteps / journey.steps.length) * 100);
      
      return {
        ...journey,
        status: index < 5 ? 'completed' as JourneyStatus : index < 10 ? 'in_progress' as JourneyStatus : 'not_started' as JourneyStatus,
        progress,
        lastUpdate: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
        steps: journey.steps.map((step, stepIndex) => ({
          ...step,
          status: stepIndex < completedSteps ? 'completed' as JourneyStatus : stepIndex === completedSteps ? 'in_progress' as JourneyStatus : 'not_started' as JourneyStatus,
        })),
      };
    });
    setJourneys(mockJourneys);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadJourneys();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const filteredJourneys = journeys.filter((journey) => {
    const matchesSearch = journey.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      journey.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || journey.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const stats = {
    total: journeys.length,
    completed: journeys.filter((j) => j.status === 'completed').length,
    inProgress: journeys.filter((j) => j.status === 'in_progress').length,
    notStarted: journeys.filter((j) => j.status === 'not_started').length,
  };

  const getStatusColor = (status: JourneyStatus) => {
    switch (status) {
      case 'completed': return '#22C55E';
      case 'in_progress': return '#F59E0B';
      case 'failed': return '#EF4444';
      case 'blocked': return '#EF4444';
      default: return '#9CA3AF';
    }
  };

  const getStatusLabel = (status: JourneyStatus) => {
    return status.replace('_', ' ').toUpperCase();
  };

  const navigateToDetail = (journey: JourneySummary) => {
    navigation.navigate('JourneyDetail', { journey });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>User Journeys</Text>
        <Text style={styles.subtitle}>Track your farming activities</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
          <Text style={[styles.statNumber, { color: '#3B82F6' }]}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#F0FDF4' }]}>
          <Text style={[styles.statNumber, { color: '#22C55E' }]}>{stats.completed}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FFFBEB' }]}>
          <Text style={[styles.statNumber, { color: '#F59E0B' }]}>{stats.inProgress}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#F9FAFB' }]}>
          <Text style={[styles.statNumber, { color: '#9CA3AF' }]}>{stats.notStarted}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search journeys..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContainer}
      >
        <TouchableOpacity
          style={[styles.filterChip, selectedCategory === 'all' && styles.filterChipActive]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[styles.filterText, selectedCategory === 'all' && styles.filterTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.filterChip, 
              selectedCategory === key && { backgroundColor: config.color }
            ]}
            onPress={() => setSelectedCategory(key as JourneyCategory)}
          >
            <Text style={[
              styles.filterText, 
              selectedCategory === key && styles.filterTextActive
            ]}>
              {config.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.journeyList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredJourneys.map((journey) => (
          <TouchableOpacity
            key={journey.id}
            style={styles.journeyCard}
            onPress={() => navigateToDetail(journey)}
            activeOpacity={0.7}
          >
            <View style={styles.journeyHeader}>
              <View style={[styles.iconContainer, { backgroundColor: `${journey.color}20` }]}>
                <Ionicons name={journey.icon as any} size={24} color={journey.color} />
              </View>
              <View style={styles.journeyInfo}>
                <Text style={styles.journeyTitle} numberOfLines={1}>{journey.title}</Text>
                <Text style={styles.journeyDescription} numberOfLines={2}>{journey.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </View>

            <View style={styles.journeyMeta}>
              <View style={[styles.categoryBadge, { backgroundColor: `${CATEGORY_CONFIG[journey.category].color}20` }]}>
                <Text style={[styles.categoryText, { color: CATEGORY_CONFIG[journey.category].color }]}>
                  {CATEGORY_CONFIG[journey.category].label}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(journey.status)}20` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(journey.status) }]}>
                  {getStatusLabel(journey.status)}
                </Text>
              </View>
            </View>

            {journey.status !== 'not_started' && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${journey.progress}%`, backgroundColor: journey.color }
                    ]} 
                  />
                </View>
                <Text style={styles.progressText}>{journey.progress}%</Text>
              </View>
            )}

            <View style={styles.channelRow}>
              {journey.channels.slice(0, 4).map((channel, idx) => (
                <View key={idx} style={styles.channelBadge}>
                  <Text style={styles.channelText}>{channel}</Text>
                </View>
              ))}
              {journey.channels.length > 4 && (
                <View style={styles.channelBadge}>
                  <Text style={styles.channelText}>+{journey.channels.length - 4}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}

        {filteredJourneys.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No journeys found</Text>
            <Text style={styles.emptyText}>Try adjusting your filters</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#fff',
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  filterScroll: {
    maxHeight: 44,
    marginBottom: 8,
  },
  filterContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  filterTextActive: {
    color: '#fff',
  },
  journeyList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  journeyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  journeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  journeyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  journeyDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  journeyMeta: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    width: 36,
    textAlign: 'right',
  },
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 6,
  },
  channelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  channelText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
