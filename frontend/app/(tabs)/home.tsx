import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Task {
  id: string;
  title: string;
  description?: string;
  scheduled_time?: string;
  date: string;
  completed: boolean;
  priority: string;
}

interface DailyLog {
  mood?: number;
  energy_level?: number;
  productivity_score?: number;
}

interface Analysis {
  summary: string;
  achievements: string[];
  improvements: string[];
  recommendations: string[];
  overall_score: number;
}

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habitStats, setHabitStats] = useState({ completed: 0, total: 0 });
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', scheduled_time: '' });
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const displayDate = format(new Date(), 'EEEE, MMMM d');
  const currentHour = new Date().getHours();

  const getGreeting = () => {
    if (currentHour < 12) return 'Good morning';
    if (currentHour < 17) return 'Good afternoon';
    return 'Good evening';
  };

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
    const name = await AsyncStorage.getItem('userName');
    setUserId(id);
    setUserName(name || 'User');
    if (id) {
      fetchData(id);
    }
  };

  const fetchData = async (id?: string) => {
    const userIdToUse = id || userId;
    if (!userIdToUse) return;

    try {
      // Fetch tasks
      const tasksRes = await fetch(`${API_URL}/api/tasks/${userIdToUse}/${today}`);
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData);
      }

      // Fetch habits
      const habitsRes = await fetch(`${API_URL}/api/habits/${userIdToUse}/${today}`);
      if (habitsRes.ok) {
        const habitsData = await habitsRes.json();
        const completed = habitsData.filter((h: any) => h.completed).length;
        setHabitStats({ completed, total: habitsData.length });
      }

      // Fetch daily log
      const logRes = await fetch(`${API_URL}/api/daily-log/${userIdToUse}/${today}`);
      if (logRes.ok) {
        const logData = await logRes.json();
        setDailyLog(logData);
      }

      // Fetch analysis
      const analysisRes = await fetch(`${API_URL}/api/analysis/${userIdToUse}/${today}`);
      if (analysisRes.ok) {
        const analysisData = await analysisRes.json();
        setAnalysis(analysisData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const toggleTask = async (taskId: string, completed: boolean) => {
    try {
      await fetch(`${API_URL}/api/tasks/${taskId}/complete?completed=${!completed}`, {
        method: 'PUT',
      });
      setTasks(tasks.map(t => t.id === taskId ? { ...t, completed: !completed } : t));
    } catch (error) {
      console.error('Error toggling task:', error);
    }
  };

  const addTask = async () => {
    if (!newTask.title.trim() || !userId) return;

    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          title: newTask.title,
          description: newTask.description,
          scheduled_time: newTask.scheduled_time,
          date: today,
          priority: 'medium',
        }),
      });

      if (res.ok) {
        const task = await res.json();
        setTasks([...tasks, task]);
        setShowTaskModal(false);
        setNewTask({ title: '', description: '', scheduled_time: '' });
      }
    } catch (error) {
      console.error('Error adding task:', error);
    }
  };

  const generateAnalysis = async () => {
    if (!userId) return;
    setGeneratingAnalysis(true);

    try {
      const res = await fetch(`${API_URL}/api/analysis/${userId}?date=${today}`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      }
    } catch (error) {
      console.error('Error generating analysis:', error);
    } finally {
      setGeneratingAnalysis(false);
    }
  };

  const completedTasks = tasks.filter(t => t.completed).length;
  const taskProgress = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

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
          <View>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.userName}>{userName}</Text>
          </View>
          <Text style={styles.date}>{displayDate}</Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="checkbox" size={24} color="#10b981" />
            <Text style={styles.statValue}>{habitStats.completed}/{habitStats.total}</Text>
            <Text style={styles.statLabel}>Habits</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="list" size={24} color="#f59e0b" />
            <Text style={styles.statValue}>{completedTasks}/{tasks.length}</Text>
            <Text style={styles.statLabel}>Tasks</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="happy" size={24} color="#6366f1" />
            <Text style={styles.statValue}>{dailyLog?.mood || '-'}/5</Text>
            <Text style={styles.statLabel}>Mood</Text>
          </View>
        </View>

        {/* Progress Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Progress</Text>
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressPercent}>{Math.round(taskProgress)}%</Text>
              <Text style={styles.progressLabel}>Complete</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${taskProgress}%` }]} />
            </View>
          </View>
        </View>

        {/* Tasks Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Tasks</Text>
            <TouchableOpacity onPress={() => setShowTaskModal(true)}>
              <Ionicons name="add-circle" size={28} color="#6366f1" />
            </TouchableOpacity>
          </View>

          {tasks.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="clipboard-outline" size={48} color="#374151" />
              <Text style={styles.emptyText}>No tasks for today</Text>
              <TouchableOpacity style={styles.addTaskButton} onPress={() => setShowTaskModal(true)}>
                <Text style={styles.addTaskButtonText}>Add Task</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.taskCard}
                onPress={() => toggleTask(task.id, task.completed)}
              >
                <Ionicons
                  name={task.completed ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={task.completed ? '#10b981' : '#6b7280'}
                />
                <View style={styles.taskContent}>
                  <Text style={[styles.taskTitle, task.completed && styles.taskCompleted]}>
                    {task.title}
                  </Text>
                  {task.scheduled_time && (
                    <Text style={styles.taskTime}>{task.scheduled_time}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* AI Analysis Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Evening Analysis</Text>
            <TouchableOpacity onPress={generateAnalysis} disabled={generatingAnalysis}>
              {generatingAnalysis ? (
                <ActivityIndicator size="small" color="#6366f1" />
              ) : (
                <Ionicons name="refresh" size={24} color="#6366f1" />
              )}
            </TouchableOpacity>
          </View>

          {analysis ? (
            <View style={styles.analysisCard}>
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreValue}>{analysis.overall_score}</Text>
                <Text style={styles.scoreLabel}>Day Score</Text>
              </View>
              <Text style={styles.analysisSummary}>{analysis.summary}</Text>
              
              {analysis.achievements.length > 0 && (
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisLabel}>Achievements</Text>
                  {analysis.achievements.map((item, i) => (
                    <View key={i} style={styles.analysisItem}>
                      <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                      <Text style={styles.analysisText}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
              
              {analysis.recommendations.length > 0 && (
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisLabel}>Recommendations</Text>
                  {analysis.recommendations.map((item, i) => (
                    <View key={i} style={styles.analysisItem}>
                      <Ionicons name="bulb" size={16} color="#f59e0b" />
                      <Text style={styles.analysisText}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.generateButton} onPress={generateAnalysis}>
              <Ionicons name="analytics" size={24} color="#fff" />
              <Text style={styles.generateButtonText}>Generate Daily Analysis</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Add Task Modal */}
      <Modal visible={showTaskModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Task</Text>
              <TouchableOpacity onPress={() => setShowTaskModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Task title"
              placeholderTextColor="#6b7280"
              value={newTask.title}
              onChangeText={(text) => setNewTask(prev => ({ ...prev, title: text }))}
            />

            <TextInput
              style={[styles.modalInput, styles.textArea]}
              placeholder="Description (optional)"
              placeholderTextColor="#6b7280"
              multiline
              value={newTask.description}
              onChangeText={(text) => setNewTask(prev => ({ ...prev, description: text }))}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Time (e.g., 09:00)"
              placeholderTextColor="#6b7280"
              value={newTask.scheduled_time}
              onChangeText={(text) => setNewTask(prev => ({ ...prev, scheduled_time: text }))}
            />

            <TouchableOpacity style={styles.modalButton} onPress={addTask}>
              <Text style={styles.modalButtonText}>Add Task</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  greeting: {
    color: '#9ca3af',
    fontSize: 16,
  },
  userName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  date: {
    color: '#6b7280',
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  progressCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 12,
  },
  progressPercent: {
    color: '#6366f1',
    fontSize: 32,
    fontWeight: 'bold',
  },
  progressLabel: {
    color: '#6b7280',
    fontSize: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 4,
  },
  emptyState: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 16,
    marginTop: 12,
  },
  addTaskButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  addTaskButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    color: '#fff',
    fontSize: 16,
  },
  taskCompleted: {
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
  taskTime: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  analysisCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreValue: {
    color: '#6366f1',
    fontSize: 48,
    fontWeight: 'bold',
  },
  scoreLabel: {
    color: '#6b7280',
    fontSize: 14,
  },
  analysisSummary: {
    color: '#e5e7eb',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  analysisSection: {
    marginTop: 12,
  },
  analysisLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  analysisItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  analysisText: {
    color: '#e5e7eb',
    fontSize: 14,
    flex: 1,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#6366f1',
    borderRadius: 16,
    padding: 20,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalInput: {
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
