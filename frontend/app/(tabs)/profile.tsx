import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface UserProfile {
  id: string;
  name: string;
  age: number;
  current_role: string;
  goal_role: string;
  wake_time: string;
  sleep_time: string;
  work_start: string;
  work_end: string;
  assistant_mode: string;
  habits_to_build: string[];
  habits_to_quit: string[];
  goals: string[];
  created_at: string;
}

interface DailyLog {
  mood?: number;
  energy_level?: number;
  productivity_score?: number;
  notes?: string;
}

export default function Profile() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [dailyLog, setDailyLog] = useState<DailyLog>({
    mood: 3,
    energy_level: 3,
    productivity_score: 3,
    notes: '',
  });
  const [savingLog, setSavingLog] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const id = await AsyncStorage.getItem('userId');
    setUserId(id);

    if (id) {
      try {
        const res = await fetch(`${API_URL}/api/users/${id}`);
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }

        // Load today's log
        const logRes = await fetch(`${API_URL}/api/daily-log/${id}/${today}`);
        if (logRes.ok) {
          const logData = await logRes.json();
          if (logData) {
            setDailyLog({
              mood: logData.mood || 3,
              energy_level: logData.energy_level || 3,
              productivity_score: logData.productivity_score || 3,
              notes: logData.notes || '',
            });
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    }
    setLoading(false);
  };

  const saveDailyLog = async () => {
    if (!userId) return;
    setSavingLog(true);

    try {
      const res = await fetch(`${API_URL}/api/daily-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          date: today,
          ...dailyLog,
        }),
      });

      if (res.ok) {
        setShowLogModal(false);
        Alert.alert('Success', 'Daily log saved!');
      }
    } catch (error) {
      console.error('Error saving log:', error);
      Alert.alert('Error', 'Failed to save daily log');
    } finally {
      setSavingLog(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Reset App',
      'This will clear all your data and start fresh. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'strict': return '#ef4444';
      case 'moderate': return '#f59e0b';
      case 'casual': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'strict': return 'fitness';
      case 'moderate': return 'scale';
      case 'casual': return 'heart';
      default: return 'person';
    }
  };

  const RatingSelector = ({
    value,
    onChange,
    label,
  }: {
    value: number;
    onChange: (v: number) => void;
    label: string;
  }) => (
    <View style={styles.ratingContainer}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={styles.ratingButtons}>
        {[1, 2, 3, 4, 5].map((num) => (
          <TouchableOpacity
            key={num}
            style={[
              styles.ratingButton,
              value === num && styles.ratingButtonActive,
            ]}
            onPress={() => onChange(num)}
          >
            <Text
              style={[
                styles.ratingButtonText,
                value === num && styles.ratingButtonTextActive,
              ]}
            >
              {num}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>
              {profile?.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.profileName}>{profile?.name}</Text>
          <Text style={styles.profileRole}>
            {profile?.current_role} → {profile?.goal_role}
          </Text>
          
          <View style={[styles.modeBadge, { backgroundColor: getModeColor(profile?.assistant_mode || 'moderate') + '20' }]}>
            <Ionicons
              name={getModeIcon(profile?.assistant_mode || 'moderate') as any}
              size={16}
              color={getModeColor(profile?.assistant_mode || 'moderate')}
            />
            <Text style={[styles.modeText, { color: getModeColor(profile?.assistant_mode || 'moderate') }]}>
              {(profile?.assistant_mode || 'moderate').charAt(0).toUpperCase() + (profile?.assistant_mode || 'moderate').slice(1)} Mode
            </Text>
          </View>
        </View>

        {/* Daily Check-in */}
        <TouchableOpacity style={styles.checkinCard} onPress={() => setShowLogModal(true)}>
          <View style={styles.checkinLeft}>
            <Ionicons name="clipboard" size={24} color="#6366f1" />
            <View>
              <Text style={styles.checkinTitle}>Daily Check-in</Text>
              <Text style={styles.checkinSubtitle}>Log your mood and energy</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>

        {/* Schedule Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Schedule</Text>
          <View style={styles.scheduleCard}>
            <View style={styles.scheduleItem}>
              <Ionicons name="sunny" size={20} color="#f59e0b" />
              <Text style={styles.scheduleLabel}>Wake Up</Text>
              <Text style={styles.scheduleTime}>{profile?.wake_time}</Text>
            </View>
            <View style={styles.scheduleItem}>
              <Ionicons name="briefcase" size={20} color="#6366f1" />
              <Text style={styles.scheduleLabel}>Work</Text>
              <Text style={styles.scheduleTime}>{profile?.work_start} - {profile?.work_end}</Text>
            </View>
            <View style={styles.scheduleItem}>
              <Ionicons name="moon" size={20} color="#8b5cf6" />
              <Text style={styles.scheduleLabel}>Sleep</Text>
              <Text style={styles.scheduleTime}>{profile?.sleep_time}</Text>
            </View>
          </View>
        </View>

        {/* Goals Section */}
        {profile?.goals && profile.goals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Goals</Text>
            <View style={styles.goalsCard}>
              {profile.goals.map((goal, index) => (
                <View key={index} style={styles.goalItem}>
                  <Ionicons name="flag" size={16} color="#10b981" />
                  <Text style={styles.goalText}>{goal}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Habits Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Habits Overview</Text>
          <View style={styles.habitsCard}>
            <View style={styles.habitsStat}>
              <Ionicons name="trending-up" size={24} color="#10b981" />
              <Text style={styles.habitsStatValue}>{profile?.habits_to_build?.length || 0}</Text>
              <Text style={styles.habitsStatLabel}>Building</Text>
            </View>
            <View style={styles.habitsDivider} />
            <View style={styles.habitsStat}>
              <Ionicons name="ban" size={24} color="#ef4444" />
              <Text style={styles.habitsStatValue}>{profile?.habits_to_quit?.length || 0}</Text>
              <Text style={styles.habitsStatLabel}>Quitting</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionButton} onPress={handleLogout}>
            <Ionicons name="refresh" size={20} color="#ef4444" />
            <Text style={styles.actionButtonText}>Reset App & Start Over</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Daily Log Modal */}
      <Modal visible={showLogModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Daily Check-in</Text>
              <TouchableOpacity onPress={() => setShowLogModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDate}>{format(new Date(), 'EEEE, MMMM d')}</Text>

            <RatingSelector
              label="How's your mood?"
              value={dailyLog.mood || 3}
              onChange={(v) => setDailyLog(prev => ({ ...prev, mood: v }))}
            />

            <RatingSelector
              label="Energy level?"
              value={dailyLog.energy_level || 3}
              onChange={(v) => setDailyLog(prev => ({ ...prev, energy_level: v }))}
            />

            <RatingSelector
              label="Productivity?"
              value={dailyLog.productivity_score || 3}
              onChange={(v) => setDailyLog(prev => ({ ...prev, productivity_score: v }))}
            />

            <View style={styles.notesContainer}>
              <Text style={styles.ratingLabel}>Notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="How was your day?"
                placeholderTextColor="#6b7280"
                multiline
                value={dailyLog.notes}
                onChangeText={(text) => setDailyLog(prev => ({ ...prev, notes: text }))}
              />
            </View>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveDailyLog}
              disabled={savingLog}
            >
              {savingLog ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Check-in</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  profileCard: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  profileName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  profileRole: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 4,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
  },
  modeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  checkinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  checkinLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkinTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  checkinSubtitle: {
    color: '#6b7280',
    fontSize: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  scheduleCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  scheduleLabel: {
    color: '#9ca3af',
    fontSize: 14,
    flex: 1,
  },
  scheduleTime: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  goalsCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  goalText: {
    color: '#e5e7eb',
    fontSize: 14,
  },
  habitsCard: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
  },
  habitsStat: {
    flex: 1,
    alignItems: 'center',
  },
  habitsStatValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 8,
  },
  habitsStatLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  habitsDivider: {
    width: 1,
    backgroundColor: '#374151',
    marginHorizontal: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  actionButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1f2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalDate: {
    color: '#6b7280',
    fontSize: 14,
    marginBottom: 24,
  },
  ratingContainer: {
    marginBottom: 24,
  },
  ratingLabel: {
    color: '#e5e7eb',
    fontSize: 16,
    marginBottom: 12,
  },
  ratingButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  ratingButtonActive: {
    backgroundColor: '#6366f1',
  },
  ratingButtonText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '600',
  },
  ratingButtonTextActive: {
    color: '#fff',
  },
  notesContainer: {
    marginBottom: 24,
  },
  notesInput: {
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
