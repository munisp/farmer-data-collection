import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Header } from '@/components/shared/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COLORS } from '@/utils/constants';
import { apiClient } from '@/services/api/client';

export default function MobileMoneyScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<'mpesa' | 'mtn_momo' | 'airtel_money'>('mpesa');
  const [processing, setProcessing] = useState(false);

  const providers = [
    { key: 'mpesa' as const, label: 'M-Pesa', color: '#4CAF50' },
    { key: 'mtn_momo' as const, label: 'MTN MoMo', color: '#FFCC00' },
    { key: 'airtel_money' as const, label: 'Airtel Money', color: '#FF0000' },
  ];

  const handlePayment = async () => {
    if (!phoneNumber || !amount) {
      Alert.alert('Missing Info', 'Please enter phone number and amount');
      return;
    }

    setProcessing(true);
    try {
      if (provider === 'mpesa') {
        await apiClient.trpc.mobileMoney.initiateSTKPush.mutate({
          phoneNumber,
          amount: parseInt(amount, 10),
          description: 'Farm Platform Payment',
        });
        Alert.alert('STK Push Sent', 'Check your phone for the M-Pesa prompt');
      } else if (provider === 'mtn_momo') {
        await apiClient.trpc.mobileMoney.initiateMTNPayment.mutate({
          phoneNumber,
          amount: parseInt(amount, 10),
          currency: 'UGX',
        });
        Alert.alert('Payment Requested', 'Approve the payment on your phone');
      }
    } catch (error: any) {
      Alert.alert('Payment Failed', error?.message || 'Could not process payment');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Mobile Money" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Provider</Text>
          <View style={styles.providerRow}>
            {providers.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.providerBtn,
                  provider === p.key && { borderColor: p.color, borderWidth: 2, backgroundColor: p.color + '15' },
                ]}
                onPress={() => setProvider(p.key)}
              >
                <Text style={[styles.providerText, provider === p.key && { fontWeight: '700' }]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <Card style={styles.card}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder={provider === 'mpesa' ? '254712345678' : '256771234567'}
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="1000"
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.payButton, processing && styles.payButtonDisabled]}
              onPress={handlePayment}
              disabled={processing}
            >
              <Text style={styles.payButtonText}>
                {processing ? 'Processing...' : `Pay via ${providers.find(p => p.key === provider)?.label}`}
              </Text>
            </TouchableOpacity>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <Card style={styles.card}>
            <View style={styles.step}>
              <Badge label="1" color={COLORS.primary} />
              <Text style={styles.stepText}>Enter amount and phone number</Text>
            </View>
            <View style={styles.step}>
              <Badge label="2" color={COLORS.primary} />
              <Text style={styles.stepText}>Approve the payment on your phone</Text>
            </View>
            <View style={styles.step}>
              <Badge label="3" color={COLORS.primary} />
              <Text style={styles.stepText}>Funds held in escrow until delivery confirmed</Text>
            </View>
            <View style={styles.step}>
              <Badge label="4" color={COLORS.primary} />
              <Text style={styles.stepText}>Seller receives payment after 48h or buyer confirmation</Text>
            </View>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background || '#f5f5f5' },
  content: { flex: 1, padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: COLORS.text || '#333' },
  providerRow: { flexDirection: 'row', gap: 10 },
  providerBtn: {
    flex: 1, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
    backgroundColor: '#fff', alignItems: 'center' as const,
  },
  providerText: { fontSize: 14, color: COLORS.text || '#333' },
  card: { padding: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12, color: COLORS.text || '#333' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16,
    backgroundColor: '#fff',
  },
  payButton: {
    backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, marginTop: 20,
    alignItems: 'center' as const,
  },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  step: { flexDirection: 'row', alignItems: 'center' as const, gap: 12, paddingVertical: 8 },
  stepText: { fontSize: 14, color: COLORS.text || '#333', flex: 1 },
});
