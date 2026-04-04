import { supabase } from './supabase';

function logInvokeError(context: string, error: Error | { message?: string } | null) {
  if (!error) return;
  const msg = 'message' in error && error.message ? error.message : String(error);
  console.warn(`[pushEvents] ${context}:`, msg);
}

async function invokeNotify(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.warn('[pushEvents] notify skipped: no session');
    return;
  }
  const { error } = await supabase.functions.invoke('notify', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) logInvokeError(String(body.action ?? 'notify'), error);
}

/** Seller tapped “I have this” — notify buyer with link to the request / offer context. */
export function notifyNewOffer(offerId: string): void {
  void invokeNotify({ action: 'new_offer', offerId });
}

/** Recipient gets push with `conversationId` + `requestId` for deep link (chat preferred). */
export function notifyNewMessage(conversationId: string): void {
  void invokeNotify({ action: 'message', conversationId });
}

/** Buyer accepted or rejected an offer — notifies the seller. Pass `conversationId` when kind is `accepted`. */
export function notifyOfferStatus(
  offerId: string,
  kind: 'accepted' | 'rejected',
  conversationId?: string
): void {
  void invokeNotify({
    action: 'offer_status',
    offerId,
    kind,
    ...(conversationId ? { conversationId } : {}),
  });
}
