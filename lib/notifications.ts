import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/**
 * Request permissions, obtain Expo push token, upsert into `push_tokens`.
 * Pass `sessionHint` when you already have a session (e.g. from AuthProvider) to avoid a race right after sign-in.
 * Web: no-op (no native push). Simulator: skips (no valid token).
 * Android Expo Go (SDK 53+): no-op — remote push is not supported; use a dev build to test.
 */
export async function registerForPushNotifications(
  sessionHint?: Session | null
): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'web-skip' };
  }

  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    const reason =
      'Remote push is disabled in Android Expo Go (SDK 53+). Use an EAS dev/preview build.';
    console.warn('[notifications]', reason);
    return { ok: false, reason };
  }

  if (!Device.isDevice) {
    const reason = 'Push tokens are not available on simulators — use a physical device.';
    console.warn('[notifications]', reason);
    return { ok: false, reason };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    const reason =
      'Notification permission not granted. Enable notifications in system settings for this app.';
    console.warn('[notifications]', reason);
    return { ok: false, reason };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Marketplace',
      description: 'Messages and offer updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      showBadge: true,
      sound: 'default',
      enableLights: true,
      lightColor: '#09B1BA',
    });
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  let token: string;
  try {
    const push = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    token = push.data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason = `getExpoPushTokenAsync failed: ${msg}. On Android, ensure google-services.json is included in the build and FCM credentials are uploaded to Expo (eas credentials).`;
    console.warn('[notifications]', reason);
    if (__DEV__) {
      Alert.alert('Push token error', reason);
    }
    return { ok: false, reason };
  }

  console.log('[notifications] Expo push token acquired:', token);

  let user = sessionHint?.user;
  if (!user) {
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();
    if (sessionErr) {
      const reason = `getSession failed: ${sessionErr.message}`;
      console.warn('[notifications]', reason);
      return { ok: false, reason };
    }
    user = session?.user;
  }
  if (!user) {
    const reason = 'Cannot save push token: no Supabase session (sign in first).';
    console.warn('[notifications]', reason);
    return { ok: false, reason };
  }

  const platform =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : Platform.OS;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' }
  );

  if (error) {
    const reason = `Failed to save push token: ${error.message}`;
    console.warn('[notifications]', reason, error);
    if (__DEV__) {
      Alert.alert('Push token DB error', reason);
    }
    return { ok: false, reason };
  }

  console.log('[notifications] push_tokens saved for user', user.id);
  return { ok: true, token };
}
