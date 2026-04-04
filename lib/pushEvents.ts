import { supabase } from './supabase';

/** Seller tapped “I have this” — notify buyer with link to the request / offer context. */
export function notifyNewOffer(offerId: string): void {
  void supabase.functions.invoke('notify', {
    body: { action: 'new_offer', offerId },
  });
}

/** Recipient gets push with `conversationId` + `requestId` for deep link (chat preferred). */
export function notifyNewMessage(conversationId: string): void {
  void supabase.functions.invoke('notify', {
    body: { action: 'message', conversationId },
  });
}

/** Buyer accepted or rejected an offer — notifies the seller. Pass `conversationId` when kind is `accepted`. */
export function notifyOfferStatus(
  offerId: string,
  kind: 'accepted' | 'rejected',
  conversationId?: string
): void {
  void supabase.functions.invoke('notify', {
    body: {
      action: 'offer_status',
      offerId,
      kind,
      ...(conversationId ? { conversationId } : {}),
    },
  });
}
