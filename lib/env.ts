import Constants from 'expo-constants';

type SupabaseExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

/** Standalone / EAS builds may expose `extra` on expoConfig, manifest2, or legacy manifest. */
function extra(): SupabaseExtra {
  const c = Constants as {
    expoConfig?: { extra?: SupabaseExtra };
    manifest2?: { extra?: SupabaseExtra };
    manifest?: { extra?: SupabaseExtra };
  };
  return (
    c.expoConfig?.extra ??
    c.manifest2?.extra ??
    c.manifest?.extra ??
    {}
  );
}

/**
 * Required public config (Expo: EXPO_PUBLIC_* at build time, or app.config.js → extra).
 * EAS cloud builds do not ship your .env — set the same vars in Expo → Environment variables.
 */
export function getSupabaseUrl(): string {
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || extra().supabaseUrl?.trim();
  if (!url) {
    throw new Error(
      'Missing Supabase URL. Set EXPO_PUBLIC_SUPABASE_URL in .env locally, or in Expo dashboard → Environment variables for EAS builds.'
    );
  }
  return url;
}

export function getSupabaseAnonKey(): string {
  const key =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    extra().supabaseAnonKey?.trim();
  if (!key) {
    throw new Error(
      'Missing Supabase anon key. Set EXPO_PUBLIC_SUPABASE_ANON_KEY in .env locally, or in Expo dashboard → Environment variables for EAS builds.'
    );
  }
  return key;
}
