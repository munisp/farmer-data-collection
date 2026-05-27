import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '@/utils/constants';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'outlined';
}

export const Card: React.FC<CardProps> = ({ children, style, variant = 'default' }) => {
  return <View style={[styles.card, styles[`${variant}Card`], style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, backgroundColor: '#fff' },
  defaultCard: { borderWidth: 1, borderColor: COLORS.border },
  elevatedCard: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  outlinedCard: { borderWidth: 2, borderColor: COLORS.primary },
});
