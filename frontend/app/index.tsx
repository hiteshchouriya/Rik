import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      if (userId) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/onboarding');
      }
    } catch (error) {
      console.error('Error checking onboarding:', error);
      router.replace('/onboarding');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366f1" />
      <Text style={styles.text}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
});
