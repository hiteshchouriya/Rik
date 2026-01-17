import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { format } from 'date-fns';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';

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
  
  // Voice recognition states
  const [isListening, setIsListening] = useState(false);
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [listeningStatus, setListeningStatus] = useState('Tap mic or say "Rik"');
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const wakeWordPulse = useRef(new Animated.Value(1)).current;
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const appState = useRef(AppState.currentState);

  const today = format(new Date(), 'yyyy-MM-dd');

  // Initialize Voice Recognition
  useEffect(() => {
    const initVoice = async () => {
      try {
        const isAvailable = await Voice.isAvailable();
        setVoiceSupported(!!isAvailable);
        
        if (isAvailable) {
          Voice.onSpeechStart = onSpeechStart;
          Voice.onSpeechEnd = onSpeechEnd;
          Voice.onSpeechResults = onSpeechResults;
          Voice.onSpeechPartialResults = onSpeechPartialResults;
          Voice.onSpeechError = onSpeechError;
          
          // Start wake word listening after a small delay
          setTimeout(() => startWakeWordListening(), 1000);
        }
      } catch (e) {
        console.log('Voice init error:', e);
      }
    };

    initVoice();
    loadUser();
    requestAudioPermission();

    // Handle app state changes
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground - restart wake word listening
        if (!isRikActive && voiceSupported) {
          startWakeWordListening();
        }
      } else if (nextAppState.match(/inactive|background/)) {
        // App going to background - stop listening
        stopListening();
      }
      appState.current = nextAppState;
    });

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      subscription.remove();
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
      stopWakeWordListening();
    } else {
      pulseAnim.setValue(1);
      // Restart wake word listening when Rik is deactivated
      if (voiceSupported && !isWakeWordListening) {
        setTimeout(() => startWakeWordListening(), 500);
      }
    }
  }, [isRikActive]);

  // Wake word pulse animation
  useEffect(() => {
    if (isWakeWordListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(wakeWordPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
          Animated.timing(wakeWordPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      wakeWordPulse.setValue(1);
    }
  }, [isWakeWordListening]);

  // Voice Recognition Handlers
  const onSpeechStart = () => {
    setIsListening(true);
  };

  const onSpeechEnd = () => {
    setIsListening(false);
  };

  const onSpeechResults = (e: SpeechResultsEvent) => {
    const text = e.value?.[0] || '';
    setRecognizedText(text);
    
    if (isRikActive) {
      // In active mode, send the recognized text as a command
      if (text.trim()) {
        setInputText(text);
        // Auto-send after recognition
        setTimeout(() => sendMessage(text), 500);
      }
    }
  };

  const onSpeechPartialResults = (e: SpeechResultsEvent) => {
    const text = e.value?.[0]?.toLowerCase() || '';
    
    // Check for wake word in partial results (for faster detection)
    if (!isRikActive && (text.includes('rik') || text.includes('rick') || text.includes('ricky'))) {
      console.log('Wake word detected:', text);
      stopListening();
      activateRik();
    }
  };

  const onSpeechError = (e: SpeechErrorEvent) => {
    console.log('Speech error:', e.error);
    setIsListening(false);
    
    // Restart wake word listening if we were in that mode and not active
    if (!isRikActive && voiceSupported) {
      setTimeout(() => startWakeWordListening(), 1000);
    }
  };

  const startWakeWordListening = async () => {
    if (!voiceSupported || isRikActive) return;
    
    try {
      setIsWakeWordListening(true);
      setListeningStatus('Listening for "Rik"...');
      await Voice.start('en-US');
    } catch (e) {
      console.log('Start listening error:', e);
      setIsWakeWordListening(false);
      setListeningStatus('Tap mic or say "Rik"');
    }
  };

  const stopWakeWordListening = async () => {
    try {
      setIsWakeWordListening(false);
      await Voice.stop();
      await Voice.cancel();
    } catch (e) {
      console.log('Stop listening error:', e);
    }
  };

  const startVoiceInput = async () => {
    if (!voiceSupported) {
      Alert.alert('Voice Not Available', 'Voice recognition is not available on this device. Please type instead.');
      return;
    }
    
    try {
      await Speech.stop(); // Stop any TTS first
      setIsListening(true);
      setRecognizedText('');
      await Voice.start('en-US');
    } catch (e) {
      console.log('Voice input error:', e);
      setIsListening(false);
    }
  };

  const stopListening = async () => {
    try {
      await Voice.stop();
      await Voice.cancel();
      setIsListening(false);
      setIsWakeWordListening(false);
    } catch (e) {
      console.log('Stop error:', e);
    }
  };

  const requestAudioPermission = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Microphone Permission Required',
          'Please enable microphone access for voice commands and "Hey Rik" wake word detection.',
          [{ text: 'OK' }]
        );
      }
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
        speak("Going to sleep. Say Rik when you need me.");
        setTimeout(() => {
          setIsRikActive(false);
          setCurrentMode('general');
        }, 2000);
      }
    }, 60000);
  };

  const activateRik = async () => {
    await stopListening();
    setIsRikActive(true);
    resetInactivityTimer();
    
    // Rik greets
    let greeting = '';
    if (rikStatus && !rikStatus.routine_learned) {
      greeting = `Hey ${userName}! Before I can help you properly, I need to learn your routine. Say "learn my routine" to get started.`;
    } else {
      greeting = `${rikStatus?.greeting || 'Hey'} ${userName}! You've done ${rikStatus?.schedule_completed || 0} of ${rikStatus?.schedule_total || 0} tasks. What do you need?`;
    }
    
    speak(greeting);
    addMessage('assistant', greeting);
  };

  const deactivateRik = () => {
    setIsRikActive(false);
    setCurrentMode('general');
    Speech.stop();
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    
    // Restart wake word listening
    setTimeout(() => startWakeWordListening(), 500);
  };

  const speak = async (text: string) => {
    await Speech.stop();
    
    // Get available voices and try to use a better one
    const voices = await Speech.getAvailableVoicesAsync();
    let selectedVoice = voices.find(v => 
      v.name?.toLowerCase().includes('daniel') || 
      v.name?.toLowerCase().includes('james') ||
      v.identifier?.includes('Daniel')
    )?.identifier;
    
    if (!selectedVoice) {
      selectedVoice = voices.find(v => 
        v.language?.startsWith('en') && v.quality === 'Enhanced'
      )?.identifier;
    }
    
    Speech.speak(text, {
      language: 'en-GB',
      pitch: 0.95,
      rate: 1.0,
      voice: selectedVoice,
      onDone: () => {
        resetInactivityTimer();
        // After Rik speaks, start listening for user response
        if (isRikActive) {
          setTimeout(() => startVoiceInput(), 300);
        }
      },
      onError: (error) => console.log('Speech error:', error),
    });
  };

  const addMessage = (role: 'user' | 'assistant', content: string, type?: string) => {
    const newMsg: Message = { id: Date.now().toString(), role, content, type };
    setMessages(prev => [...prev, newMsg]);
    setTimeout(() => scrollViewRef.current?.scrollToEnd(), 100);
  };

  const sendMessage = async (text: string, context?: string) => {
    if (!userId || !text.trim()) return;
    
    await stopListening();
    const message = text.trim().toLowerCase();
    resetInactivityTimer();
    
    // Check for deactivation commands
    if (message.includes('over') && message.includes('out')) {
      speak('Going to sleep. Say Rik when you need me.');
      addMessage('user', text);
      addMessage('assistant', 'Going to sleep. Say Rik when you need me.');
      setTimeout(deactivateRik, 2000);
      return;
    }
    
    if (message.includes('stop') || message.includes('bye') || message.includes('sleep')) {
      speak('Okay, going to sleep. Say Rik to wake me.');
      addMessage('user', text);
      addMessage('assistant', 'Going to sleep. Say Rik to wake me.');
      setTimeout(deactivateRik, 2000);
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
      generateSchedule();
      return;
    }
    
    addMessage('user', text);
    setInputText('');
    setRecognizedText('');
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
    speak("Creating your schedule. One moment.");
    
    try {
      const res = await fetch(`${API_URL}/api/rik/generate-smart-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, date: today }),
      });
      
      if (res.ok) {
        const data = await res.json();
        const msg = `Done! ${data.count} tasks ready. Check your Schedule tab.`;
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
        const msg = "Perfect! I've saved your routine. Now I can help you better.";
        addMessage('assistant', msg);
        speak(msg);
        fetchRikStatus();
        setCurrentMode('general');
      }
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const quickActions = [
    { text: "Learn my routine", icon: "school", cmd: "Learn my routine" },
    { text: "Plan my day", icon: "calendar", cmd: "Help me plan my day" },
    { text: "Generate schedule", icon: "flash", cmd: "Generate my schedule" },
    { text: "Morning briefing", icon: "sunny", cmd: "Give me my morning briefing" },
  ];

  const quickResponses = [
    "What should I do now?",
    "I'm feeling unmotivated", 
    "Check my progress",
    "Over and out",
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
            {isWakeWordListening && (
              <View style={styles.listeningBadge}>
                <Ionicons name="ear" size={12} color="#10b981" />
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
              <Text style={styles.statusLabel}>{rikStatus?.routine_learned ? "Ready" : "Setup"}</Text>
            </View>
          </View>
        )}

        {/* Rik Avatar - Inactive State */}
        {!isRikActive ? (
          <View style={styles.rikSection}>
            <TouchableOpacity onPress={activateRik} activeOpacity={0.8}>
              <Animated.View style={[styles.rikAvatar, { transform: [{ scale: wakeWordPulse }] }]}>
                <Ionicons name={isWakeWordListening ? "ear" : "mic-outline"} size={48} color="#6366f1" />
              </Animated.View>
            </TouchableOpacity>
            <Text style={styles.rikLabel}>
              {isWakeWordListening ? 'Say "Rik" to activate' : 'Tap to talk to Rik'}
            </Text>
            <Text style={styles.rikHint}>
              {isWakeWordListening ? '🎤 Listening for wake word...' : 'Voice works better on your phone'}
            </Text>
            
            {/* Quick Actions */}
            <View style={styles.quickActions}>
              {quickActions.map((action, i) => (
                <TouchableOpacity 
                  key={i} 
                  style={styles.quickAction}
                  onPress={() => { activateRik(); setTimeout(() => sendMessage(action.cmd), 1000); }}
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

            {/* Active Listening Indicator */}
            {isListening && (
              <View style={styles.activeListeningBar}>
                <Ionicons name="mic" size={16} color="#10b981" />
                <Text style={styles.activeListeningText}>
                  {recognizedText || 'Listening...'}
                </Text>
                <TouchableOpacity onPress={stopListening}>
                  <Ionicons name="close-circle" size={20} color="#ef4444" />
                </TouchableOpacity>
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
                style={[styles.micButton, isListening && styles.micButtonActive]}
                onPress={isListening ? stopListening : startVoiceInput}
              >
                <Ionicons name={isListening ? "stop" : "mic"} size={20} color="#fff" />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Type or tap mic to speak..."
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
  listeningBadge: {
    backgroundColor: '#10b98120', padding: 4, borderRadius: 8, marginTop: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4,
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
  activeListeningBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#10b98120', marginHorizontal: 20, marginBottom: 8,
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#10b981',
  },
  activeListeningText: { color: '#10b981', fontSize: 13, flex: 1 },
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
  micButtonActive: { backgroundColor: '#10b981' },
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
