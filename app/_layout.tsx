import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../lib/auth';
import { useSellerProfile } from '../lib/useSellerProfile';

WebBrowser.maybeCompleteAuthSession();

function NotificationNavigationBridge() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const navigate = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content
        .data as Record<string, unknown> | undefined;
      const requestId = typeof data?.requestId === 'string' ? data.requestId : undefined;
      const conversationId =
        typeof data?.conversationId === 'string' ? data.conversationId : undefined;
      // Prefer chat when both exist (message + offer-accepted flows include conversationId).
      if (conversationId) {
        router.push(`/chat/${conversationId}`);
      } else if (requestId) {
        router.push(`/requests/${requestId}`);
      }
    };

    Notifications.getLastNotificationResponseAsync().then((last) => {
      if (last) navigate(last);
    });

    const sub = Notifications.addNotificationResponseReceivedListener(navigate);
    return () => sub.remove();
  }, [router]);

  return null;
}

// Create a query client for React Query
const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Auth routes that stay mounted while signed in (password reset, OAuth callback, etc.) */
const AUTH_ROUTES_ALLOW_SIGNED_IN = new Set([
  'forgot-password',
  'reset-password',
  'callback',
]);

// Auth wrapper component that redirects based on auth state
function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'auth';
    const authScreen = segments[1];
    const allowSignedInOnAuth =
      inAuthGroup &&
      typeof authScreen === 'string' &&
      AUTH_ROUTES_ALLOW_SIGNED_IN.has(authScreen);

    if (!user && !inAuthGroup) {
      router.replace('/auth/sign-in');
    } else if (user && inAuthGroup && !allowSignedInOnAuth) {
      router.replace('/(tabs)/home');
    }
  }, [user, loading, segments]);

  if (loading) {
    return null; // Or a loading spinner
  }

  return <>{children}</>;
}

/**
 * Requires a `seller_profiles` row before main app; allows `/seller-setup` when missing.
 * Always renders `children` so the root Stack stays mounted — otherwise `router.replace` after
 * sign-in fails with "route (tabs) was not handled by any navigator".
 */
function SellerProfileGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const {
    needsSetup,
    isLoading: profileLoading,
    isSuccess,
    isError,
  } = useSellerProfile();

  useEffect(() => {
    if (authLoading || !user) return;
    if (profileLoading) return;

    const inAuth = segments[0] === 'auth';
    const inSetup = segments[0] === 'seller-setup';
    if (inAuth) return;

    if (needsSetup && !inSetup) {
      router.replace('/seller-setup');
    }
  }, [authLoading, user, profileLoading, needsSetup, segments, router]);

  if (authLoading) {
    return null;
  }

  if (!user) {
    return <>{children}</>;
  }

  const inSetup = segments[0] === 'seller-setup';
  const showProfileOverlay =
    !isError &&
    (profileLoading ||
      !isSuccess ||
      (needsSetup && !inSetup));

  return (
    <View style={styles.gateRoot}>
      {children}
      {showProfileOverlay && (
        <View style={styles.profileOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" />
        </View>
      )}
    </View>
  );
}

function RootLayoutNav() {
  return (
    <AuthWrapper>
      <SellerProfileGate>
        <NotificationNavigationBridge />
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth/sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="auth/sign-up" options={{ headerShown: false }} />
          <Stack.Screen name="auth/forgot-password" options={{ headerShown: false, title: 'Forgot password' }} />
          <Stack.Screen name="auth/reset-password" options={{ headerShown: false, title: 'Reset password' }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          <Stack.Screen
            name="seller-setup"
            options={{ title: 'Seller profile', headerShown: true }}
          />
          <Stack.Screen name="requests/[id]" options={{ headerShown: true, title: 'Request Details' }} />
          <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: 'Chat' }} />
        </Stack>
      </SellerProfileGate>
    </AuthWrapper>
  );
}

const styles = StyleSheet.create({
  gateRoot: {
    flex: 1,
  },
  profileOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});