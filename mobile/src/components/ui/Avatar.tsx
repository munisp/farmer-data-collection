import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS } from '@/utils/constants';

interface AvatarProps {
  uri?: string;
  name?: string;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ uri, name, size = 40 }) => {
  const initials = name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.initials, { fontSize: size / 2.5 }]}>{initials || '?'}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  avatar: { backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  initials: { color: '#fff', fontWeight: '600' },
});
