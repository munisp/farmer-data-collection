import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';
import { apiClient } from '@/services/api/client';

interface DeliveryAssignment {
  id: number;
  orderId: number;
  driverId: number;
  status: string;
  estimatedArrival: string | null;
  actualArrival: string | null;
}

interface CollectionPoint {
  id: number;
  name: string;
  latitude: string;
  longitude: string;
  address: string | null;
  capacityTons: string;
  contactPhone: string | null;
}

export default function DeliveryTrackingScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [nearbyPoints, setNearbyPoints] = useState<CollectionPoint[]>([]);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Load nearby collection points
      const points = await apiClient.trpc.delivery.listCollectionPoints.query({});
      setNearbyPoints(points.slice(0, 5));
    } catch (error: any) {
      // Silent fail for read operations
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <View style={styles.container}>
      <Header title="Delivery & Collection" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} />}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Deliveries</Text>
          {assignments.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No active deliveries</Text>
              <Text style={styles.emptySubtext}>Your delivery assignments will appear here</Text>
            </Card>
          ) : (
            assignments.map((a) => (
              <Card key={a.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardTitle}>Order #{a.orderId}</Text>
                  <Badge label={a.status} color={a.status === 'delivered' ? COLORS.success : COLORS.primary} />
                </View>
                {a.estimatedArrival && (
                  <Text style={styles.cardDetail}>
                    ETA: {new Date(a.estimatedArrival).toLocaleString()}
                  </Text>
                )}
              </Card>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nearby Collection Points</Text>
          {nearbyPoints.map((point) => (
            <Card key={point.id} style={styles.card}>
              <Text style={styles.cardTitle}>{point.name}</Text>
              {point.address && <Text style={styles.cardDetail}>{point.address}</Text>}
              <View style={styles.cardRow}>
                <Text style={styles.cardMeta}>Capacity: {point.capacityTons} tons</Text>
                {point.contactPhone && (
                  <TouchableOpacity>
                    <Text style={[styles.cardMeta, { color: COLORS.primary }]}>
                      Call: {point.contactPhone}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </Card>
          ))}
          {nearbyPoints.length === 0 && (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No collection points found</Text>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Fee Calculator</Text>
          <Card style={styles.card}>
            <Text style={styles.cardDetail}>
              Enter pickup and delivery locations to estimate delivery costs including cold chain surcharges.
            </Text>
            <TouchableOpacity style={styles.button}>
              <Text style={styles.buttonText}>Calculate Fee</Text>
            </TouchableOpacity>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background || '#f5f5f5' },
  content: { flex: 1, padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: COLORS.text || '#333' },
  card: { marginBottom: 12, padding: 16 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text || '#333' },
  cardDetail: { fontSize: 14, color: COLORS.textSecondary || '#666', marginTop: 4 },
  cardMeta: { fontSize: 13, color: COLORS.textSecondary || '#666', marginTop: 4 },
  emptyCard: { padding: 24, alignItems: 'center' as const },
  emptyText: { fontSize: 16, color: COLORS.textSecondary || '#666' },
  emptySubtext: { fontSize: 14, color: COLORS.textSecondary || '#999', marginTop: 4 },
  button: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center' as const },
  buttonText: { color: '#fff', fontWeight: '600' },
});
