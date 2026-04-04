import { Alert } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { isEmailVerified } from './emailVerification';

/** Returns true if the user may perform marketplace actions. */
export function requireEmailVerified(user: User | null): boolean {
  if (isEmailVerified(user)) return true;
  Alert.alert(
    'Verify your email',
    'Please verify your email to use the marketplace. Check your inbox for the confirmation link.'
  );
  return false;
}
