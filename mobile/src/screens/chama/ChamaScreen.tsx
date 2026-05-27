import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';
import { apiClient } from '@/services/api/client';

interface ChamaGroup {
  id: number;
  name: string;
  description: string | null;
  contributionAmount: number;
  contributionFrequency: string;
  currency: string;
  myRole: string;
  memberCount: number;
}

export default function ChamaScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState<ChamaGroup[]>([]);

  useEffect(() => {
    void loadGroups();
  }, []);

  const loadGroups = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.chama.getMyGroups.query();
      setGroups(data as ChamaGroup[]);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load groups');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <View style={styles.container}>
      <Header title="Chama Groups" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadGroups(true); }} />}
      >
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{groups.length}</Text>
            <Text style={styles.statLabel}>My Groups</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>
              {groups.filter(g => g.myRole === 'chairperson').length}
            </Text>
            <Text style={styles.statLabel}>Leading</Text>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Groups</Text>
          {groups.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No groups yet</Text>
              <Text style={styles.emptySubtext}>Create or join a Chama savings group</Text>
              <TouchableOpacity style={styles.button}>
                <Text style={styles.buttonText}>Create Group</Text>
              </TouchableOpacity>
            </Card>
          ) : (
            groups.map((group) => (
              <Card key={group.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{group.name}</Text>
                  <Badge label={group.myRole} color={group.myRole === 'chairperson' ? COLORS.primary : COLORS.success} />
                </View>
                {group.description && (
                  <Text style={styles.cardDesc}>{group.description}</Text>
                )}
                <View style={styles.detailRow}>
                  <View style={styles.detail}>
                    <Text style={styles.detailLabel}>Contribution</Text>
                    <Text style={styles.detailValue}>
                      {group.currency} {group.contributionAmount}/{group.contributionFrequency}
                    </Text>
                  </View>
                  <View style={styles.detail}>
                    <Text style={styles.detailLabel}>Members</Text>
                    <Text style={styles.detailValue}>{group.memberCount || '—'}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actionBtn}>
                    <Text style={styles.actionText}>Contribute</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]}>
                    <Text style={[styles.actionText, { color: COLORS.primary }]}>Details</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How Chama Works</Text>
          <Card style={styles.card}>
            <Text style={styles.infoText}>
              A Chama (VSLA) is a savings group of 15-30 members. Each member contributes a fixed amount regularly.
              Members can borrow from the pool with interest, and profits are shared based on contribution shares.
              Social collateral (guarantors) replaces traditional bank requirements.
            </Text>
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
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: { flex: 1, padding: 16, alignItems: 'center' as const },
  statValue: { fontSize: 28, fontWeight: '700', color: COLORS.primary },
  statLabel: { fontSize: 13, color: COLORS.textSecondary || '#666', marginTop: 4 },
  card: { marginBottom: 12, padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text || '#333' },
  cardDesc: { fontSize: 14, color: COLORS.textSecondary || '#666', marginTop: 4 },
  detailRow: { flexDirection: 'row', marginTop: 12, gap: 24 },
  detail: {},
  detailLabel: { fontSize: 12, color: COLORS.textSecondary || '#999' },
  detailValue: { fontSize: 15, fontWeight: '600', color: COLORS.text || '#333' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1, backgroundColor: COLORS.primary, padding: 10, borderRadius: 8,
    alignItems: 'center' as const,
  },
  actionBtnSecondary: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.primary,
  },
  actionText: { color: '#fff', fontWeight: '600' },
  emptyCard: { padding: 24, alignItems: 'center' as const },
  emptyText: { fontSize: 16, color: COLORS.textSecondary || '#666' },
  emptySubtext: { fontSize: 14, color: COLORS.textSecondary || '#999', marginTop: 4 },
  button: {
    backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 8, marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  infoText: { fontSize: 14, lineHeight: 20, color: COLORS.text || '#333' },
});
