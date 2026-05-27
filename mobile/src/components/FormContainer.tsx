import React, { ReactNode } from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ViewStyle,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/utils/constants';

interface FormContainerProps {
  children: ReactNode;
  style?: ViewStyle;
  scrollable?: boolean;
  keyboardAvoiding?: boolean;
  safeArea?: boolean;
  backgroundColor?: string;
  contentContainerStyle?: ViewStyle;
}

export function FormContainer({
  children,
  style,
  scrollable = true,
  keyboardAvoiding = true,
  safeArea = true,
  backgroundColor = COLORS.background,
  contentContainerStyle,
}: FormContainerProps) {
  const content = scrollable ? (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.container, style]}>{children}</View>
  );

  const keyboardContent = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {content}
    </KeyboardAvoidingView>
  ) : (
    content
  );

  if (safeArea) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={backgroundColor} />
        {keyboardContent}
      </SafeAreaView>
    );
  }

  return keyboardContent;
}

interface ScreenContainerProps {
  children: ReactNode;
  style?: ViewStyle;
  backgroundColor?: string;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export function ScreenContainer({
  children,
  style,
  backgroundColor = COLORS.background,
  edges = ['top', 'left', 'right'],
}: ScreenContainerProps) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }, style]} edges={edges}>
      <StatusBar barStyle="dark-content" backgroundColor={backgroundColor} />
      {children}
    </SafeAreaView>
  );
}

interface CardContainerProps {
  children: ReactNode;
  style?: ViewStyle;
  padding?: number;
  margin?: number;
  elevated?: boolean;
}

export function CardContainer({
  children,
  style,
  padding = 16,
  margin = 16,
  elevated = true,
}: CardContainerProps) {
  return (
    <View
      style={[
        styles.card,
        elevated && styles.cardElevated,
        { padding, margin },
        style,
      ]}
    >
      {children}
    </View>
  );
}

interface SectionContainerProps {
  children: ReactNode;
  title?: string;
  style?: ViewStyle;
}

export function SectionContainer({ children, style }: SectionContainerProps) {
  return <View style={[styles.section, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
  },
  cardElevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  section: {
    marginBottom: 24,
  },
});

export default FormContainer;
