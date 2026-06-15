import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, useColorScheme } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Loading } from '@/components/shared/Loading';
import { Card } from '@/components/ui/Card';
import { apiClient } from '@/services/api/client';

interface CreditScore {
  score: number;
  maxScore: number;
  grade: string;
  factors: Array<{ name: string; impact: string; score: number }>;
  lastUpdated: string;
}

export default function CreditScoreScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creditData, setCreditData] = useState<CreditScore | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.trpc.creditScoring.getMyScore.query();
      setCreditData(data as CreditScore);
    } catch (error: any) {
      if (!silent) Alert.alert('Error', 'Could not load credit score');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) return <Loading />;

  const styles = getStyles(isDark);
  const scoreColor = (score: number) => {
    if (score >= 750) return colors.success;
    if (score >= 600) return colors.warning;
    return colors.error;
  };

  return (
    <View style={styles.container} accessibilityLabel="Credit Score screen">
      <Header title="Credit Score" />
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} />}
      >
        {creditData ? (
          <>
            <Card style={styles.scoreCard}>
              <View style={styles.scoreCircle}>
                <Text style={[styles.scoreValue, { color: scoreColor(creditData.score) }]}>{creditData.score}</Text>
                <Text style={styles.scoreMax}>/ {creditData.maxScore}</Text>
              </View>
              <Text style={[styles.gradeText, { color: scoreColor(creditData.score) }]}>{creditData.grade}</Text>
              <Text style={styles.updatedText}>Last updated: {new Date(creditData.lastUpdated).toLocaleDateString()}</Text>
            </Card>

            <Text style={styles.sectionTitle}>Score Factors</Text>
            {creditData.factors.map((factor, i) => (
              <Card key={i} style={styles.factorCard}>
                <View style={styles.factorHeader}>
                  <Text style={styles.factorName}>{factor.name}</Text>
                  <Text style={[styles.factorImpact, { color: factor.impact === 'positive' ? colors.success : factor.impact === 'negative' ? colors.error : colors.warning }]}>
                    {factor.impact === 'positive' ? '↑' : factor.impact === 'negative' ? '↓' : '→'} {factor.impact}
                  </Text>
                </View>
                <View style={styles.factorBar}>
                  <View style={[styles.factorFill, { width: `${(factor.score / 100) * 100}%`, backgroundColor: factor.score >= 70 ? colors.success : factor.score >= 40 ? colors.warning : colors.error }]} />
                </View>
              </Card>
            ))}

            <Card style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>💡 Improve Your Score</Text>
              <Text style={styles.tipsText}>• Make loan repayments on time</Text>
              <Text style={styles.tipsText}>• Increase harvest consistency</Text>
              <Text style={styles.tipsText}>• Use platform features regularly</Text>
              <Text style={styles.tipsText}>• Complete KYC verification</Text>
            </Card>
          </>
        ) : (
          <Card style={styles.scoreCard}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>Score Not Available</Text>
            <Text style={styles.emptyText}>Complete your profile and use the platform to build your credit score.</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? darkColors.background : colors.background },
  content: { flex: 1, padding: spacing.md },
  scoreCard: { alignItems: 'center', padding: spacing.xl, marginBottom: spacing.md },
  scoreCircle: { flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.xs },
  scoreValue: { fontSize: 56, fontWeight: '800' },
  scoreMax: { fontSize: fontSize.lg, color: isDark ? darkColors.textMuted : colors.gray400, marginLeft: 4 },
  gradeText: { fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.xs },
  updatedText: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray500 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.sm },
  factorCard: { marginBottom: spacing.xs, padding: spacing.sm },
  factorHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  factorName: { fontSize: fontSize.sm, fontWeight: '500', color: isDark ? darkColors.text : colors.gray900 },
  factorImpact: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  factorBar: { height: 6, borderRadius: 3, backgroundColor: isDark ? darkColors.backgroundSecondary : colors.gray200 },
  factorFill: { height: '100%', borderRadius: 3 },
  tipsCard: { marginTop: spacing.md, padding: spacing.md, backgroundColor: isDark ? '#1e3a5f' : '#eff6ff' },
  tipsTitle: { fontSize: fontSize.md, fontWeight: '700', color: isDark ? '#93c5fd' : '#1d4ed8', marginBottom: spacing.sm },
  tipsText: { fontSize: fontSize.sm, color: isDark ? '#bfdbfe' : '#3b82f6', marginBottom: 4, lineHeight: 20 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.md },
});
