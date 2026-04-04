import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushData = Record<string, string>;

/**
 * Load tokens for a user and send via Expo Push API (minimal batching: one request per chunk).
 */
export async function sendPushNotification(
  admin: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data: PushData
): Promise<{ sent: number; errors: string[] }> {
  const { data: rows, error } = await admin
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error) {
    return { sent: 0, errors: [error.message] };
  }

  const tokens = (rows ?? []).map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) {
    return { sent: 0, errors: [] };
  }

  const dataStrings: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    const s = typeof v === 'string' ? v : String(v);
    if (s.length > 0) {
      dataStrings[k] = s;
    }
  }

  // channelId + color: required for readable Android notifications (Material / edge-to-edge).
  // Without channelId, FCM may not map to the app channel; wrong color can hide title/body on dark trays.
  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    data: dataStrings,
    sound: 'default' as const,
    priority: 'high' as const,
    channelId: 'default',
    color: '#09B1BA',
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{ status: string; message?: string }>;
    errors?: unknown;
  };

  if (!res.ok) {
    return { sent: 0, errors: [JSON.stringify(json)] };
  }

  const ok =
    Array.isArray(json.data) ? json.data.filter((d) => d.status === 'ok').length : tokens.length;
  return { sent: ok, errors: [] };
}
