import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/utils/constants';
import { Button } from '../ui/Button';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, message, actionLabel, onAction }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction && <Button title={actionLabel} onPress={onAction} style={styles.button} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  message: { fontSize: 16, color: COLORS.textLight, textAlign: 'center', marginBottom: 24 },
  button: { minWidth: 200 },
});
