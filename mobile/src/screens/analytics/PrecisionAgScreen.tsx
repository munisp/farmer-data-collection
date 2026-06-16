import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/services/api/client';

interface FieldAnalytics {
  id: number;
  fieldName: string;
  crop: string;
  areaHa: number;
  ndvi: number;
  soilMoisture: number;
  growthStage: string;
  yieldEstimate: number;
  healthScore: number;
  recommendation: string;
}

export default function PrecisionAgScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fields, setFields] = useState<FieldAnalytics[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.precisionAg.getFieldAnalytics.query();
      setFields(data as FieldAnalytics[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load field analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);
  const totalArea = fields.reduce((s, f) => s + f.areaHa, 0);
  const avgHealth = fields.length > 0 ? Math.round(fields.reduce((s, f) => s + f.healthScore, 0) / fields.length) : 0;

  const healthColor = (score: number) => score >= 80 ? colors.success : score >= 60 ? colors.warning : colors.error;

  return (
    <View style={styles.container} accessibilityLabel="Precision Agriculture screen">
      <Header title="Precision Agriculture" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{fields.length}</Text>
            <Text style={styles.statLabel}>Fields</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{totalArea.toFixed(1)} ha</Text>
            <Text style={styles.statLabel}>Total Area</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: healthColor(avgHealth) }]}>{avgHealth}%</Text>
            <Text style={styles.statLabel}>Avg Health</Text>
          </Card>
        </View>

        {fields.map((field) => (
          <Card key={field.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{field.fieldName}</Text>
                <Text style={styles.fieldCrop}>{field.crop} • {field.areaHa} ha • {field.growthStage}</Text>
              </View>
              <View style={[styles.healthBadge, { backgroundColor: healthColor(field.healthScore) + '20' }]}>
                <Text style={[styles.healthValue, { color: healthColor(field.healthScore) }]}>{field.healthScore}%</Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>NDVI</Text>
                <Text style={styles.metricValue}>{field.ndvi.toFixed(2)}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Soil Moisture</Text>
                <Text style={styles.metricValue}>{field.soilMoisture}%</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Yield Est.</Text>
                <Text style={styles.metricValue}>{field.yieldEstimate} t/ha</Text>
              </View>
            </View>

            {field.recommendation && (
              <View style={styles.recBox}>
                <Text style={styles.recText}>💡 {field.recommendation}</Text>
              </View>
            )}
          </Card>
        ))}

        {fields.length === 0 && (
          <Card style={styles.card}>
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🛰️</Text>
              <Text style={styles.emptyTitle}>No Field Data</Text>
              <Text style={styles.emptyText}>Register your fields to get satellite-based analytics, NDVI maps, and yield predictions.</Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? darkColors.background : colors.background },
  content: { flex: 1, padding: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, alignItems: 'center', padding: spacing.md },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  card: { marginBottom: spacing.md, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  fieldCrop: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500, marginTop: 2 },
  healthBadge: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  healthValue: { fontSize: fontSize.sm, fontWeight: '700' },
  metricsGrid: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: isDark ? darkColors.border : colors.gray100 },
  metricItem: { alignItems: 'center' },
  metricLabel: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  metricValue: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginTop: 2 },
  recBox: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: borderRadius.md, backgroundColor: isDark ? '#1e3a5f' : '#eff6ff' },
  recText: { fontSize: fontSize.sm, color: isDark ? '#bfdbfe' : '#3b82f6', lineHeight: 18 },
  emptyContainer: { alignItems: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.sm, lineHeight: 20 },
});
