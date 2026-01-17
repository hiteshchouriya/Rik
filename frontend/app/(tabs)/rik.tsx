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
  KeyboardAvoidingView,
  Platform,
  Alert,
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
  type?: string;
}

interface RikStatus {
  greeting: string;
  name: string;
  schedule_completed: number;
  schedule_total: number;
  habits_done: number;
  habits_total: number;
  points: number;
  streak: number;
  routine_learned: boolean;
}

export default function RikScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRikActive, setIsRikActive] = useState(false);
  const [rikStatus, setRikStatus] = useState<RikStatus | null>(null);
  const [currentMode, setCurrentMode] = useState<'general' | 'learning_routine' | 'planning_day'>('general');
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    loadUser();
    requestAudioPermission();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  useEffect(() => {
    if (userId) {
      fetchRikStatus();
    }
  }, [userId]);

  useEffect(() => {
    if (isRikActive) {
      startPulseAnimation();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRikActive]);

  const requestAudioPermission = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    } catch (err) {
      console.log('Audio permission error:', err);
    }
  };

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
      console.error('Error:', e);
    }
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  };

  const resetInactivityTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      if (isRikActive) {
        speak("Going to sleep. Say my name when you need me.");
        setTimeout(() => setIsRikActive(false), 2000);
      }
    }, 60000);
  };

  const activateRik = async () => {
    setIsRikActive(true);
    resetInactivityTimer();
    
    // Check if routine is learned
    if (rikStatus && !rikStatus.routine_learned) {
      const greeting = `Hey ${userName}! Before I can help you properly, I need to learn your actual daily routine. Want me to ask you a few questions? Just say yes or type 'learn my routine'.`;
      speak(greeting);
      addMessage('assistant', greeting);
    } else {
      const greeting = `${rikStatus?.greeting || 'Hey'} ${userName}! You've done ${rikStatus?.schedule_completed || 0} of ${rikStatus?.schedule_total || 0} tasks. What do you need?`;
      speak(greeting);
      addMessage('assistant', greeting);
    }
  };

  const speak = async (text: string) => {
    // Stop any ongoing speech first
    await Speech.stop();
    
    // Get available voices and try to use a better one
    const voices = await Speech.getAvailableVoicesAsync();
    
    // Try to find a good male voice (Rik should sound confident)
    // On iOS: "com.apple.ttsbundle.Daniel-compact" or "com.apple.voice.compact.en-GB.Daniel"
    // On Android: varies by device
    let selectedVoice = voices.find(v => 
      v.name?.toLowerCase().includes('daniel') || 
      v.name?.toLowerCase().includes('james') ||
      v.name?.toLowerCase().includes('tom') ||
      v.identifier?.includes('Daniel')
    )?.identifier;
    
    // Fallback to any English male-sounding voice
    if (!selectedVoice) {
      selectedVoice = voices.find(v => 
        v.language?.startsWith('en') && 
        (v.name?.toLowerCase().includes('male') || v.quality === 'Enhanced')
      )?.identifier;
    }
    
    Speech.speak(text, {
      language: 'en-GB', // British English often sounds cleaner
      pitch: 0.95, // Slightly lower pitch for authority
      rate: 1.0, // Natural speed - not too slow
      voice: selectedVoice,
      onDone: () => resetInactivityTimer(),
      onError: (error) => console.log('Speech error:', error),
    });
  };

  const stopSpeaking = () => {
    Speech.stop();
  };

  const addMessage = (role: 'user' | 'assistant', content: string, type?: string) => {
    const newMsg: Message = { id: Date.now().toString(), role, content, type };
    setMessages(prev => [...prev, newMsg]);
    setTimeout(() => scrollViewRef.current?.scrollToEnd(), 100);
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
    } catch (err) {
      console.error('Recording error:', err);
      setIsRecording(false);
      Alert.alert('Error', 'Could not start recording. Please type instead.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    
    // For now, prompt user to type - voice-to-text requires additional API
    Alert.alert(
      'Voice Input',
      'Voice recognition requires external API. Please type your message for now.',
      [{ text: 'OK' }]
    );
  };

  const sendMessage = async (text: string, context?: string) => {
    if (!userId || !text.trim()) return;
    
    const message = text.trim().toLowerCase();
    resetInactivityTimer();
    
    // Check for special commands
    if (message.includes('over') && message.includes('out')) {
      speak('Going to sleep. Call me when you need me.');
      addMessage('user', text);
      addMessage('assistant', 'Going to sleep. Call me when you need me.');
      setTimeout(() => setIsRikActive(false), 2000);
      return;
    }
    
    // Determine context
    let chatContext = context || currentMode;
    if (message.includes('learn') && message.includes('routine')) {
      chatContext = 'learning_routine';
      setCurrentMode('learning_routine');
    } else if (message.includes('plan') && (message.includes('day') || message.includes('today'))) {
      chatContext = 'planning_day';
      setCurrentMode('planning_day');
    } else if (message.includes('generate') && message.includes('schedule')) {
      // Generate schedule
      generateSchedule();
      return;
    }
    
    addMessage('user', text);
    setInputText('');
    setIsProcessing(true);
    
    try {
      const res = await fetch(`${API_URL}/api/rik/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          message: text,
          context: chatContext,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        addMessage('assistant', data.response, data.response_type);
        speak(data.response);
        
        // Handle special actions
        if (data.action_required === 'generate_schedule') {
          // Show generate button
        } else if (data.response_type === 'suggest_learning') {
          setCurrentMode('learning_routine');
        }
        
        // Refresh status
        fetchRikStatus();
      }
    } catch (e) {
      console.error('Error:', e);
      const errorMsg = "Couldn't process that. Try again?";
      addMessage('assistant', errorMsg);
      speak(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateSchedule = async () => {
    if (!userId) return;
    
    addMessage('user', 'Generate my schedule');
    setIsProcessing(true);
    speak("Creating your schedule based on what I know about you. One moment.");
    
    try {
      const res = await fetch(`${API_URL}/api/rik/generate-smart-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, date: today }),
      });
      
      if (res.ok) {
        const data = await res.json();
        const msg = `Done! I've created ${data.count} tasks for today based on your routine. Check the Schedule tab to see your day.`;
        addMessage('assistant', msg);
        speak(msg);
        fetchRikStatus();
        setCurrentMode('general');
      }
    } catch (e) {
      console.error('Error:', e);
      addMessage('assistant', "Couldn't generate schedule. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const learnRoutine = async () => {
    if (!userId) return;
    
    setIsProcessing(true);
    
    try {
      const res = await fetch(`${API_URL}/api/rik/learn-routine?user_id=${userId}`, {
        method: 'POST',
      });
      
      if (res.ok) {
        const data = await res.json();
        addMessage('assistant', `Got it! I've saved your routine. Here's what I understood:\n\n${data.routine}\n\nNow I can create better schedules for you!`);
        speak("Perfect! I've learned your routine. Now I can help you better.");
        fetchRikStatus();
        setCurrentMode('general');
      }
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const getMorningBriefing = async () => {
    if (!userId) return;
    
    setIsProcessing(true);
    
    try {
      const res = await fetch(`${API_URL}/api/rik/morning-briefing/${userId}`);
      if (res.ok) {
        const data = await res.json();
        addMessage('assistant', data.briefing);
        speak(data.briefing);
      }
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const quickActions = [
    { text: "Learn my routine", icon: "school", action: () => sendMessage("Learn my routine", 'learning_routine') },
    { text: "Plan my day", icon: "calendar", action: () => sendMessage("Help me plan my day", 'planning_day') },
    { text: "Morning briefing", icon: "sunny", action: getMorningBriefing },
    { text: "Generate schedule", icon: "flash", action: generateSchedule },
  ];

  const quickResponses = [
    "What should I do now?",
    "I'm feeling unmotivated",
    "Check my progress",
    "Over & Out",
  ];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{rikStatus?.greeting || 'Hello'}, {userName}</Text>
            <Text style={styles.statusText}>
              {rikStatus?.points || 0} pts | {rikStatus?.streak || 0} day streak
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.time}>{format(new Date(), 'HH:mm')}</Text>
            {!rikStatus?.routine_learned && (
              <View style={styles.warningBadge}>
                <Ionicons name="warning" size={12} color="#f59e0b" />
              </View>
            )}
          </View>
        </View>

        {/* Status Cards */}
        {!isRikActive && (
          <View style={styles.statusCards}>
            <View style={styles.statusCard}>
              <Text style={styles.statusValue}>{rikStatus?.schedule_completed || 0}/{rikStatus?.schedule_total || 0}</Text>
              <Text style={styles.statusLabel}>Tasks</Text>
            </View>
            <View style={styles.statusCard}>
              <Text style={styles.statusValue}>{rikStatus?.habits_done || 0}/{rikStatus?.habits_total || 0}</Text>
              <Text style={styles.statusLabel}>Habits</Text>
            </View>
            <View style={[styles.statusCard, !rikStatus?.routine_learned && styles.statusCardWarning]}>
              <Ionicons name={rikStatus?.routine_learned ? "checkmark-circle" : "alert-circle"} size={24} color={rikStatus?.routine_learned ? "#10b981" : "#f59e0b"} />
              <Text style={styles.statusLabel}>{rikStatus?.routine_learned ? "Routine Set" : "Setup Needed"}</Text>
            </View>
          </View>
        )}

        {/* Rik Avatar */}
        {!isRikActive ? (
          <View style={styles.rikSection}>
            <TouchableOpacity onPress={activateRik} activeOpacity={0.8}>
              <View style={styles.rikAvatar}>
                <Ionicons name="mic-outline" size={48} color="#6366f1" />
              </View>
            </TouchableOpacity>
            <Text style={styles.rikLabel}>Tap to talk to Rik</Text>
            <Text style={styles.rikHint}>Voice will sound better on your phone</Text>
            
            {/* Quick Actions */}
            <View style={styles.quickActions}>
              {quickActions.map((action, i) => (
                <TouchableOpacity 
                  key={i} 
                  style={styles.quickAction}
                  onPress={() => { activateRik(); setTimeout(action.action, 500); }}
                >
                  <Ionicons name={action.icon as any} size={20} color="#6366f1" />
                  <Text style={styles.quickActionText}>{action.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          /* Active Conversation */
          <>
            {/* Mode Indicator */}
            {currentMode !== 'general' && (
              <View style={styles.modeIndicator}>
                <Ionicons 
                  name={currentMode === 'learning_routine' ? 'school' : 'calendar'} 
                  size={16} 
                  color="#6366f1" 
                />
                <Text style={styles.modeText}>
                  {currentMode === 'learning_routine' ? 'Learning Your Routine' : 'Planning Your Day'}
                </Text>
                {currentMode === 'learning_routine' && (
                  <TouchableOpacity style={styles.saveModeBtn} onPress={learnRoutine}>
                    <Text style={styles.saveModeBtnText}>Save Routine</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Messages */}
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

            {/* Quick Responses */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.quickResponsesContainer}
              contentContainerStyle={styles.quickResponsesContent}
            >
              {quickResponses.map((text, i) => (
                <TouchableOpacity 
                  key={i} 
                  style={styles.quickResponse}
                  onPress={() => sendMessage(text)}
                >
                  <Text style={styles.quickResponseText}>{text}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Input */}
            <View style={styles.inputContainer}>
              <TouchableOpacity 
                style={[styles.micButton, isRecording && styles.micButtonRecording]}
                onPressIn={startRecording}
                onPressOut={stopRecording}
              >
                <Ionicons name={isRecording ? "radio" : "mic"} size={20} color="#fff" />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Type your message..."
                placeholderTextColor="#6b7280"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={() => sendMessage(inputText)}
                returnKeyType="send"
              />
              <TouchableOpacity 
                style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
                onPress={() => sendMessage(inputText)}
                disabled={!inputText.trim() || isProcessing}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  keyboardView: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingBottom: 10,
  },
  greeting: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  statusText: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  headerRight: { alignItems: 'flex-end' },
  time: { color: '#6366f1', fontSize: 24, fontWeight: 'bold' },
  warningBadge: {
    backgroundColor: '#f59e0b20', padding: 4, borderRadius: 8, marginTop: 4,
  },
  statusCards: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 16 },
  statusCard: {
    flex: 1, backgroundColor: '#1f2937', borderRadius: 12, padding: 12, alignItems: 'center',
  },
  statusCardWarning: { borderWidth: 1, borderColor: '#f59e0b' },
  statusValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  statusLabel: { color: '#6b7280', fontSize: 11, marginTop: 4 },
  rikSection: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  rikAvatar: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#6366f1',
  },
  rikLabel: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 20 },
  rikHint: { color: '#6b7280', fontSize: 13, marginTop: 6, textAlign: 'center' },
  quickActions: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 10, marginTop: 32, paddingHorizontal: 10,
  },
  quickAction: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1f2937', paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#374151',
  },
  quickActionText: { color: '#e5e7eb', fontSize: 14 },
  modeIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#6366f120', marginHorizontal: 20, marginBottom: 8,
    padding: 10, borderRadius: 8,
  },
  modeText: { color: '#6366f1', fontSize: 13, flex: 1 },
  saveModeBtn: { backgroundColor: '#6366f1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  saveModeBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  messagesContainer: { flex: 1, paddingHorizontal: 20 },
  messagesContent: { paddingBottom: 8 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  userBubble: { backgroundColor: '#6366f1', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  rikBubble: { backgroundColor: '#1f2937', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  messageText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  quickResponsesContainer: { maxHeight: 50 },
  quickResponsesContent: { paddingHorizontal: 20, gap: 8 },
  quickResponse: {
    backgroundColor: '#1f2937', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 16, borderWidth: 1, borderColor: '#374151', marginRight: 8,
  },
  quickResponseText: { color: '#e5e7eb', fontSize: 13 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: '#1f2937',
  },
  micButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  micButtonRecording: { backgroundColor: '#ef4444' },
  input: {
    flex: 1, backgroundColor: '#1f2937', borderRadius: 22,
    paddingHorizontal: 18, paddingVertical: 10, color: '#fff', fontSize: 15,
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#374151' },
});
