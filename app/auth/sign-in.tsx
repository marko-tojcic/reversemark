import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { signInWithOAuthProvider } from '../../lib/oauth';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const router = useRouter();
  const { signIn } = useAuth();

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const { error } = await signIn(email, password);

      if (error) {
        Alert.alert('Error', error.message || 'Failed to sign in');
      } else {
        router.replace('/(tabs)/home');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
      console.error('Sign-in error:', error);
    } finally {
      setLoading(false);
    }
  };

  const onOAuth = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    try {
      const { error } = await signInWithOAuthProvider(provider);
      if (error && error.message) {
        Alert.alert('Sign in', error.message);
        return;
      }
      // Web OAuth uses full-page redirect; native completes session in-app.
      if (Platform.OS !== 'web' && !error) {
        router.replace('/(tabs)/home');
      }
    } finally {
      setOauthLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={styles.forgotRow}
        onPress={() => router.push('/auth/forgot-password')}
        hitSlop={{ top: 8, bottom: 8 }}
      >
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={handleSignIn} disabled={loading || !!oauthLoading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.divider} />
      </View>

      <TouchableOpacity
        style={[styles.oauthBtn, styles.oauthGoogle]}
        onPress={() => onOAuth('google')}
        disabled={loading || !!oauthLoading}
      >
        {oauthLoading === 'google' ? (
          <ActivityIndicator color="#333" />
        ) : (
          <>
            <Ionicons name="logo-google" size={22} color="#333" />
            <Text style={styles.oauthText}>Google</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.oauthBtn, styles.oauthApple]}
        onPress={() => onOAuth('apple')}
        disabled={loading || !!oauthLoading}
      >
        {oauthLoading === 'apple' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="logo-apple" size={22} color="#fff" />
            <Text style={[styles.oauthText, { color: '#fff' }]}>Apple</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/auth/sign-up')}>
        <Text style={styles.linkText}>Don&apos;t have an account? Sign up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 32,
    color: '#1a1a1a',
  },
  input: {
    width: '100%',
    height: 56,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  forgotText: {
    color: '#007BFF',
    fontSize: 15,
    fontWeight: '500',
  },
  button: {
    width: '100%',
    height: 56,
    backgroundColor: '#007BFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 20,
    gap: 12,
  },
  divider: { flex: 1, height: 1, backgroundColor: '#e1e8ed' },
  dividerText: { fontSize: 13, color: '#888' },
  oauthBtn: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  oauthGoogle: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  oauthApple: {
    backgroundColor: '#000',
  },
  oauthText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  linkButton: {
    marginTop: 20,
  },
  linkText: {
    color: '#007BFF',
    fontSize: 15,
    fontWeight: '500',
  },
});
