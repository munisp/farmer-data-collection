import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { database } from '@/services/database';
import { useSyncStore } from '@/stores/syncStore';

const LOAN_PURPOSES = [
  'Seeds & Inputs',
  'Equipment',
  'Land Preparation',
  'Irrigation',
  'Livestock',
  'Storage',
  'Transportation',
  'Processing',
  'Working Capital',
  'Other',
];

const LOAN_TERMS = [
  { label: '3 months', value: 3 },
  { label: '6 months', value: 6 },
  { label: '9 months', value: 9 },
  { label: '12 months', value: 12 },
  { label: '18 months', value: 18 },
  { label: '24 months', value: 24 },
];

const REPAYMENT_FREQUENCIES = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Bi-weekly', value: 'biweekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'At Harvest', value: 'harvest' },
];

interface LoanFormData {
  farmerId: string;
  farmerName: string;
  farmerPhone: string;
  amount: string;
  purpose: string;
  purposeDetails: string;
  termMonths: number;
  repaymentFrequency: string;
  collateralType: string;
  collateralValue: string;
  farmId: string;
  cropType: string;
  expectedHarvestDate: string;
  notes: string;
}

const initialFormData: LoanFormData = {
  farmerId: '',
  farmerName: '',
  farmerPhone: '',
  amount: '',
  purpose: '',
  purposeDetails: '',
  termMonths: 6,
  repaymentFrequency: 'monthly',
  collateralType: '',
  collateralValue: '',
  farmId: '',
  cropType: '',
  expectedHarvestDate: '',
  notes: '',
};

