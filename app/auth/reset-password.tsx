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

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { updatePassword } = useAuth();

  const onSave = async () => {
    if (password.length < 8) {
      Alert.alert('Password', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Success', 'Your password was updated.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/home') },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set new password</Text>
      <Text style={styles.subtitle}>Choose a strong password for your account.</Text>
      <TextInput
        style={styles.input}
        placeholder="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.button} onPress={onSave} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Update password</Text>
        )}
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
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 24 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    height: 52,
    backgroundColor: '#007BFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
