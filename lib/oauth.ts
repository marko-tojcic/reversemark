import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { authRedirectPath } from './authRedirect';

function parseAuthCallbackUrl(url: string): {
  code: string | null;
  access: string | null;
  refresh: string | null;
} {
  const qMark = url.indexOf('?');
  const hash = url.indexOf('#');
  const queryPart =
    qMark >= 0 ? url.slice(qMark + 1, hash >= 0 ? hash : undefined) : '';
  const hashPart = hash >= 0 ? url.slice(hash + 1) : '';

  const read = (s: string) => {
    const p = new URLSearchParams(s);
    return {
      code: p.get('code'),
      access: p.get('access_token'),
      refresh: p.get('refresh_token'),
    };
  };

  const fromQ = read(queryPart);
  const fromH = read(hashPart);
  return {
    code: fromQ.code || fromH.code,
    access: fromQ.access || fromH.access,
    refresh: fromQ.refresh || fromH.refresh,
  };
}

export async function signInWithOAuthProvider(
  provider: 'google' | 'apple'
): Promise<{ error: Error | null }> {
  try {
    const redirectTo = authRedirectPath('auth/callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: Platform.OS !== 'web',
      },
    });

    if (error) return { error };

    if (Platform.OS === 'web' && typeof window !== 'undefined' && data?.url) {
      window.location.assign(data.url);
      return { error: null };
    }

    if (!data?.url) {
      return { error: new Error('No OAuth URL returned') };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { error: null };
    }

    if (result.type !== 'success' || !result.url) {
      return { error: new Error('Sign-in was not completed') };
    }

    const { code, access, refresh } = parseAuthCallbackUrl(result.url);

    if (code) {
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) return { error: exErr };
      return { error: null };
    }

    if (access && refresh) {
      const { error: sErr } = await supabase.auth.setSession({
        access_token: access,
        refresh_token: refresh,
      });
      if (sErr) return { error: sErr };
      return { error: null };
    }

    return { error: new Error('Could not complete sign-in from redirect') };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