export default function LoanApplicationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { updatePendingCount } = useSyncStore();
  
  const params = route.params as any;
  
  const [formData, setFormData] = useState<LoanFormData>({
    ...initialFormData,
    farmerId: params?.farmerId || '',
    farmerName: params?.farmerName || '',
    farmerPhone: params?.farmerPhone || '',
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const updateField = (field: keyof LoanFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateStep1 = () => {
    if (!formData.farmerName.trim()) {
      Alert.alert('Validation Error', 'Farmer name is required');
      return false;
    }
    if (!formData.farmerPhone.trim()) {
      Alert.alert('Validation Error', 'Farmer phone is required');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.amount.trim() || isNaN(parseFloat(formData.amount))) {
      Alert.alert('Validation Error', 'Valid loan amount is required');
      return false;
    }
    if (!formData.purpose) {
      Alert.alert('Validation Error', 'Loan purpose is required');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const calculateMonthlyPayment = () => {
    const principal = parseFloat(formData.amount) || 0;
    const annualRate = 0.24; // 24% annual interest rate (typical for microfinance)
    const monthlyRate = annualRate / 12;
    const months = formData.termMonths;
    
    if (principal <= 0 || months <= 0) return 0;
    
    const payment = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / 
                   (Math.pow(1 + monthlyRate, months) - 1);
    return payment;
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const applicationId = `loan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const loanApplication = {
        id: applicationId,
        farmerId: formData.farmerId || null,
        farmerName: formData.farmerName,
        farmerPhone: formData.farmerPhone,
        amount: parseFloat(formData.amount),
        purpose: formData.purpose,
        purposeDetails: formData.purposeDetails || null,
        termMonths: formData.termMonths,
        repaymentFrequency: formData.repaymentFrequency,
        collateralType: formData.collateralType || null,
        collateralValue: formData.collateralValue ? parseFloat(formData.collateralValue) : null,
        farmId: formData.farmId || null,
        cropType: formData.cropType || null,
        expectedHarvestDate: formData.expectedHarvestDate || null,
        notes: formData.notes || null,
        status: 'pending',
        estimatedMonthlyPayment: calculateMonthlyPayment(),
        synced: false,
        createdAt: now,
        updatedAt: now,
        submittedBy: 'field_agent',
      };

      await database.createLoanApplication(loanApplication);
      await updatePendingCount();

      Alert.alert(
        'Application Submitted',
        `Loan application for ${formData.farmerName} has been submitted successfully. Application ID: ${applicationId.slice(-8).toUpperCase()}\n\nThe application will sync when you have internet connection.`,
        [
          {
            text: 'New Application',
            onPress: () => {
              setFormData(initialFormData);
              setStep(1);
            },
          },
          {
            text: 'Done',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Loan application error:', error);
      Alert.alert('Error', 'Failed to submit loan application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Farmer Information</Text>
      <Text style={styles.stepDescription}>Enter the farmer's details for the loan application</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Farmer Name *</Text>
        <TextInput
          style={styles.input}
          value={formData.farmerName}
          onChangeText={(text) => updateField('farmerName', text)}
          placeholder="Enter farmer's full name"
          autoCapitalize="words"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phone Number *</Text>
        <TextInput
          style={styles.input}
          value={formData.farmerPhone}
          onChangeText={(text) => updateField('farmerPhone', text)}
          placeholder="e.g., +234 801 234 5678"
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Farmer ID (if known)</Text>
        <TextInput
          style={styles.input}
          value={formData.farmerId}
          onChangeText={(text) => updateField('farmerId', text)}
          placeholder="Enter farmer ID"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Primary Crop</Text>
        <TextInput
          style={styles.input}
          value={formData.cropType}
          onChangeText={(text) => updateField('cropType', text)}
          placeholder="e.g., Maize, Rice, Cassava"
        />
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Loan Details</Text>
      <Text style={styles.stepDescription}>Specify the loan amount and purpose</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Loan Amount (NGN) *</Text>
        <TextInput
          style={styles.input}
          value={formData.amount}
          onChangeText={(text) => updateField('amount', text)}
          placeholder="Enter amount"
          keyboardType="numeric"
        />
        {formData.amount && !isNaN(parseFloat(formData.amount)) && (
          <Text style={styles.amountText}>
            {formatCurrency(parseFloat(formData.amount))}
          </Text>
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Loan Purpose *</Text>
        <View style={styles.purposeGrid}>
          {LOAN_PURPOSES.map((purpose) => (
            <TouchableOpacity
              key={purpose}
              style={[
                styles.purposeChip,
                formData.purpose === purpose && styles.purposeChipActive,
              ]}
              onPress={() => updateField('purpose', purpose)}
            >
              <Text
                style={[
                  styles.purposeChipText,
                  formData.purpose === purpose && styles.purposeChipTextActive,
                ]}
              >
                {purpose}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Purpose Details</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.purposeDetails}
          onChangeText={(text) => updateField('purposeDetails', text)}
          placeholder="Describe how the loan will be used..."
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Loan Term</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.termContainer}>
            {LOAN_TERMS.map((term) => (
              <TouchableOpacity
                key={term.value}
                style={[
                  styles.termChip,
                  formData.termMonths === term.value && styles.termChipActive,
                ]}
                onPress={() => updateField('termMonths', term.value)}
              >
                <Text
                  style={[
                    styles.termChipText,
                    formData.termMonths === term.value && styles.termChipTextActive,
                  ]}
                >
                  {term.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Repayment Frequency</Text>
        <View style={styles.frequencyContainer}>
          {REPAYMENT_FREQUENCIES.map((freq) => (
            <TouchableOpacity
              key={freq.value}
              style={[
                styles.frequencyChip,
                formData.repaymentFrequency === freq.value && styles.frequencyChipActive,
              ]}
              onPress={() => updateField('repaymentFrequency', freq.value)}
            >
              <Text
                style={[
                  styles.frequencyChipText,
                  formData.repaymentFrequency === freq.value && styles.frequencyChipTextActive,
                ]}
              >
                {freq.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep3 = () => {
    const monthlyPayment = calculateMonthlyPayment();
    const totalPayment = monthlyPayment * formData.termMonths;
    const totalInterest = totalPayment - (parseFloat(formData.amount) || 0);

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Review & Submit</Text>
        <Text style={styles.stepDescription}>Review the loan application details</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Loan Summary</Text>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Principal Amount</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(parseFloat(formData.amount) || 0)}
            </Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Loan Term</Text>
            <Text style={styles.summaryValue}>{formData.termMonths} months</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Interest Rate</Text>
            <Text style={styles.summaryValue}>24% p.a.</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Est. Monthly Payment</Text>
            <Text style={styles.summaryValueHighlight}>
              {formatCurrency(monthlyPayment)}
            </Text>
          </View>
          
          <View style={[styles.summaryRow, styles.summaryRowTotal]}>
            <Text style={styles.summaryLabelTotal}>Total Repayment</Text>
            <Text style={styles.summaryValueTotal}>
              {formatCurrency(totalPayment)}
            </Text>
          </View>
        </View>

        <View style={styles.reviewCard}>
          <Text style={styles.reviewSection}>Farmer Details</Text>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Name:</Text>
            <Text style={styles.reviewValue}>{formData.farmerName}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Phone:</Text>
            <Text style={styles.reviewValue}>{formData.farmerPhone}</Text>
          </View>
          {formData.cropType && (
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Primary Crop:</Text>
              <Text style={styles.reviewValue}>{formData.cropType}</Text>
            </View>
          )}
        </View>

        <View style={styles.reviewCard}>
          <Text style={styles.reviewSection}>Loan Details</Text>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Purpose:</Text>
            <Text style={styles.reviewValue}>{formData.purpose}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Repayment:</Text>
            <Text style={styles.reviewValue}>
              {REPAYMENT_FREQUENCIES.find(f => f.value === formData.repaymentFrequency)?.label}
            </Text>
          </View>
          {formData.purposeDetails && (
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Details:</Text>
              <Text style={styles.reviewValue}>{formData.purposeDetails}</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Additional Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.notes}
            onChangeText={(text) => updateField('notes', text)}
            placeholder="Any additional notes for the loan officer..."
            multiline
            numberOfLines={3}
          />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Loan Application</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.progressContainer}>
        {[1, 2, 3].map((s) => (
          <View
            key={s}
            style={[
              styles.progressStep,
              s <= step && styles.progressStepActive,
            ]}
          />
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>

      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity
            style={[styles.nextBtn, step === 1 && styles.nextBtnFull]}
            onPress={handleNext}
          >
            <Text style={styles.nextBtnText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Application</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    fontSize: 16,
    color: '#166534',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  headerRight: {
    width: 50,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#fff',
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
  },
  progressStepActive: {
    backgroundColor: '#166534',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  stepContainer: {
    paddingBottom: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  amountText: {
    marginTop: 4,
    fontSize: 12,
    color: '#166534',
    fontWeight: '500',
  },
  purposeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  purposeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  purposeChipActive: {
    borderColor: '#166534',
    backgroundColor: '#f0fdf4',
  },
  purposeChipText: {
    fontSize: 13,
    color: '#64748b',
  },
  purposeChipTextActive: {
    color: '#166534',
    fontWeight: '600',
  },
  termContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  termChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  termChipActive: {
    borderColor: '#166534',
    backgroundColor: '#f0fdf4',
  },
  termChipText: {
    fontSize: 14,
    color: '#64748b',
  },
  termChipTextActive: {
    color: '#166534',
    fontWeight: '600',
  },
  frequencyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  frequencyChipActive: {
    borderColor: '#166534',
    backgroundColor: '#f0fdf4',
  },
  frequencyChipText: {
    fontSize: 14,
    color: '#64748b',
  },
  frequencyChipTextActive: {
    color: '#166534',
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#166534',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  summaryRowTotal: {
    borderBottomWidth: 0,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  summaryLabelTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  summaryValueHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fbbf24',
  },
  summaryValueTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  reviewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reviewSection: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  reviewLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    flex: 1,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#166534',
    borderRadius: 8,
    alignItems: 'center',
  },
  nextBtnFull: {
    flex: 1,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#166534',
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
