import type { User } from '@supabase/supabase-js';

/**
 * Email/password users must verify before marketplace actions.
 * OAuth providers typically set this at sign-in.
 */
export function isEmailVerified(user: User | null): boolean {
  if (!user) return false;
  return user.email_confirmed_at != null && user.email_confirmed_at !== '';
}
