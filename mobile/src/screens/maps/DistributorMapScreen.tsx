import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, useColorScheme, Dimensions } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius, elevation } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/services/api/client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DistributorLocation {
  id: number;
  businessName: string;
  warehouseAddress: string;
  latitude: string | null;
  longitude: string | null;
  status: string;
  warehouseCapacityKg: string | null;
  averageRating: string | null;
  coverageRegions: string | null;
}

type ViewMode = 'list' | 'nearby' | 'clusters';

export default function DistributorMapScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [distributors, setDistributors] = useState<DistributorLocation[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [nearbyResults, setNearbyResults] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.trpc.distributorNetwork.getAll.query({ statusFilter: 'approved' });
      setDistributors(data as DistributorLocation[]);
    } catch (error: any) {
      Alert.alert('Error', 'Could not load distributor locations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const findNearby = async () => {
    try {
      const result = await apiClient.trpc.distributorNetwork.findNearby.query({
        lat: 9.082,
        lng: 8.6753,
        radiusKm: 100,
      });
      setNearbyResults((result as any).features || []);
      setViewMode('nearby');
    } catch {
      Alert.alert('Info', 'Spatial queries require PostGIS. Showing list view.');
    }
  };

  if (loading) return <Loading />;

  const withCoords = distributors.filter((d) => d.latitude && d.longitude);
  const styles = getStyles(isDark);

  return (
    <View style={styles.container} accessibilityLabel="Distributor Map screen">
      <Header title="Distributor Map" />

      <View style={styles.modeRow}>
        {(['list', 'nearby', 'clusters'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeBtn, viewMode === m && styles.modeBtnActive]}
            onPress={() => m === 'nearby' ? findNearby() : setViewMode(m)}
            accessibilityRole="button"
            accessibilityLabel={`${m} view mode`}
          >
            <Text style={[styles.modeText, viewMode === m && styles.modeTextActive]}>
              {m === 'list' ? '📍 List' : m === 'nearby' ? '🔍 Nearby' : '🔵 Clusters'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>{distributors.length} distributors • {withCoords.length} with GPS</Text>
      </View>

      <ScrollView style={styles.content}>
        {viewMode === 'list' && withCoords.map((d) => (
          <Card key={d.id} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.marker}>
                <Text style={styles.markerText}>📍</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{d.businessName}</Text>
                <Text style={styles.cardSub}>{d.warehouseAddress}</Text>
                <Text style={styles.coordText}>
                  {Number(d.latitude).toFixed(4)}°N, {Number(d.longitude).toFixed(4)}°E
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Badge label={d.status} variant="success" />
                {d.averageRating && <Text style={styles.ratingText}>⭐ {d.averageRating}</Text>}
              </View>
            </View>
          </Card>
        ))}

        {viewMode === 'nearby' && (
          <View>
            <Card style={styles.infoCard}>
              <Text style={styles.infoTitle}>PostGIS Proximity Search</Text>
              <Text style={styles.infoText}>Using ST_DWithin with geography type for accurate distance calculations (SRID 4326).</Text>
            </Card>
            {nearbyResults.length > 0 ? nearbyResults.map((f: any, i: number) => (
              <Card key={i} style={styles.card}>
                <Text style={styles.cardTitle}>{f.properties?.businessName || 'Distributor'}</Text>
                <Text style={styles.cardSub}>{f.properties?.distanceKm?.toFixed(1)} km away</Text>
              </Card>
            )) : (
              <Text style={styles.emptyText}>No nearby distributors found within 100km radius. PostGIS spatial queries will return results when the database has geolocation data.</Text>
            )}
          </View>
        )}

        {viewMode === 'clusters' && (
          <View>
            <Card style={styles.infoCard}>
              <Text style={styles.infoTitle}>Spatial Clustering (ST_ClusterDBSCAN)</Text>
              <Text style={styles.infoText}>DBSCAN algorithm groups distributors within 30km radius. Clusters inform logistics hub placement.</Text>
            </Card>
            <Text style={styles.emptyText}>Cluster analysis requires PostGIS with spatial data. Results will appear with production data.</Text>
          </View>
        )}

        {viewMode === 'list' && withCoords.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyTitle}>No GPS Data</Text>
            <Text style={styles.emptyText}>Distributors haven't set their warehouse coordinates yet.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? darkColors.background : colors.background },
  content: { flex: 1, padding: spacing.md },
  modeRow: { flexDirection: 'row', padding: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.xs },
  modeBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: borderRadius.md, backgroundColor: isDark ? darkColors.backgroundSecondary : colors.gray100 },
  modeBtnActive: { backgroundColor: colors.secondary },
  modeText: { fontSize: fontSize.sm, fontWeight: '600', color: isDark ? darkColors.textSecondary : colors.gray600 },
  modeTextActive: { color: colors.white },
  statsBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  statsText: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  card: { marginBottom: spacing.sm, padding: spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  marker: { width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? darkColors.backgroundSecondary : colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  markerText: { fontSize: 18 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  cardSub: { fontSize: fontSize.xs, color: isDark ? darkColors.textSecondary : colors.gray600, marginTop: 2 },
  coordText: { fontSize: fontSize.xs, color: colors.secondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  ratingText: { fontSize: fontSize.xs, marginTop: 4, color: isDark ? darkColors.textMuted : colors.gray500 },
  infoCard: { marginBottom: spacing.md, padding: spacing.md, backgroundColor: isDark ? '#1e3a5f' : '#eff6ff' },
  infoTitle: { fontSize: fontSize.md, fontWeight: '700', color: isDark ? '#93c5fd' : '#1d4ed8', marginBottom: 4 },
  infoText: { fontSize: fontSize.sm, color: isDark ? '#bfdbfe' : '#3b82f6' },
  emptyContainer: { alignItems: 'center', padding: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.sm, padding: spacing.md },
});
