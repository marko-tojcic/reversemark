import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * Deep link / web URL Supabase redirects to after OAuth (must match Auth → URL Configuration).
 * On a physical Android device, `localhost` / `127.0.0.1` in the redirect points at the phone, not your PC
 * → ERR_CONNECTION_REFUSED. We replace those with a reachable dev host when we can infer it.
 */
export function authRedirectPath(path: string): string {
  const url = Linking.createURL(path);
  if (Platform.OS === 'web') return url;

  const host = resolveDevPackagerHostname();
  if (!host) {
    if (__DEV__ && (url.includes('localhost') || url.includes('127.0.0.1'))) {
      console.warn(
        '[auth] OAuth redirect still uses localhost. Fix: set EXPO_PUBLIC_DEV_LAN_HOST in .env to your PC IP, or run `npx expo start --tunnel`, then add the new redirect URL in Supabase.'
      );
    }
    return url;
  }

  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return url.replace(/127\.0\.0\.1/g, host).replace(/localhost/g, host);
  }
  return url;
}

/** Optional: same Wi‑Fi IP as shown in `ipconfig` / Expo "Metro waiting on …" */
function envLanHost(): string | null {
  const h = process.env.EXPO_PUBLIC_DEV_LAN_HOST?.trim();
  if (!h) return null;
  if (h === 'localhost' || h === '127.0.0.1') return null;
  return h;
}

function parseHostnameFromDevSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const expMatch = s.match(/^(?:exp|exps):\/\/(?:[^@]+@)?([^/]+)/);
  if (expMatch) {
    const hostPort = expMatch[1];
    const hostname = hostPort.split(':')[0];
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') return hostname;
  }
  const noScheme = s.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
  if (noScheme) {
    const hostname = noScheme.includes(':')
      ? noScheme.slice(0, noScheme.lastIndexOf(':'))
      : noScheme;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') return hostname;
  }
  return null;
}

function resolveDevPackagerHostname(): string | null {
  const manual = envLanHost();
  if (manual) return manual;

  const fromConstants =
    parseHostnameFromDevSource(Constants.linkingUri) ??
    parseHostnameFromDevSource(Constants.experienceUrl) ??
    parseHostnameFromDevSource(Constants.expoConfig?.hostUri);

  if (fromConstants) return fromConstants;

  return null;
}
