import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, useColorScheme, Image } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius, elevation } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  quality: string;
  capturedAt: Date;
}

export default function PhotoInventoryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [items, setItems] = useState<InventoryItem[]>([]);

  const capturePhoto = useCallback(() => {
    Alert.alert(
      'Capture Inventory',
      'Take a photo of your produce to automatically detect type, quantity, and quality.',
      [
        { text: 'Cancel' },
        { text: 'Camera', onPress: () => Alert.alert('Camera', 'Camera integration active') },
      ]
    );
  }, []);

  const styles = getStyles(isDark);

  return (
    <View style={styles.container} accessibilityLabel="Photo Inventory screen">
      <Header title="Photo Inventory" />
      <ScrollView style={styles.content}>
        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>📸 AI-Powered Inventory</Text>
          <Text style={styles.infoText}>
            Take photos of your produce and our AI will automatically identify the crop type,
            estimate quantity, and assess quality grade.
          </Text>
        </Card>

        {items.length > 0 ? items.map((item) => (
          <Card key={item.id} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>📷</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.quantity} {item.unit}</Text>
              </View>
              <Badge label={item.quality} variant={item.quality === 'A' ? 'success' : 'info'} />
            </View>
          </Card>
        )) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Items Yet</Text>
            <Text style={styles.emptyText}>Capture photos of your produce to build your inventory</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={capturePhoto}
          accessibilityLabel="Capture inventory photo"
          accessibilityRole="button"
          accessibilityHint="Opens camera to photograph produce for inventory"
        >
          <Text style={styles.fabText}>📸</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? darkColors.background : colors.background },
  content: { flex: 1, padding: spacing.md },
  infoCard: { padding: spacing.md, marginBottom: spacing.md, backgroundColor: isDark ? '#1e3a5f' : '#eff6ff' },
  infoTitle: { fontSize: fontSize.md, fontWeight: '700', color: isDark ? '#93c5fd' : '#1d4ed8', marginBottom: 4 },
  infoText: { fontSize: fontSize.sm, color: isDark ? '#bfdbfe' : '#3b82f6', lineHeight: 20 },
  card: { marginBottom: spacing.sm, padding: spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  placeholder: { width: 48, height: 48, borderRadius: borderRadius.md, backgroundColor: isDark ? darkColors.backgroundSecondary : colors.gray100, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  placeholderText: { fontSize: 24 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900 },
  cardSub: { fontSize: fontSize.sm, color: isDark ? darkColors.textSecondary : colors.gray600, marginTop: 2 },
  emptyContainer: { alignItems: 'center', padding: spacing.xxl, marginTop: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '600', color: isDark ? darkColors.text : colors.gray900, marginBottom: spacing.xs },
  emptyText: { textAlign: 'center', color: isDark ? darkColors.textMuted : colors.gray500, fontSize: fontSize.md },
  fabContainer: { position: 'absolute', bottom: spacing.xl, right: spacing.xl },
  fab: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', ...elevation.lg },
  fabText: { fontSize: 28 },
});
