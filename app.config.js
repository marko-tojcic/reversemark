/**
 * Dynamic Expo config: merges app.json and embeds Supabase settings into `extra`
 * so release builds work when EAS injects EXPO_PUBLIC_* (your .env is not uploaded).
 *
 * Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in:
 * https://expo.dev → your project → Environment variables (Preview / Production)
 */
require('dotenv').config();

const appJson = require('./app.json');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail EAS builds loudly if env was not applied to this job (avoids shipping a broken APK).
const isEasBuild =
  process.env.EAS_BUILD === 'true' || process.env.EAS_BUILD === '1';
if (isEasBuild) {
  if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
    throw new Error(
      '[EAS] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. In https://expo.dev open this project → Environment variables → add both for the same environment as your build profile (e.g. Preview for --profile preview), then rebuild.'
    );
  }
}

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      supabaseUrl,
      supabaseAnonKey,
    },
  },
};
