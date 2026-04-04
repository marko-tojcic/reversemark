/**
 * Dynamic Expo config: merges app.json and embeds Supabase settings into `extra`
 * so release builds work when EAS injects EXPO_PUBLIC_* (your .env is not uploaded).
 *
 * Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in:
 * https://expo.dev → your project → Environment variables (Preview / Production)
 */
require('dotenv').config();

const appJson = require('./app.json');

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
};
