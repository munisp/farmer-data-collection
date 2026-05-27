/**
 * AI Farming Advisor Chat Screen
 * Farmer.Chat-style agricultural advisory with RAG pipeline.
 * Supports 14 languages, crop diagnosis, soil interpretation, pest management.
 */

import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  queryType?: string;
  confidence?: number;
  suggestions?: string[];
};

const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'sw', name: 'Kiswahili' },
  { code: 'ha', name: 'Hausa' }, { code: 'yo', name: 'Yoruba' },
  { code: 'am', name: 'Amharic' }, { code: 'fr', name: 'Français' },
  { code: 'hi', name: 'Hindi' }, { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' }, { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Tiếng Việt' }, { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' }, { code: 'tl', name: 'Tagalog' },
];

const QUICK_ACTIONS = [
  { label: 'Diagnose Crop', query: 'My maize leaves have yellow stripes and are curling. What disease is this?' },
  { label: 'Soil Advice', query: 'My soil pH is 5.2 and I want to grow tomatoes. What should I do?' },
  { label: 'Planting Guide', query: 'When is the best time to plant beans in East Africa?' },
  { label: 'Pest Control', query: 'I see small green insects on my bean plants. How do I control them?' },
  { label: 'Market Price', query: 'What is the current market price for maize in Kenya?' },
  { label: 'Weather', query: 'Should I spray my crops today given the current weather?' },
];

export default function AIChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1', role: 'assistant',
      content: 'Hello! I\'m your AI farming advisor. I can help with:\n\n• Crop disease diagnosis\n• Soil management advice\n• Planting guides & schedules\n• Pest & disease control\n• Market prices & trends\n• Weather-based recommendations\n\nAsk me anything about your farm!',
      queryType: 'general', confidence: 1.0,
      suggestions: ['What\'s wrong with my maize?', 'Interpret my soil test', 'When to plant beans?'],
    },
  ]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('en');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = (text?: string) => {
    const msg = text || input.trim();
    if (!msg) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');

    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Processing through RAG pipeline (crop knowledge base + disease database + soil science)...\n\nIn production, this connects to the Agri-LLM service on port 8103 with Ollama backend.',
        queryType: 'general',
        confidence: 0.85,
        suggestions: ['Tell me more', 'What about organic options?', 'Cost estimate?'],
      };
      setMessages([...updated, aiResponse]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, 300);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>AI Advisor</Text>
        <TouchableOpacity onPress={() => setShowLangPicker(!showLangPicker)}>
          <Text style={styles.langButton}>{LANGUAGES.find(l => l.code === language)?.name || 'English'}</Text>
        </TouchableOpacity>
      </View>

      {showLangPicker && (
        <ScrollView horizontal style={styles.langPicker}>
          {LANGUAGES.map(l => (
            <TouchableOpacity key={l.code} style={[styles.langChip, language === l.code && styles.langChipActive]} onPress={() => { setLanguage(l.code); setShowLangPicker(false); }}>
              <Text style={[styles.langChipText, language === l.code && styles.langChipTextActive]}>{l.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Quick actions */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickActions}>
        {QUICK_ACTIONS.map((action, i) => (
          <TouchableOpacity key={i} style={styles.quickChip} onPress={() => sendMessage(action.query)}>
            <Text style={styles.quickChipText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Messages */}
      <ScrollView ref={scrollRef} style={styles.messages}>
        {messages.map(msg => (
          <View key={msg.id} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
            <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userText : styles.aiText]}>{msg.content}</Text>
            {msg.confidence !== undefined && msg.role === 'assistant' && (
              <Text style={styles.meta}>Confidence: {(msg.confidence * 100).toFixed(0)}% | {msg.queryType}</Text>
            )}
            {msg.suggestions && msg.suggestions.length > 0 && (
              <View style={styles.suggestionsRow}>
                {msg.suggestions.map((s, j) => (
                  <TouchableOpacity key={j} style={styles.suggestionChip} onPress={() => sendMessage(s)}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about crops, soil, pests..."
          onSubmitEditing={() => sendMessage()}
        />
        <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage()}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 20, fontWeight: 'bold' },
  langButton: { color: '#4caf50', fontWeight: '600' },
  langPicker: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12 },
  langChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#e0e0e0', marginRight: 8 },
  langChipActive: { backgroundColor: '#4caf50' },
  langChipText: { fontSize: 12, color: '#333' },
  langChipTextActive: { color: '#fff' },
  quickActions: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#e8f5e9', marginRight: 8 },
  quickChipText: { fontSize: 12, color: '#2e7d32' },
  messages: { flex: 1, padding: 12 },
  bubble: { maxWidth: '80%', borderRadius: 12, padding: 12, marginBottom: 8 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#4caf50' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#fff' },
  bubbleText: { fontSize: 14 },
  userText: { color: '#fff' },
  aiText: { color: '#333' },
  meta: { fontSize: 10, color: '#999', marginTop: 4 },
  suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  suggestionChip: { backgroundColor: '#f0f0f0', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4, marginTop: 4 },
  suggestionText: { fontSize: 11, color: '#4caf50' },
  inputRow: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  input: { flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: 14 },
  sendButton: { marginLeft: 8, backgroundColor: '#4caf50', borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '600' },
});
