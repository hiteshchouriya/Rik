import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface HabitLog {
  id: string;
  habit_name: string;
  habit_type: string;
  completed: boolean;
  date: string;
}

interface UserProfile {
  habits_to_build: string[];
  habits_to_quit: string[];
}

export default function Habits() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [habitsToBuild, setHabitsToBuild] = useState<string[]>([]);
  const [habitsToQuit, setHabitsToQuit] = useState<string[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    loadUserData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchData();
      }
    }, [userId])
  );

  const loadUserData = async () => {
    const id = await AsyncStorage.getItem('userId');
    setUserId(id);
    if (id) {
      fetchData(id);
    }
  };

  const fetchData = async (id?: string) => {
    const userIdToUse = id || userId;
    if (!userIdToUse) return;

    try {
      // Fetch user profile for habits list
      const userRes = await fetch(`${API_URL}/api/users/${userIdToUse}`);
      if (userRes.ok) {
        const userData: UserProfile = await userRes.json();
        setHabitsToBuild(userData.habits_to_build || []);
        setHabitsToQuit(userData.habits_to_quit || []);
      }

      // Fetch today's habit logs
      const logsRes = await fetch(`${API_URL}/api/habits/${userIdToUse}/${today}`);
      if (logsRes.ok) {
        const logs = await logsRes.json();
        setHabitLogs(logs);
      }

      // Fetch streaks
      const streaksRes = await fetch(`${API_URL}/api/habits/${userIdToUse}/streaks`);
      if (streaksRes.ok) {
        const streaksData = await streaksRes.json();
        setStreaks(streaksData);
      }
    } catch (error) {
      console.error('Error fetching habits:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const toggleHabit = async (habitName: string, habitType: string) => {
    if (!userId) return;

    const existingLog = habitLogs.find(l => l.habit_name === habitName);
    const newCompleted = !existingLog?.completed;

    try {
      const res = await fetch(`${API_URL}/api/habits/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          habit_name: habitName,
          habit_type: habitType,
          completed: newCompleted,
          date: today,
        }),
      });

      if (res.ok) {
        const updatedLog = await res.json();
        if (existingLog) {
          setHabitLogs(habitLogs.map(l => 
            l.habit_name === habitName ? updatedLog : l
          ));
        } else {
          setHabitLogs([...habitLogs, updatedLog]);
        }
        // Refresh streaks
        const streaksRes = await fetch(`${API_URL}/api/habits/${userId}/streaks`);
        if (streaksRes.ok) {
          const streaksData = await streaksRes.json();
          setStreaks(streaksData);
        }
      }
    } catch (error) {
      console.error('Error toggling habit:', error);
    }
  };

  const isHabitCompleted = (habitName: string) => {
    const log = habitLogs.find(l => l.habit_name === habitName);
    return log?.completed || false;
  };

  const buildCompleted = habitsToBuild.filter(h => isHabitCompleted(h)).length;
  const quitCompleted = habitsToQuit.filter(h => isHabitCompleted(h)).length;
  const totalCompleted = buildCompleted + quitCompleted;
  const totalHabits = habitsToBuild.length + habitsToQuit.length;

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Habits</Text>
          <Text style={styles.date}>{format(new Date(), 'EEEE, MMM d')}</Text>
        </View>

        {/* Progress Overview */}
        <View style={styles.progressCard}>
          <View style={styles.progressCircle}>
            <Text style={styles.progressValue}>{totalCompleted}/{totalHabits}</Text>
            <Text style={styles.progressLabel}>Done</Text>
          </View>
          <View style={styles.progressStats}>
            <View style={styles.progressStat}>
              <Ionicons name="trending-up" size={20} color="#10b981" />
              <Text style={styles.progressStatValue}>{buildCompleted}/{habitsToBuild.length}</Text>
              <Text style={styles.progressStatLabel}>Building</Text>
            </View>
            <View style={styles.progressStat}>
              <Ionicons name="trending-down" size={20} color="#ef4444" />
              <Text style={styles.progressStatValue}>{quitCompleted}/{habitsToQuit.length}</Text>
              <Text style={styles.progressStatLabel}>Quitting</Text>
            </View>
          </View>
        </View>

        {/* Habits to Build */}
        {habitsToBuild.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="arrow-up-circle" size={24} color="#10b981" />
              <Text style={styles.sectionTitle}>Habits to Build</Text>
            </View>

            {habitsToBuild.map((habit) => (
              <TouchableOpacity
                key={habit}
                style={styles.habitCard}
                onPress={() => toggleHabit(habit, 'build')}
              >
                <View style={styles.habitLeft}>
                  <View style={[
                    styles.checkbox,
                    isHabitCompleted(habit) && styles.checkboxCompleted
                  ]}>
                    {isHabitCompleted(habit) && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </View>
                  <Text style={[
                    styles.habitName,
                    isHabitCompleted(habit) && styles.habitNameCompleted
                  ]}>
                    {habit}
                  </Text>
                </View>
                <View style={styles.habitRight}>
                  {streaks[habit] > 0 && (
                    <View style={styles.streakBadge}>
                      <Ionicons name="flame" size={14} color="#f59e0b" />
                      <Text style={styles.streakText}>{streaks[habit]}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Habits to Quit */}
        {habitsToQuit.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="ban" size={24} color="#ef4444" />
              <Text style={styles.sectionTitle}>Habits to Quit</Text>
            </View>

            {habitsToQuit.map((habit) => (
              <TouchableOpacity
                key={habit}
                style={styles.habitCard}
                onPress={() => toggleHabit(habit, 'quit')}
              >
                <View style={styles.habitLeft}>
                  <View style={[
                    styles.checkbox,
                    styles.checkboxQuit,
                    isHabitCompleted(habit) && styles.checkboxQuitCompleted
                  ]}>
                    {isHabitCompleted(habit) && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </View>
                  <View>
                    <Text style={[
                      styles.habitName,
                      isHabitCompleted(habit) && styles.habitNameCompleted
                    ]}>
                      {habit}
                    </Text>
                    <Text style={styles.habitSubtext}>
                      {isHabitCompleted(habit) ? 'Avoided today!' : 'Mark when avoided'}
                    </Text>
                  </View>
                </View>
                <View style={styles.habitRight}>
                  {streaks[habit] > 0 && (
                    <View style={[styles.streakBadge, styles.streakBadgeQuit]}>
                      <Ionicons name="flame" size={14} color="#ef4444" />
                      <Text style={[styles.streakText, { color: '#ef4444' }]}>{streaks[habit]} days clean</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {totalHabits === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="add-circle-outline" size={64} color="#374151" />
            <Text style={styles.emptyText}>No habits set yet</Text>
            <Text style={styles.emptySubtext}>Edit your profile to add habits</Text>
          </View>
        )}
      </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  date: {
    color: '#6b7280',
    fontSize: 14,
  },
  progressCard: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  progressCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  progressLabel: {
    color: '#6b7280',
    fontSize: 12,
  },
  progressStats: {
    flex: 1,
    marginLeft: 24,
    gap: 16,
  },
  progressStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressStatValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  progressStatLabel: {
    color: '#6b7280',
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  habitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCompleted: {
    backgroundColor: '#10b981',
  },
  checkboxQuit: {
    borderColor: '#ef4444',
  },
  checkboxQuitCompleted: {
    backgroundColor: '#ef4444',
  },
  habitName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  habitNameCompleted: {
    color: '#6b7280',
  },
  habitSubtext: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  habitRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#292524',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  streakBadgeQuit: {
    backgroundColor: '#1c1917',
  },
  streakText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#4b5563',
    fontSize: 14,
    marginTop: 4,
  },
});
