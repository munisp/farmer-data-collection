import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useSyncStore } from '@/stores/syncStore';
import { COLORS } from '@/utils/constants';

export const SyncIndicator: React.FC = () => {
  const { syncing, pendingCount } = useSyncStore();
  
  if (!syncing && pendingCount === 0) return null;
  
  return (
    <View style={styles.container}>
      {syncing && <ActivityIndicator size="small" color={COLORS.primary} />}
      <Text style={styles.text}>
        {syncing ? 'Syncing...' : `${pendingCount} items pending`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: '#fef3c7', borderRadius: 8, margin: 16 },
  text: { marginLeft: 8, fontSize: 14, color: '#92400e', fontWeight: '500' },
});
