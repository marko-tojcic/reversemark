import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { resetPasswordForEmail } = useAuth();

  const onSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Email', 'Enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await resetPasswordForEmail(trimmed);
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert(
          'Check your email',
          'If an account exists for this address, we sent a link to reset your password.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Forgot password?</Text>
      <Text style={styles.subtitle}>
        Enter your email and we will send you a reset link.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TouchableOpacity style={styles.button} onPress={onSend} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Send reset link</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={() => router.back()}>
        <Text style={styles.linkText}>Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    height: 52,
    backgroundColor: '#007BFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#007BFF', fontSize: 15 },
});
