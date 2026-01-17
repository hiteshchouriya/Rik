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

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const STEPS = [
  'welcome',
  'basics',
  'career',
  'routine',
  'habits_build',
  'habits_quit',
  'goals',
  'assistant_mode',
];

const COMMON_HABITS_BUILD = [
  'Exercise', 'Reading', 'Meditation', 'Learning', 'Healthy Eating',
  'Sleep Early', 'Journaling', 'Hydration', 'Walking', 'Stretching'
];

const COMMON_HABITS_QUIT = [
  'Smoking', 'Excessive Screen Time', 'Procrastination', 'Junk Food',
  'Social Media Scrolling', 'Late Nights', 'Negative Self-Talk', 'Oversleeping'
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
    habits_to_build: [] as string[],
    habits_to_quit: [] as string[],
    goals: [] as string[],
    assistant_mode: 'moderate',
  });
  
  const [customHabit, setCustomHabit] = useState('');
  const [customGoal, setCustomGoal] = useState('');

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const toggleHabitBuild = (habit: string) => {
    setFormData(prev => ({
      ...prev,
      habits_to_build: prev.habits_to_build.includes(habit)
        ? prev.habits_to_build.filter(h => h !== habit)
        : [...prev.habits_to_build, habit]
    }));
  };

  const toggleHabitQuit = (habit: string) => {
    setFormData(prev => ({
      ...prev,
      habits_to_quit: prev.habits_to_quit.includes(habit)
        ? prev.habits_to_quit.filter(h => h !== habit)
        : [...prev.habits_to_quit, habit]
    }));
  };

  const addCustomGoal = () => {
    if (customGoal.trim()) {
      setFormData(prev => ({
        ...prev,
        goals: [...prev.goals, customGoal.trim()]
      }));
      setCustomGoal('');
    }
  };

  const removeGoal = (goal: string) => {
    setFormData(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g !== goal)
    }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const payload = {
        ...formData,
        age: parseInt(formData.age) || 25,
      };
      
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create profile');
      }
      
      const user = await response.json();
      await AsyncStorage.setItem('userId', user.id);
      await AsyncStorage.setItem('userName', user.name);
      
      router.replace('/(tabs)/home');
    } catch (error) {
      console.error('Error creating profile:', error);
      Alert.alert('Error', 'Failed to create your profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (STEPS[currentStep]) {
      case 'welcome':
        return (
          <View style={styles.stepContainer}>
            <Ionicons name="rocket" size={80} color="#6366f1" />
            <Text style={styles.title}>Life Transformation{"\n"}Assistant</Text>
            <Text style={styles.subtitle}>
              Your AI-powered personal coach to help you achieve your goals,
              build better habits, and transform your life.
            </Text>
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                <Text style={styles.featureText}>Personalized daily routines</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                <Text style={styles.featureText}>AI-powered coaching & analysis</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                <Text style={styles.featureText}>Habit tracking & streaks</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                <Text style={styles.featureText}>Evening performance reviews</Text>
              </View>
            </View>
          </View>
        );
      
      case 'basics':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Let's get to know you</Text>
            <Text style={styles.stepSubtitle}>Basic information to personalize your experience</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor="#6b7280"
                value={formData.name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Your Age</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your age"
                placeholderTextColor="#6b7280"
                keyboardType="numeric"
                value={formData.age}
                onChangeText={(text) => setFormData(prev => ({ ...prev, age: text }))}
              />
            </View>
          </View>
        );
      
      case 'career':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Career Transition</Text>
            <Text style={styles.stepSubtitle}>Where are you now and where do you want to be?</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Current Role / Situation</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Software Developer"
                placeholderTextColor="#6b7280"
                value={formData.current_role}
                onChangeText={(text) => setFormData(prev => ({ ...prev, current_role: text }))}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Goal Role / Where You Want to Be</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Project Manager"
                placeholderTextColor="#6b7280"
                value={formData.goal_role}
                onChangeText={(text) => setFormData(prev => ({ ...prev, goal_role: text }))}
              />
            </View>
          </View>
        );
      
      case 'routine':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Daily Routine</Text>
            <Text style={styles.stepSubtitle}>Set your ideal daily schedule</Text>
            
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
                <Text style={styles.label}>Sleep Time</Text>
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
          </View>
        );
      
      case 'habits_build':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Habits to Build</Text>
            <Text style={styles.stepSubtitle}>Select habits you want to develop</Text>
            
            <View style={styles.chipsContainer}>
              {COMMON_HABITS_BUILD.map((habit) => (
                <TouchableOpacity
                  key={habit}
                  style={[
                    styles.chip,
                    formData.habits_to_build.includes(habit) && styles.chipSelected
                  ]}
                  onPress={() => toggleHabitBuild(habit)}
                >
                  <Text style={[
                    styles.chipText,
                    formData.habits_to_build.includes(habit) && styles.chipTextSelected
                  ]}>{habit}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      
      case 'habits_quit':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Habits to Quit</Text>
            <Text style={styles.stepSubtitle}>Select habits you want to overcome</Text>
            
            <View style={styles.chipsContainer}>
              {COMMON_HABITS_QUIT.map((habit) => (
                <TouchableOpacity
                  key={habit}
                  style={[
                    styles.chip,
                    formData.habits_to_quit.includes(habit) && styles.chipSelectedRed
                  ]}
                  onPress={() => toggleHabitQuit(habit)}
                >
                  <Text style={[
                    styles.chipText,
                    formData.habits_to_quit.includes(habit) && styles.chipTextSelected
                  ]}>{habit}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      
      case 'goals':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Your Goals</Text>
            <Text style={styles.stepSubtitle}>What do you want to achieve?</Text>
            
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Add a goal..."
                placeholderTextColor="#6b7280"
                value={customGoal}
                onChangeText={setCustomGoal}
                onSubmitEditing={addCustomGoal}
              />
              <TouchableOpacity style={styles.addButton} onPress={addCustomGoal}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.goalsContainer}>
              {formData.goals.map((goal, index) => (
                <View key={index} style={styles.goalItem}>
                  <Text style={styles.goalText}>{goal}</Text>
                  <TouchableOpacity onPress={() => removeGoal(goal)}>
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        );
      
      case 'assistant_mode':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Assistant Personality</Text>
            <Text style={styles.stepSubtitle}>How do you want your AI coach to interact with you?</Text>
            
            <TouchableOpacity
              style={[
                styles.modeCard,
                formData.assistant_mode === 'strict' && styles.modeCardSelected
              ]}
              onPress={() => setFormData(prev => ({ ...prev, assistant_mode: 'strict' }))}
            >
              <Ionicons name="fitness" size={32} color={formData.assistant_mode === 'strict' ? '#ef4444' : '#6b7280'} />
              <View style={styles.modeContent}>
                <Text style={styles.modeTitle}>Strict</Text>
                <Text style={styles.modeDescription}>No excuses. Direct and firm. Holds you fully accountable.</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.modeCard,
                formData.assistant_mode === 'moderate' && styles.modeCardSelected
              ]}
              onPress={() => setFormData(prev => ({ ...prev, assistant_mode: 'moderate' }))}
            >
              <Ionicons name="scale" size={32} color={formData.assistant_mode === 'moderate' ? '#f59e0b' : '#6b7280'} />
              <View style={styles.modeContent}>
                <Text style={styles.modeTitle}>Moderate</Text>
                <Text style={styles.modeDescription}>Balanced approach. Supportive but challenging.</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.modeCard,
                formData.assistant_mode === 'casual' && styles.modeCardSelected
              ]}
              onPress={() => setFormData(prev => ({ ...prev, assistant_mode: 'casual' }))}
            >
              <Ionicons name="heart" size={32} color={formData.assistant_mode === 'casual' ? '#10b981' : '#6b7280'} />
              <View style={styles.modeContent}>
                <Text style={styles.modeTitle}>Casual</Text>
                <Text style={styles.modeDescription}>Friendly and gentle. Focus on positive reinforcement.</Text>
              </View>
            </TouchableOpacity>
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
      case 'career':
        return formData.current_role.trim() && formData.goal_role.trim();
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
        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${((currentStep + 1) / STEPS.length) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {currentStep + 1} of {STEPS.length}
          </Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderStep()}
        </ScrollView>

        {/* Navigation Buttons */}
        <View style={styles.buttonContainer}>
          {currentStep > 0 && (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[
              styles.nextButton,
              !canProceed() && styles.buttonDisabled,
              currentStep === 0 && styles.fullWidthButton
            ]}
            onPress={handleNext}
            disabled={!canProceed() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextButtonText}>
                  {currentStep === STEPS.length - 1 ? 'Get Started' : 'Continue'}
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
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  keyboardView: {
    flex: 1,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#1f2937',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 2,
  },
  progressText: {
    color: '#6b7280',
    fontSize: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  stepContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 24,
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 24,
  },
  featureList: {
    marginTop: 32,
    width: '100%',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  featureText: {
    color: '#e5e7eb',
    fontSize: 16,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  inputGroup: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    color: '#e5e7eb',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    marginBottom: 16,
  },
  timeInput: {
    flex: 1,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  chipSelected: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  chipSelectedRed: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  chipText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#fff',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 20,
  },
  addButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalsContainer: {
    width: '100%',
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  goalText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeCardSelected: {
    borderColor: '#6366f1',
  },
  modeContent: {
    flex: 1,
  },
  modeTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modeDescription: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#1f2937',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#6366f1',
  },
  fullWidthButton: {
    flex: 1,
  },
  buttonDisabled: {
    backgroundColor: '#374151',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
