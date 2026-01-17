import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const STEPS = ['welcome', 'basics', 'situation', 'struggles', 'routine', 'habits', 'ready'];

const COMMON_STRUGGLES = [
  'Smoking', 'Procrastination', 'Social Media Addiction', 'Lack of Focus',
  'Poor Sleep', 'Unhealthy Eating', 'No Exercise', 'Overthinking'
];

const GOOD_HABITS = [
  'Exercise', 'Reading', 'Meditation', 'Learning New Skills',
  'Healthy Eating', 'Early Sleep', 'Journaling', 'Hydration'
];

export default function Onboarding() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    current_role: '',
    goal_role: '',
    wake_time: '06:00',
    sleep_time: '22:00',
    work_start: '09:00',
    work_end: '18:00',
    assistant_mode: 'strict',
    habits_to_build: [] as string[],
    habits_to_quit: [] as string[],
    daily_challenges: [] as string[],
    preferred_gym_time: '',
    commute_method: '',
  });

  const speak = (text: string) => {
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.95,
    });
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      // Rik speaks on certain steps
      if (STEPS[currentStep + 1] === 'struggles') {
        speak("Be honest with me. What's holding you back?");
      } else if (STEPS[currentStep + 1] === 'ready') {
        speak(`Alright ${formData.name}, I've got everything I need. Let's transform your life.`);
      }
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const toggleItem = (array: string[], item: string, field: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field as keyof typeof prev].includes(item)
        ? (prev[field as keyof typeof prev] as string[]).filter(i => i !== item)
        : [...(prev[field as keyof typeof prev] as string[]), item]
    }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const payload = {
        ...formData,
        age: parseInt(formData.age) || 25,
        habits_to_quit: formData.daily_challenges, // What they struggle with = habits to quit
      };
      
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) throw new Error('Failed to create profile');
      
      const user = await response.json();
      await AsyncStorage.setItem('userId', user.id);
      await AsyncStorage.setItem('userName', user.name);
      
      speak(`Welcome aboard, ${user.name}. I'm Rik, and starting now, I run your day. Say my name when you need me.`);
      
      router.replace('/(tabs)/rik');
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to create profile');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (STEPS[currentStep]) {
      case 'welcome':
        return (
          <View style={styles.stepContainer}>
            <View style={styles.rikAvatar}>
              <Ionicons name="fitness" size={60} color="#6366f1" />
            </View>
            <Text style={styles.title}>Meet Rik</Text>
            <Text style={styles.subtitle}>
              Your strict AI life coach who will run your day, track your progress,
              and push you towards your goals. No excuses.
            </Text>
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <Ionicons name="mic" size={24} color="#10b981" />
                <Text style={styles.featureText}>Voice activated - just say "Rik"</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="calendar" size={24} color="#10b981" />
                <Text style={styles.featureText}>Generates your daily schedule</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="location" size={24} color="#10b981" />
                <Text style={styles.featureText}>Tracks where you are</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="alert-circle" size={24} color="#10b981" />
                <Text style={styles.featureText}>Calls you out when slacking</Text>
              </View>
            </View>
          </View>
        );
      
      case 'basics':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Who am I coaching?</Text>
            <Text style={styles.stepSubtitle}>Basic info so I know who I'm dealing with</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="What should I call you?"
                placeholderTextColor="#6b7280"
                value={formData.name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                placeholder="Your age"
                placeholderTextColor="#6b7280"
                keyboardType="numeric"
                value={formData.age}
                onChangeText={(text) => setFormData(prev => ({ ...prev, age: text }))}
              />
            </View>
          </View>
        );
      
      case 'situation':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Where are you now?</Text>
            <Text style={styles.stepSubtitle}>And where do you want to be?</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Current Situation / Role</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Software Developer, Student, Unemployed"
                placeholderTextColor="#6b7280"
                value={formData.current_role}
                onChangeText={(text) => setFormData(prev => ({ ...prev, current_role: text }))}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Goal - Where You Want to Be</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Project Manager, Fit & Healthy, Business Owner"
                placeholderTextColor="#6b7280"
                value={formData.goal_role}
                onChangeText={(text) => setFormData(prev => ({ ...prev, goal_role: text }))}
              />
            </View>
          </View>
        );
      
      case 'struggles':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>What's holding you back?</Text>
            <Text style={styles.stepSubtitle}>Be honest. Select ALL that apply.</Text>
            
            <View style={styles.chipsContainer}>
              {COMMON_STRUGGLES.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.chip,
                    formData.daily_challenges.includes(item) && styles.chipSelectedRed
                  ]}
                  onPress={() => toggleItem(formData.daily_challenges, item, 'daily_challenges')}
                >
                  <Text style={[
                    styles.chipText,
                    formData.daily_challenges.includes(item) && styles.chipTextSelected
                  ]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      
      case 'routine':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Your Ideal Day</Text>
            <Text style={styles.stepSubtitle}>When should your day start and end?</Text>
            
            <View style={styles.timeRow}>
              <View style={styles.timeInput}>
                <Text style={styles.label}>Wake Up</Text>
                <TextInput
                  style={styles.input}
                  placeholder="06:00"
                  placeholderTextColor="#6b7280"
                  value={formData.wake_time}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, wake_time: text }))}
                />
              </View>
              <View style={styles.timeInput}>
                <Text style={styles.label}>Sleep</Text>
                <TextInput
                  style={styles.input}
                  placeholder="22:00"
                  placeholderTextColor="#6b7280"
                  value={formData.sleep_time}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, sleep_time: text }))}
                />
              </View>
            </View>
            
            <View style={styles.timeRow}>
              <View style={styles.timeInput}>
                <Text style={styles.label}>Work Start</Text>
                <TextInput
                  style={styles.input}
                  placeholder="09:00"
                  placeholderTextColor="#6b7280"
                  value={formData.work_start}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, work_start: text }))}
                />
              </View>
              <View style={styles.timeInput}>
                <Text style={styles.label}>Work End</Text>
                <TextInput
                  style={styles.input}
                  placeholder="18:00"
                  placeholderTextColor="#6b7280"
                  value={formData.work_end}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, work_end: text }))}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Preferred Gym/Exercise Time</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 07:00 or evening"
                placeholderTextColor="#6b7280"
                value={formData.preferred_gym_time}
                onChangeText={(text) => setFormData(prev => ({ ...prev, preferred_gym_time: text }))}
              />
            </View>
          </View>
        );
      
      case 'habits':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Habits to Build</Text>
            <Text style={styles.stepSubtitle}>What good habits do you want?</Text>
            
            <View style={styles.chipsContainer}>
              {GOOD_HABITS.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.chip,
                    formData.habits_to_build.includes(item) && styles.chipSelected
                  ]}
                  onPress={() => toggleItem(formData.habits_to_build, item, 'habits_to_build')}
                >
                  <Text style={[
                    styles.chipText,
                    formData.habits_to_build.includes(item) && styles.chipTextSelected
                  ]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      
      case 'ready':
        return (
          <View style={styles.stepContainer}>
            <View style={styles.rikAvatar}>
              <Ionicons name="checkmark-circle" size={80} color="#10b981" />
            </View>
            <Text style={styles.title}>Ready, {formData.name}?</Text>
            <Text style={styles.subtitle}>
              From now on, I control your schedule. I'll tell you what to do and when.
              No more guessing. No more wasting time.
            </Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Your Mission:</Text>
              <Text style={styles.summaryText}>
                {formData.current_role} → {formData.goal_role}
              </Text>
              <Text style={styles.summaryTitle}>Challenges to Overcome:</Text>
              <Text style={styles.summaryText}>
                {formData.daily_challenges.join(', ') || 'None selected'}
              </Text>
            </View>
          </View>
        );
      
      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (STEPS[currentStep]) {
      case 'basics':
        return formData.name.trim() && formData.age;
      case 'situation':
        return formData.current_role.trim() && formData.goal_role.trim();
      case 'struggles':
        return formData.daily_challenges.length > 0;
      default:
        return true;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((currentStep + 1) / STEPS.length) * 100}%` }]} />
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {renderStep()}
        </ScrollView>

        <View style={styles.buttonContainer}>
          {currentStep > 0 && (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[styles.nextButton, !canProceed() && styles.buttonDisabled]}
            onPress={handleNext}
            disabled={!canProceed() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextButtonText}>
                  {currentStep === STEPS.length - 1 ? "Let's Go" : 'Continue'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  keyboardView: { flex: 1 },
  progressContainer: { paddingHorizontal: 20, paddingTop: 16 },
  progressBar: { height: 4, backgroundColor: '#1f2937', borderRadius: 2 },
  progressFill: { height: '100%', backgroundColor: '#6366f1', borderRadius: 2 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  stepContainer: { alignItems: 'center' },
  rikAvatar: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#9ca3af', textAlign: 'center', marginTop: 12, lineHeight: 24 },
  featureList: { marginTop: 32, width: '100%' },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  featureText: { color: '#e5e7eb', fontSize: 16 },
  stepTitle: { fontSize: 26, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  stepSubtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 8, marginBottom: 32 },
  inputGroup: { width: '100%', marginBottom: 20 },
  label: { color: '#e5e7eb', fontSize: 14, marginBottom: 8, fontWeight: '500' },
  input: {
    backgroundColor: '#1f2937', borderRadius: 12, padding: 16,
    color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#374151',
  },
  timeRow: { flexDirection: 'row', gap: 16, width: '100%', marginBottom: 16 },
  timeInput: { flex: 1 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151',
  },
  chipSelected: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipSelectedRed: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  chipText: { color: '#9ca3af', fontSize: 14 },
  chipTextSelected: { color: '#fff' },
  summaryCard: {
    backgroundColor: '#1f2937', borderRadius: 16, padding: 20,
    width: '100%', marginTop: 24,
  },
  summaryTitle: { color: '#6b7280', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginTop: 12 },
  summaryText: { color: '#fff', fontSize: 16, marginTop: 4 },
  buttonContainer: { flexDirection: 'row', padding: 20, gap: 12 },
  backButton: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center',
  },
  nextButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 12, backgroundColor: '#6366f1',
  },
  buttonDisabled: { backgroundColor: '#374151' },
  nextButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
