import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '@/utils/constants';

interface BadgeProps {
  text: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default';
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({ text, variant = 'default', style }) => {
  return (
    <View style={[styles.badge, styles[`${variant}Badge`], style]}>
      <Text style={[styles.text, styles[`${variant}Text`]]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  defaultBadge: { backgroundColor: '#e5e7eb' },
  successBadge: { backgroundColor: '#d1fae5' },
  warningBadge: { backgroundColor: '#fef3c7' },
  errorBadge: { backgroundColor: '#fee2e2' },
  infoBadge: { backgroundColor: '#dbeafe' },
  text: { fontSize: 12, fontWeight: '600' },
  defaultText: { color: COLORS.text },
  successText: { color: '#065f46' },
  warningText: { color: '#92400e' },
  errorText: { color: '#991b1b' },
  infoText: { color: '#1e40af' },
});
