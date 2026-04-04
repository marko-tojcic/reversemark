import { supabase } from './supabase';

/**
 * Calls Edge Function `delete-account` (service role) to remove the auth user and cascaded data.
 * Deploy: `supabase functions deploy delete-account` and set secrets.
 */
export async function deleteAccountViaEdgeFunction(): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.functions.invoke('delete-account', {
      method: 'POST',
    });
    if (error) {
      return { error: new Error(error.message) };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
