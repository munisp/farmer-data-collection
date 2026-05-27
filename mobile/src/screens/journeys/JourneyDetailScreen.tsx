import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type JourneyStatus = 'not_started' | 'in_progress' | 'completed' | 'failed' | 'blocked';
type JourneyChannel = 'USSD' | 'SMS' | 'WhatsApp' | 'PWA' | 'Mobile' | 'Voice';
type JourneyCategory = 'onboarding' | 'farming' | 'financial' | 'marketplace' | 'analytics' | 'compliance' | 'sustainability';

interface JourneyStep {
  id: string;
  title: string;
  description?: string;
  status: JourneyStatus;
  startedAt?: string;
  completedAt?: string;
}

interface JourneySummary {
  id: string;
  title: string;
  description: string;
  category: JourneyCategory;
  channels: JourneyChannel[];
  status: JourneyStatus;
  progress: number;
  lastUpdate: string;
  steps: JourneyStep[];
  icon: string;
  color: string;
}

const CATEGORY_CONFIG: Record<JourneyCategory, { label: string; color: string }> = {
  onboarding: { label: 'Onboarding', color: '#3B82F6' },
  farming: { label: 'Farming', color: '#10B981' },
  financial: { label: 'Financial', color: '#F59E0B' },
  marketplace: { label: 'Marketplace', color: '#8B5CF6' },
  analytics: { label: 'Analytics', color: '#06B6D4' },
  compliance: { label: 'Compliance', color: '#64748B' },
  sustainability: { label: 'Sustainability', color: '#22C55E' },
};

