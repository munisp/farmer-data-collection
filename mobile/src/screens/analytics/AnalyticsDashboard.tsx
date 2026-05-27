import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface MetricCard {
  title: string;
  value: string | number;
  change?: number;
  unit?: string;
}

interface ChartData {
  labels: string[];
  values: number[];
}

export default function AnalyticsDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [yieldData, setYieldData] = useState<ChartData>({ labels: [], values: [] });
  const [revenueData, setRevenueData] = useState<ChartData>({ labels: [], values: [] });

  useEffect(() => {
    loadAnalytics();
  }, [selectedPeriod]);

  const loadAnalytics = async () => {
    // Load analytics data from local database and/or API
    setMetrics([
      { title: 'Total Farmers', value: 1247, change: 12.5 },
      { title: 'Active Farms', value: 892, change: 8.3 },
      { title: 'Total Harvests', value: '45.2K', unit: 'kg', change: 15.2 },
      { title: 'Revenue', value: '2.4M', unit: 'NGN', change: 22.1 },
      { title: 'Active Loans', value: 156, change: -3.2 },
      { title: 'Loan Disbursed', value: '12.8M', unit: 'NGN', change: 18.5 },
      { title: 'Avg Yield/Ha', value: '3.2', unit: 'tons', change: 5.7 },
      { title: 'Marketplace Orders', value: 423, change: 28.4 },
    ]);

    setYieldData({
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      values: [2.8, 3.1, 2.9, 3.4, 3.2, 3.5],
    });

    setRevenueData({
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      values: [180000, 220000, 195000, 280000, 310000, 350000],
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
  };

  const renderMetricCard = (metric: MetricCard, index: number) => (
    <View key={index} style={styles.metricCard}>
      <Text style={styles.metricTitle}>{metric.title}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>
          {metric.value}
          {metric.unit && <Text style={styles.metricUnit}> {metric.unit}</Text>}
        </Text>
      </View>
      {metric.change !== undefined && (
        <View style={[styles.changeContainer, metric.change >= 0 ? styles.positiveChange : styles.negativeChange]}>
          <Text style={[styles.changeText, metric.change >= 0 ? styles.positiveText : styles.negativeText]}>
            {metric.change >= 0 ? '+' : ''}{metric.change}%
          </Text>
        </View>
      )}
    </View>
  );

  const renderSimpleChart = (data: ChartData, title: string, color: string) => {
    const maxValue = Math.max(...data.values);
    const chartHeight = 120;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>{title}</Text>
        <View style={styles.chart}>
          {data.values.map((value, index) => (
            <View key={index} style={styles.barContainer}>
              <View
                style={[
                  styles.bar,
                  {
                    height: (value / maxValue) * chartHeight,
                    backgroundColor: color,
                  },
                ]}
              />
              <Text style={styles.barLabel}>{data.labels[index]}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics Dashboard</Text>
          <View style={styles.periodSelector}>
            {(['week', 'month', 'year'] as const).map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodButton,
                  selectedPeriod === period && styles.periodButtonActive,
                ]}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === period && styles.periodButtonTextActive,
                  ]}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.metricsGrid}>
          {metrics.map((metric, index) => renderMetricCard(metric, index))}
        </View>

        {renderSimpleChart(yieldData, 'Yield Trend (tons/ha)', '#4CAF50')}
        {renderSimpleChart(revenueData, 'Revenue Trend (NGN)', '#2196F3')}

        <View style={styles.insightsContainer}>
          <Text style={styles.sectionTitle}>AI Insights</Text>
          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>Yield Optimization</Text>
            <Text style={styles.insightText}>
              Based on current weather patterns and soil data, consider increasing irrigation
              frequency by 15% for maize crops in the Northern region to optimize yield.
            </Text>
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>Market Opportunity</Text>
            <Text style={styles.insightText}>
              Cassava prices are projected to increase by 12% next month. Consider advising
              farmers to delay harvest by 2-3 weeks for better returns.
            </Text>
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>Risk Alert</Text>
            <Text style={styles.insightText}>
              23 loan applications in the Eastern region show elevated default risk. Review
              repayment schedules and consider restructuring options.
            </Text>
          </View>
        </View>
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
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  periodButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  periodButtonActive: {
    backgroundColor: '#4CAF50',
  },
  periodButtonText: {
    color: '#666',
    fontWeight: '500',
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
  },
  metricCard: {
    width: (Dimensions.get('window').width - 40) / 2,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricTitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  metricUnit: {
    fontSize: 14,
    fontWeight: 'normal',
    color: '#666',
  },
  changeContainer: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  positiveChange: {
    backgroundColor: '#e8f5e9',
  },
  negativeChange: {
    backgroundColor: '#ffebee',
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  positiveText: {
    color: '#4CAF50',
  },
  negativeText: {
    color: '#f44336',
  },
  chartContainer: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 150,
  },
  barContainer: {
    alignItems: 'center',
  },
  bar: {
    width: 30,
    borderRadius: 4,
    marginBottom: 8,
  },
  barLabel: {
    fontSize: 10,
    color: '#666',
  },
  insightsContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  insightCard: {
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
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  insightText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
});
