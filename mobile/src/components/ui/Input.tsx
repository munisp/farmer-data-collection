import React from 'react';
import { TextInput, View, Text, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { COLORS } from '@/utils/constants';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({ label, error, containerStyle, style, ...props }) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput style={[styles.input, error && styles.inputError, style]} placeholderTextColor={COLORS.textLight} {...props} />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, fontSize: 16, color: COLORS.text, backgroundColor: COLORS.background },
  inputError: { borderColor: COLORS.error },
  errorText: { fontSize: 12, color: COLORS.error, marginTop: 4 },
});
