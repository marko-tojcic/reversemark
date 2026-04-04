import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007BFF" />
      </View>
    );
  }

  // Redirect based on authentication state
  if (user) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/auth/sign-in" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
