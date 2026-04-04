import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

/**
 * OAuth / email-confirmation redirect target. Add this path to Supabase Auth → URL config.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const href = window.location.href;
          const url = new URL(href);
          const code = url.searchParams.get('code');
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
            window.history.replaceState({}, '', url.pathname);
            if (!cancelled) router.replace('/(tabs)/home');
            return;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          if (!cancelled) router.replace('/(tabs)/home');
          return;
        }

        setMessage('Could not complete sign-in. Try again.');
        setTimeout(() => {
          if (!cancelled) router.replace('/auth/sign-in');
        }, 2000);
      } catch {
        if (!cancelled) {
          setMessage('Something went wrong.');
          router.replace('/auth/sign-in');
        }
      }
    };

    const t = setTimeout(finish, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007BFF" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8f9fa',
  },
  text: { marginTop: 16, fontSize: 15, color: '#666', textAlign: 'center' },
});
