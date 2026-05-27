import React from 'react';
import { Modal as RNModal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS } from '@/utils/constants';
import { Button } from './Button';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  actions?: Array<{ label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'outline' }>;
}

export const Modal: React.FC<ModalProps> = ({ visible, onClose, title, children, actions }) => {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {title && <Text style={styles.title}>{title}</Text>}
          <ScrollView style={styles.content}>{children}</ScrollView>
          {actions && (
            <View style={styles.actions}>
              {actions.map((action, idx) => (
                <Button key={idx} title={action.label} onPress={action.onPress} variant={action.variant || 'primary'} style={styles.actionButton} />
              ))}
            </View>
          )}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { backgroundColor: '#fff', borderRadius: 16, width: '100%', maxHeight: '80%', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  content: { maxHeight: 400 },
  actions: { flexDirection: 'row', marginTop: 16, gap: 8 },
  actionButton: { flex: 1 },
  closeButton: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  closeText: { fontSize: 24, color: COLORS.textLight },
});
