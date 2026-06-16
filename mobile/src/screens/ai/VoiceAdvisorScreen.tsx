import { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useColorScheme, TextInput } from 'react-native';
import { colors, darkColors, spacing, fontSize, borderRadius, elevation } from '@/lib/theme';
import { Header } from '@/components/shared/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export default function VoiceAdvisorScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', text: 'Hello! I\'m your AI farming advisor. Ask me about crop prices, weather, planting schedules, or pest management.', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await apiClient.trpc.voice.processQuery.mutate({ text: input.trim(), language: 'en' });
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: (response as any).response || 'I couldn\'t process that request. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: 'Sorry, I\'m having trouble connecting. Please check your connection and try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading]);

  const quickQuestions = [
    'What\'s the current maize price?',
    'Best time to plant cassava?',
    'How to prevent fall armyworm?',
    'Weather forecast this week',
  ];

  const styles = getStyles(isDark);

  return (
    <View style={styles.container} accessibilityLabel="AI Voice Advisor screen">
      <Header title="AI Farming Advisor" />

      <ScrollView ref={scrollRef} style={styles.chatArea} contentContainerStyle={styles.chatContent}>
        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[styles.msgBubble, msg.role === 'user' ? styles.userBubble : styles.assistantBubble]}
            accessibilityLabel={`${msg.role} message: ${msg.text}`}
          >
            <Text style={[styles.msgText, msg.role === 'user' && styles.userMsgText]}>{msg.text}</Text>
            <Text style={styles.msgTime}>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        ))}
        {loading && (
          <View style={[styles.msgBubble, styles.assistantBubble]}>
            <Text style={styles.msgText}>Thinking...</Text>
          </View>
        )}
      </ScrollView>

      {messages.length <= 1 && (
        <View style={styles.quickRow}>
          {quickQuestions.map((q, i) => (
            <TouchableOpacity
              key={i}
              style={styles.quickBtn}
              onPress={() => { setInput(q); }}
              accessibilityLabel={`Quick question: ${q}`}
              accessibilityRole="button"
            >
              <Text style={styles.quickText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about farming..."
          placeholderTextColor={isDark ? darkColors.textMuted : colors.gray400}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          accessibilityLabel="Message input"
          accessibilityHint="Type your farming question here"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? darkColors.background : colors.background },
  chatArea: { flex: 1 },
  chatContent: { padding: spacing.md, paddingBottom: spacing.xl },
  msgBubble: { maxWidth: '80%', padding: spacing.sm, borderRadius: borderRadius.lg, marginBottom: spacing.sm },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: isDark ? darkColors.card : colors.gray100, borderBottomLeftRadius: 4 },
  msgText: { fontSize: fontSize.md, color: isDark ? darkColors.text : colors.gray900, lineHeight: 20 },
  userMsgText: { color: colors.white },
  msgTime: { fontSize: fontSize.xs, color: isDark ? darkColors.textMuted : colors.gray400, marginTop: 4, alignSelf: 'flex-end' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm, gap: spacing.xs },
  quickBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: isDark ? darkColors.backgroundSecondary : colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  quickText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '500' },
  inputRow: { flexDirection: 'row', padding: spacing.sm, borderTopWidth: 1, borderTopColor: isDark ? darkColors.border : colors.gray200, alignItems: 'center' },
  textInput: { flex: 1, height: 44, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, backgroundColor: isDark ? darkColors.backgroundSecondary : colors.gray100, fontSize: fontSize.md, color: isDark ? darkColors.text : colors.gray900 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginLeft: spacing.xs },
  sendBtnDisabled: { backgroundColor: isDark ? darkColors.backgroundSecondary : colors.gray300 },
  sendText: { fontSize: 20, color: colors.white },
});
