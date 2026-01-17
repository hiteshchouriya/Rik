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
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

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
  daily_challenges: string[];
  location_home?: { lat: number; lng: number };
  location_work?: { lat: number; lng: number };
  location_gym?: { lat: number; lng: number };
}

export default function ProfileScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingLocation, setSavingLocation] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Location access helps Rik track where you are and remind you based on location.');
    }
  };

  const loadProfile = async () => {
    const id = await AsyncStorage.getItem('userId');
    setUserId(id);

    if (id) {
      try {
        const res = await fetch(`${API_URL}/api/users/${id}`);
        if (res.ok) {
          setProfile(await res.json());
        }
      } catch (error) {
        console.error('Error:', error);
      }
    }
    setLoading(false);
  };

  const saveCurrentLocation = async (locationType: 'home' | 'work' | 'gym') => {
    if (!userId) return;
    setSavingLocation(locationType);

    try {
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      await fetch(`${API_URL}/api/users/${userId}/location?location_type=${locationType}&latitude=${latitude}&longitude=${longitude}`, {
        method: 'PUT',
      });

      Speech.speak(`${locationType} location saved.`, { language: 'en-US' });
      loadProfile();
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Could not get current location');
    } finally {
      setSavingLocation(null);
    }
  };

  const handleReset = async () => {
    Alert.alert(
      'Reset Everything?',
      'This will clear all your data and you\'ll start over with Rik.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            Speech.speak('Goodbye. See you soon.', { language: 'en-US' });
            await AsyncStorage.clear();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

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
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profile</Text>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.name?.charAt(0).toUpperCase() || 'U'}</Text>
          </View>
          <Text style={styles.profileName}>{profile?.name}</Text>
          <Text style={styles.profileGoal}>
            {profile?.current_role} → {profile?.goal_role}
          </Text>
          <View style={styles.modeBadge}>
            <Ionicons name="fitness" size={16} color="#ef4444" />
            <Text style={styles.modeText}>{profile?.assistant_mode?.toUpperCase()} MODE</Text>
          </View>
        </View>

        {/* Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Schedule</Text>
          <View style={styles.scheduleCard}>
            <View style={styles.scheduleRow}>
              <Ionicons name="sunny" size={20} color="#f59e0b" />
              <Text style={styles.scheduleLabel}>Wake</Text>
              <Text style={styles.scheduleValue}>{profile?.wake_time}</Text>
            </View>
            <View style={styles.scheduleRow}>
              <Ionicons name="briefcase" size={20} color="#6366f1" />
              <Text style={styles.scheduleLabel}>Work</Text>
              <Text style={styles.scheduleValue}>{profile?.work_start} - {profile?.work_end}</Text>
            </View>
            <View style={styles.scheduleRow}>
              <Ionicons name="moon" size={20} color="#8b5cf6" />
              <Text style={styles.scheduleLabel}>Sleep</Text>
              <Text style={styles.scheduleValue}>{profile?.sleep_time}</Text>
            </View>
          </View>
        </View>

        {/* Locations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved Locations</Text>
          <Text style={styles.sectionSubtitle}>Rik uses these to know where you are</Text>
          
          <View style={styles.locationsContainer}>
            {(['home', 'work', 'gym'] as const).map((loc) => {
              const locationKey = `location_${loc}` as keyof UserProfile;
              const hasLocation = profile?.[locationKey];
              
              return (
                <TouchableOpacity
                  key={loc}
                  style={[styles.locationCard, hasLocation && styles.locationCardSaved]}
                  onPress={() => saveCurrentLocation(loc)}
                  disabled={savingLocation === loc}
                >
                  {savingLocation === loc ? (
                    <ActivityIndicator size="small" color="#6366f1" />
                  ) : (
                    <>
                      <Ionicons 
                        name={loc === 'home' ? 'home' : loc === 'work' ? 'business' : 'fitness'} 
                        size={24} 
                        color={hasLocation ? '#10b981' : '#6b7280'} 
                      />
                      <Text style={styles.locationLabel}>{loc.charAt(0).toUpperCase() + loc.slice(1)}</Text>
                      <Text style={styles.locationStatus}>
                        {hasLocation ? 'Saved ✓' : 'Tap to save'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Challenges */}
        {profile?.daily_challenges && profile.daily_challenges.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Challenges</Text>
            <View style={styles.challengesCard}>
              {profile.daily_challenges.map((challenge, i) => (
                <View key={i} style={styles.challengeItem}>
                  <Ionicons name="warning" size={16} color="#ef4444" />
                  <Text style={styles.challengeText}>{challenge}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="trending-up" size={24} color="#10b981" />
              <Text style={styles.statValue}>{profile?.habits_to_build?.length || 0}</Text>
              <Text style={styles.statLabel}>Building</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="ban" size={24} color="#ef4444" />
              <Text style={styles.statValue}>{profile?.habits_to_quit?.length || 0}</Text>
              <Text style={styles.statLabel}>Quitting</Text>
            </View>
          </View>
        </View>

        {/* Reset */}
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Ionicons name="refresh" size={20} color="#ef4444" />
          <Text style={styles.resetButtonText}>Reset & Start Over</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 24 },
  profileCard: {
    backgroundColor: '#1f2937', borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 24,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  profileName: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  profileGoal: { color: '#9ca3af', fontSize: 14, marginTop: 4 },
  modeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ef444420', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, marginTop: 12,
  },
  modeText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  sectionSubtitle: { color: '#6b7280', fontSize: 13, marginBottom: 12 },
  scheduleCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 16 },
  scheduleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#374151',
  },
  scheduleLabel: { color: '#9ca3af', fontSize: 14, flex: 1 },
  scheduleValue: { color: '#fff', fontSize: 16, fontWeight: '500' },
  locationsContainer: { flexDirection: 'row', gap: 12 },
  locationCard: {
    flex: 1, backgroundColor: '#1f2937', borderRadius: 16, padding: 16,
    alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  locationCardSaved: { borderColor: '#10b981' },
  locationLabel: { color: '#fff', fontSize: 14, fontWeight: '500', marginTop: 8 },
  locationStatus: { color: '#6b7280', fontSize: 11, marginTop: 4 },
  challengesCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 16 },
  challengeItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  challengeText: { color: '#e5e7eb', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: '#1f2937', borderRadius: 16, padding: 20,
    alignItems: 'center',
  },
  statValue: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginTop: 8 },
  statLabel: { color: '#6b7280', fontSize: 12, marginTop: 4 },
  resetButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1f2937', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#ef4444', marginTop: 12,
  },
  resetButtonText: { color: '#ef4444', fontSize: 16, fontWeight: '500' },
});
