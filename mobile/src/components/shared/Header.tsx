import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '@/utils/constants';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: { label: string; onPress: () => void };
}

export const Header: React.FC<HeaderProps> = ({ title, showBack, rightAction }) => {
  const navigation = useNavigation();
  
  return (
    <View style={styles.header}>
      {showBack && (
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.title}>{title}</Text>
      {rightAction && (
        <TouchableOpacity onPress={rightAction.onPress}>
          <Text style={styles.rightAction}>{rightAction.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 48, backgroundColor: COLORS.primary },
  backButton: { marginRight: 12 },
  backText: { fontSize: 24, color: '#ffffff' },
  title: { flex: 1, fontSize: 18, fontWeight: '600', color: '#ffffff' },
  rightAction: { fontSize: 16, color: '#ffffff', fontWeight: '600' },
});
