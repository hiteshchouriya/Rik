import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { format } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function RikScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRikActive, setIsRikActive] = useState(false);
  const [rikStatus, setRikStatus] = useState<any>(null);
  const [nextTask, setNextTask] = useState<any>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    loadUser();
    startPulseAnimation();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  useEffect(() => {
    if (userId) {
      fetchRikStatus();
      fetchNextTask();
    }
  }, [userId]);

  const loadUser = async () => {
    const id = await AsyncStorage.getItem('userId');
    const name = await AsyncStorage.getItem('userName');
    setUserId(id);
    setUserName(name || 'User');
  };

  const fetchRikStatus = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_URL}/api/rik/status/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setRikStatus(data);
      }
    } catch (e) {
      console.error('Error fetching status:', e);
    }
  };

  const fetchNextTask = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_URL}/api/rik/next-task/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setNextTask(data);
      }
    } catch (e) {
      console.error('Error fetching next task:', e);
    }
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  };

  const resetInactivityTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      if (isRikActive) {
        deactivateRik();
      }
    }, 60000); // 1 minute timeout
  };

  const activateRik = async () => {
    setIsRikActive(true);
    resetInactivityTimer();
    
    // Rik greets
    const greeting = rikStatus 
      ? `${rikStatus.greeting} ${rikStatus.name}. You've completed ${rikStatus.schedule_completed} of ${rikStatus.schedule_total} tasks. What do you need?`
      : "I'm here. What do you need?";
    
    speak(greeting);
    addMessage('assistant', greeting);
  };

  const deactivateRik = () => {
    setIsRikActive(false);
    Speech.stop();
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
  };

  const speak = (text: string) => {
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.9,
      onDone: () => {
        resetInactivityTimer();
      },
    });
  };

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    const newMsg: Message = {
      id: Date.now().toString(),
      role,
      content,
    };
    setMessages(prev => [...prev, newMsg]);
    setTimeout(() => scrollViewRef.current?.scrollToEnd(), 100);
  };

  const sendCommand = async (command: string) => {
    if (!userId || !command.trim()) return;
    
    // Check for deactivation words
    const lowerCommand = command.toLowerCase();
    if (lowerCommand.includes('over') && lowerCommand.includes('out')) {
      speak('Going to sleep. Call my name when you need me.');
      addMessage('assistant', 'Going to sleep. Call my name when you need me.');
      setTimeout(deactivateRik, 2000);
      return;
    }
    
    resetInactivityTimer();
    addMessage('user', command);
    setIsProcessing(true);
    
    try {
      const res = await fetch(`${API_URL}/api/rik/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, command }),
      });
      
      if (res.ok) {
        const data = await res.json();
        addMessage('assistant', data.response);
        speak(data.response);
        fetchNextTask(); // Refresh next task
      }
    } catch (e) {
      console.error('Error:', e);
      const errorMsg = "Sorry, couldn't process that. Try again.";
      addMessage('assistant', errorMsg);
      speak(errorMsg);
    } finally {
      setIsProcessing(false);
      setInputText('');
    }
  };

  const generateSchedule = async () => {
    if (!userId) return;
    setIsProcessing(true);
    
    speak("Alright, let me plan your day. Give me a moment.");
    
    try {
      const res = await fetch(`${API_URL}/api/schedule/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, date: today }),
      });
      
      if (res.ok) {
        const data = await res.json();
        const msg = `Your schedule is ready. ${data.schedule?.length || 0} tasks planned. Check your Schedule tab.`;
        addMessage('assistant', msg);
        speak(msg);
        fetchNextTask();
      }
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const quickCommands = [
    { text: "What's next?", icon: "arrow-forward" },
    { text: "How am I doing?", icon: "stats-chart" },
    { text: "Motivate me", icon: "flame" },
    { text: "Over & Out", icon: "moon" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with status */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {rikStatus?.greeting || 'Hello'}, {userName}
          </Text>
          <Text style={styles.statusText}>
            {rikStatus ? `${rikStatus.schedule_completed}/${rikStatus.schedule_total} tasks | ${rikStatus.habits_done}/${rikStatus.habits_total} habits` : 'Loading...'}
          </Text>
        </View>
        <Text style={styles.time}>{format(new Date(), 'HH:mm')}</Text>
      </View>

      {/* Next Task Card */}
      {nextTask?.has_task && (
        <View style={styles.nextTaskCard}>
          <Ionicons name="time" size={20} color="#f59e0b" />
          <View style={styles.nextTaskContent}>
            <Text style={styles.nextTaskLabel}>Coming Up</Text>
            <Text style={styles.nextTaskTitle}>{nextTask.task.time} - {nextTask.task.title}</Text>
          </View>
        </View>
      )}

      {/* Rik Avatar & Activation */}
      <View style={styles.rikSection}>
        <TouchableOpacity 
          onPress={isRikActive ? () => {} : activateRik}
          activeOpacity={0.8}
        >
          <Animated.View style={[
            styles.rikAvatar,
            isRikActive && styles.rikAvatarActive,
            { transform: [{ scale: isRikActive ? pulseAnim : 1 }] }
          ]}>
            <Ionicons 
              name={isRikActive ? "mic" : "mic-outline"} 
              size={48} 
              color={isRikActive ? "#fff" : "#6366f1"} 
            />
          </Animated.View>
        </TouchableOpacity>
        <Text style={styles.rikLabel}>
          {isRikActive ? "Rik is listening..." : "Tap to activate Rik"}
        </Text>
        {!isRikActive && (
          <Text style={styles.rikHint}>Or say "Rik" to wake me up</Text>
        )}
      </View>

      {/* Messages */}
      {isRikActive && (
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => (
            <View 
              key={msg.id} 
              style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.rikBubble]}
            >
              <Text style={styles.messageText}>{msg.content}</Text>
            </View>
          ))}
          {isProcessing && (
            <View style={styles.rikBubble}>
              <ActivityIndicator size="small" color="#6366f1" />
            </View>
          )}
        </ScrollView>
      )}

      {/* Quick Commands */}
      {isRikActive && (
        <View style={styles.quickCommands}>
          {quickCommands.map((cmd, i) => (
            <TouchableOpacity 
              key={i} 
              style={styles.quickCmd}
              onPress={() => sendCommand(cmd.text)}
            >
              <Ionicons name={cmd.icon as any} size={16} color="#6366f1" />
              <Text style={styles.quickCmdText}>{cmd.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input Area */}
      {isRikActive && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type or speak to Rik..."
            placeholderTextColor="#6b7280"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => sendCommand(inputText)}
          />
          <TouchableOpacity 
            style={styles.sendButton}
            onPress={() => sendCommand(inputText)}
            disabled={isProcessing}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Generate Schedule Button (when not active) */}
      {!isRikActive && (
        <TouchableOpacity style={styles.generateButton} onPress={generateSchedule}>
          <Ionicons name="calendar" size={24} color="#fff" />
          <Text style={styles.generateButtonText}>Generate Today's Schedule</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingBottom: 10,
  },
  greeting: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  statusText: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  time: { color: '#6366f1', fontSize: 24, fontWeight: 'bold' },
  nextTaskCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1f2937', marginHorizontal: 20, marginBottom: 16,
    padding: 16, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#f59e0b',
  },
  nextTaskContent: { flex: 1 },
  nextTaskLabel: { color: '#f59e0b', fontSize: 12, fontWeight: '600' },
  nextTaskTitle: { color: '#fff', fontSize: 16, marginTop: 2 },
  rikSection: { alignItems: 'center', paddingVertical: 32 },
  rikAvatar: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#6366f1',
  },
  rikAvatarActive: { backgroundColor: '#6366f1', borderColor: '#818cf8' },
  rikLabel: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 16 },
  rikHint: { color: '#6b7280', fontSize: 14, marginTop: 4 },
  messagesContainer: { flex: 1, paddingHorizontal: 20 },
  messagesContent: { paddingBottom: 16 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  userBubble: { backgroundColor: '#6366f1', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  rikBubble: { backgroundColor: '#1f2937', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  messageText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  quickCommands: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  quickCmd: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1f2937', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#374151',
  },
  quickCmdText: { color: '#e5e7eb', fontSize: 13 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderTopWidth: 1, borderTopColor: '#1f2937',
  },
  input: {
    flex: 1, backgroundColor: '#1f2937', borderRadius: 24,
    paddingHorizontal: 20, paddingVertical: 12, color: '#fff', fontSize: 16,
  },
  sendButton: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center',
  },
  generateButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#6366f1', marginHorizontal: 20, marginBottom: 20,
    padding: 18, borderRadius: 16,
  },
  generateButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
