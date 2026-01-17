import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export default function Coach() {
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadUserAndChat();
  }, []);

  const loadUserAndChat = async () => {
    const id = await AsyncStorage.getItem('userId');
    setUserId(id);
    if (id) {
      fetchChatHistory(id);
    }
  };

  const fetchChatHistory = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/chat/${id}/history`);
      if (res.ok) {
        const history = await res.json();
        setMessages(history);
      }
    } catch (error) {
      console.error('Error fetching chat history:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !userId || sending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setSending(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          message: userMessage.content,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMessage: Message = {
          id: data.message_id || Date.now().toString() + '_assistant',
          role: 'assistant',
          content: data.response,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Show error message
        const errorMessage: Message = {
          id: Date.now().toString() + '_error',
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: Date.now().toString() + '_error',
        role: 'assistant',
        content: 'Unable to connect. Please check your connection and try again.',
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageContainer, isUser && styles.userMessageContainer]}>
        {!isUser && (
          <View style={styles.avatarContainer}>
            <Ionicons name="fitness" size={20} color="#6366f1" />
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const quickPrompts = [
    "How am I doing today?",
    "What should I focus on?",
    "Give me motivation",
    "Help me plan tomorrow",
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.coachAvatar}>
              <Ionicons name="fitness" size={24} color="#6366f1" />
            </View>
            <View>
              <Text style={styles.headerTitle}>AI Coach</Text>
              <Text style={styles.headerSubtitle}>Your personal life assistant</Text>
            </View>
          </View>
        </View>

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.welcomeCard}>
              <Ionicons name="chatbubbles" size={48} color="#6366f1" />
              <Text style={styles.welcomeTitle}>Start a Conversation</Text>
              <Text style={styles.welcomeText}>
                Your AI coach is here to help you stay on track, provide guidance,
                and keep you accountable for your goals.
              </Text>
            </View>

            <Text style={styles.quickPromptsTitle}>Quick Prompts</Text>
            <View style={styles.quickPromptsContainer}>
              {quickPrompts.map((prompt, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickPrompt}
                  onPress={() => setInputText(prompt)}
                >
                  <Text style={styles.quickPromptText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Typing Indicator */}
        {sending && (
          <View style={styles.typingContainer}>
            <View style={styles.avatarContainer}>
              <Ionicons name="fitness" size={20} color="#6366f1" />
            </View>
            <View style={styles.typingBubble}>
              <View style={styles.typingDots}>
                <View style={[styles.dot, styles.dot1]} />
                <View style={[styles.dot, styles.dot2]} />
                <View style={[styles.dot, styles.dot3]} />
              </View>
            </View>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask your coach anything..."
            placeholderTextColor="#6b7280"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coachAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#6b7280',
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    padding: 20,
  },
  welcomeCard: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginTop: 20,
  },
  welcomeTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
  },
  welcomeText: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  quickPromptsTitle: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 32,
    marginBottom: 12,
  },
  quickPromptsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickPrompt: {
    backgroundColor: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  quickPromptText: {
    color: '#e5e7eb',
    fontSize: 14,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#1f2937',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: '#e5e7eb',
    fontSize: 15,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  typingBubble: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 12,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6b7280',
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.6,
  },
  dot3: {
    opacity: 0.8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    maxHeight: 120,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#374151',
  },
});