export default function JourneyDetailScreen({ route, navigation }: any) {
  const { journey } = route.params as { journey: JourneySummary };

  const getStatusColor = (status: JourneyStatus) => {
    switch (status) {
      case 'completed': return '#22C55E';
      case 'in_progress': return '#F59E0B';
      case 'failed': return '#EF4444';
      case 'blocked': return '#EF4444';
      default: return '#9CA3AF';
    }
  };

  const getStatusLabel = (status: JourneyStatus) => {
    return status.replace('_', ' ').toUpperCase();
  };

  const getStepIcon = (status: JourneyStatus) => {
    switch (status) {
      case 'completed': return 'checkmark-circle';
      case 'in_progress': return 'time';
      case 'failed': return 'close-circle';
      case 'blocked': return 'alert-circle';
      default: return 'ellipse-outline';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const completedSteps = journey.steps.filter(s => s.status === 'completed').length;
  const currentStepIndex = journey.steps.findIndex(s => s.status === 'in_progress');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Journey Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: `${journey.color}10` }]}>
          <View style={[styles.iconContainer, { backgroundColor: `${journey.color}20` }]}>
            <Ionicons name={journey.icon as any} size={32} color={journey.color} />
          </View>
          <Text style={styles.journeyTitle}>{journey.title}</Text>
          <Text style={styles.journeyDescription}>{journey.description}</Text>
          
          <View style={styles.metaRow}>
            <View style={[styles.categoryBadge, { backgroundColor: `${CATEGORY_CONFIG[journey.category].color}20` }]}>
              <Text style={[styles.categoryText, { color: CATEGORY_CONFIG[journey.category].color }]}>
                {CATEGORY_CONFIG[journey.category].label}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(journey.status)}20` }]}>
              <Text style={[styles.statusText, { color: getStatusColor(journey.status) }]}>
                {getStatusLabel(journey.status)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.sectionTitle}>Overall Progress</Text>
            <Text style={[styles.progressPercent, { color: journey.color }]}>{journey.progress}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${journey.progress}%`, backgroundColor: journey.color }
              ]} 
            />
          </View>
          <Text style={styles.progressSubtext}>
            {completedSteps} of {journey.steps.length} steps completed
          </Text>
        </View>

        <View style={styles.channelsSection}>
          <Text style={styles.sectionTitle}>Available Channels</Text>
          <View style={styles.channelRow}>
            {journey.channels.map((channel, idx) => (
              <View key={idx} style={styles.channelBadge}>
                <Ionicons 
                  name={
                    channel === 'USSD' ? 'call' :
                    channel === 'SMS' ? 'chatbubble' :
                    channel === 'WhatsApp' ? 'logo-whatsapp' :
                    channel === 'PWA' ? 'globe' :
                    channel === 'Mobile' ? 'phone-portrait' :
                    'mic'
                  } 
                  size={14} 
                  color="#6B7280" 
                />
                <Text style={styles.channelText}>{channel}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.stepsSection}>
          <Text style={styles.sectionTitle}>Journey Steps</Text>
          
          {journey.steps.map((step, index) => {
            const isLast = index === journey.steps.length - 1;
            const isCurrent = step.status === 'in_progress';
            
            return (
              <View key={step.id} style={styles.stepContainer}>
                <View style={styles.stepTimeline}>
                  <View 
                    style={[
                      styles.stepDot,
                      { backgroundColor: getStatusColor(step.status) }
                    ]}
                  >
                    <Ionicons 
                      name={getStepIcon(step.status) as any} 
                      size={16} 
                      color="#fff" 
                    />
                  </View>
                  {!isLast && (
                    <View 
                      style={[
                        styles.stepLine,
                        { backgroundColor: step.status === 'completed' ? '#22C55E' : '#E5E7EB' }
                      ]} 
                    />
                  )}
                </View>
                
                <View style={[
                  styles.stepContent,
                  isCurrent && styles.stepContentCurrent
                ]}>
                  <View style={styles.stepHeader}>
                    <Text style={styles.stepNumber}>Step {index + 1}</Text>
                    {isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>CURRENT</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  {step.description && (
                    <Text style={styles.stepDescription}>{step.description}</Text>
                  )}
                  
                  {step.completedAt && (
                    <View style={styles.stepMeta}>
                      <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                      <Text style={styles.stepMetaText}>
                        Completed {formatDate(step.completedAt)}
                      </Text>
                    </View>
                  )}
                  
                  {step.status === 'in_progress' && (
                    <TouchableOpacity 
                      style={[styles.actionButton, { backgroundColor: journey.color }]}
                    >
                      <Text style={styles.actionButtonText}>Continue Step</Text>
                      <Ionicons name="arrow-forward" size={16} color="#fff" />
                    </TouchableOpacity>
                  )}
                  
                  {step.status === 'not_started' && index === currentStepIndex + 1 && (
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.actionButtonOutline, { borderColor: journey.color }]}
                    >
                      <Text style={[styles.actionButtonTextOutline, { color: journey.color }]}>
                        Start Step
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color={journey.color} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {journey.lastUpdate && (
          <View style={styles.lastUpdateSection}>
            <Ionicons name="time-outline" size={14} color="#9CA3AF" />
            <Text style={styles.lastUpdateText}>
              Last updated: {formatDate(journey.lastUpdate)}
            </Text>
          </View>
        )}

        <View style={styles.bottomActions}>
          <TouchableOpacity 
            style={[styles.primaryButton, { backgroundColor: journey.color }]}
          >
            <Text style={styles.primaryButtonText}>
              {journey.status === 'not_started' ? 'Start Journey' : 
               journey.status === 'completed' ? 'View Summary' : 'Continue Journey'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  heroCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  journeyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  journeyDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressSection: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  progressPercent: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressSubtext: {
    fontSize: 13,
    color: '#6B7280',
  },
  channelsSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  channelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    gap: 6,
  },
  channelText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  stepsSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  stepContainer: {
    flexDirection: 'row',
    marginTop: 16,
  },
  stepTimeline: {
    alignItems: 'center',
    width: 32,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  stepContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  stepContentCurrent: {
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepNumber: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  currentBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  stepMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  stepMetaText: {
    fontSize: 12,
    color: '#22C55E',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  actionButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  actionButtonTextOutline: {
    fontSize: 14,
    fontWeight: '600',
  },
  lastUpdateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  bottomActions: {
    marginHorizontal: 16,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
