import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
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

/**
 * Request permissions, obtain Expo push token, upsert into `push_tokens`.
 * Web: no-op (no native push). Simulator: skips (no valid token).
 * Android Expo Go (SDK 53+): no-op — remote push is not supported; use a dev build to test.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  // Avoid calling getExpoPushTokenAsync — it invokes getDevicePushTokenAsync which logs a hard error on Android Expo Go.
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    return;
  }

  if (!Device.isDevice) {
    return;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return;
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
    console.warn(
      '[notifications] getExpoPushTokenAsync failed:',
      e instanceof Error ? e.message : e,
      '— On Android release builds, configure FCM in Expo: https://docs.expo.dev/push-notifications/fcm-credentials/'
    );
    return;
  }

  if (__DEV__) {
    console.log('[notifications] Expo push token acquired, length:', token?.length ?? 0);
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return;
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
    console.warn('[notifications] Failed to save push token to Supabase:', error.message);
  } else if (__DEV__) {
    console.log('[notifications] push_tokens upsert ok for user', user.id);
  }
}
