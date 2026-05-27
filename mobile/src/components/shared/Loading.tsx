import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/utils/constants';

interface LoadingProps {
  message?: string;
}

export const Loading: React.FC<LoadingProps> = ({ message }) => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  message: { marginTop: 16, fontSize: 16, color: COLORS.textLight },
});
