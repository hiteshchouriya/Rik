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

interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  description: string;
  duration_minutes: number;
  category: string;
  completed: boolean;
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    wake: '#f59e0b',
    exercise: '#10b981',
    work: '#6366f1',
    meal: '#f97316',
    learning: '#8b5cf6',
    break: '#06b6d4',
    health: '#ec4899',
    sleep: '#6366f1',
  };
  return colors[category] || '#6b7280';
};

const getCategoryIcon = (category: string) => {
  const icons: Record<string, string> = {
    wake: 'sunny',
    exercise: 'fitness',
    work: 'briefcase',
    meal: 'restaurant',
    learning: 'book',
    break: 'cafe',
    health: 'heart',
    sleep: 'moon',
  };
  return icons[category] || 'ellipse';
};

export default function ScheduleScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const displayDate = format(new Date(), 'EEEE, MMMM d');
  const currentTime = format(new Date(), 'HH:mm');

  useEffect(() => {
    loadUser();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (userId) fetchSchedule();
    }, [userId])
  );

  const loadUser = async () => {
    const id = await AsyncStorage.getItem('userId');
    setUserId(id);
    if (id) fetchSchedule(id);
  };

  const fetchSchedule = async (id?: string) => {
    const userIdToUse = id || userId;
    if (!userIdToUse) return;

    try {
      const res = await fetch(`${API_URL}/api/schedule/${userIdToUse}/${today}`);
      if (res.ok) {
        const data = await res.json();
        setSchedule(data);
      }
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const generateSchedule = async () => {
    if (!userId) return;
    setGenerating(true);

    try {
      const res = await fetch(`${API_URL}/api/schedule/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, date: today }),
      });

      if (res.ok) {
        fetchSchedule();
      }
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setGenerating(false);
    }
  };

  const toggleComplete = async (itemId: string) => {
    try {
      await fetch(`${API_URL}/api/schedule/${itemId}/complete`, { method: 'PUT' });
      setSchedule(schedule.map(s => s.id === itemId ? { ...s, completed: true } : s));
    } catch (e) {
      console.error('Error:', e);
    }
  };

  const completedCount = schedule.filter(s => s.completed).length;
  const progress = schedule.length > 0 ? (completedCount / schedule.length) * 100 : 0;

  // Find current/next task
  const currentTaskIndex = schedule.findIndex(s => !s.completed && s.time >= currentTime);

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSchedule(); }} tintColor="#6366f1" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Today's Plan</Text>
            <Text style={styles.date}>{displayDate}</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={generateSchedule} disabled={generating}>
            {generating ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Ionicons name="refresh" size={24} color="#6366f1" />
            )}
          </TouchableOpacity>
        </View>

        {/* Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
            <Text style={styles.progressLabel}>{completedCount}/{schedule.length} done</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>

        {/* Schedule List */}
        {schedule.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#374151" />
            <Text style={styles.emptyText}>No schedule for today</Text>
            <TouchableOpacity style={styles.generateBtn} onPress={generateSchedule}>
              <Ionicons name="flash" size={20} color="#fff" />
              <Text style={styles.generateBtnText}>Generate My Day</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.timeline}>
            {schedule.map((item, index) => {
              const isCurrent = index === currentTaskIndex;
              const isPast = item.time < currentTime && !item.completed;
              
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.timelineItem,
                    isCurrent && styles.timelineItemCurrent,
                    item.completed && styles.timelineItemCompleted,
                  ]}
                  onPress={() => !item.completed && toggleComplete(item.id)}
                >
                  <View style={styles.timelineLeft}>
                    <Text style={[styles.timelineTime, item.completed && styles.textCompleted]}>
                      {item.time}
                    </Text>
                    <View style={[
                      styles.timelineDot,
                      { backgroundColor: getCategoryColor(item.category) },
                      item.completed && styles.timelineDotCompleted,
                    ]}>
                      {item.completed && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                  </View>
                  
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(item.category) + '20' }]}>
                        <Ionicons name={getCategoryIcon(item.category) as any} size={14} color={getCategoryColor(item.category)} />
                      </View>
                      <Text style={styles.duration}>{item.duration_minutes}m</Text>
                    </View>
                    <Text style={[styles.timelineTitle, item.completed && styles.textCompleted]}>
                      {item.title}
                    </Text>
                    <Text style={styles.timelineDesc}>{item.description}</Text>
                    {isPast && !item.completed && (
                      <View style={styles.missedBadge}>
                        <Text style={styles.missedText}>Missed</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  date: { color: '#6b7280', fontSize: 14, marginTop: 4 },
  refreshBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  progressCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20, marginBottom: 24 },
  progressHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 12 },
  progressValue: { color: '#6366f1', fontSize: 32, fontWeight: 'bold' },
  progressLabel: { color: '#6b7280', fontSize: 14 },
  progressBar: { height: 8, backgroundColor: '#374151', borderRadius: 4 },
  progressFill: { height: '100%', backgroundColor: '#6366f1', borderRadius: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#6b7280', fontSize: 18, marginTop: 16, marginBottom: 24 },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6366f1', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  generateBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  timeline: { gap: 12 },
  timelineItem: {
    flexDirection: 'row', gap: 16,
    backgroundColor: '#1f2937', borderRadius: 16, padding: 16,
    borderWidth: 2, borderColor: 'transparent',
  },
  timelineItemCurrent: { borderColor: '#6366f1' },
  timelineItemCompleted: { opacity: 0.6 },
  timelineLeft: { alignItems: 'center', width: 50 },
  timelineTime: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  timelineDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  timelineDotCompleted: { backgroundColor: '#10b981' },
  timelineContent: { flex: 1 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  categoryBadge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  duration: { color: '#6b7280', fontSize: 12 },
  timelineTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  timelineDesc: { color: '#9ca3af', fontSize: 13, marginTop: 4 },
  textCompleted: { textDecorationLine: 'line-through', color: '#6b7280' },
  missedBadge: { backgroundColor: '#ef444420', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start', marginTop: 8 },
  missedText: { color: '#ef4444', fontSize: 12, fontWeight: '500' },
});
