import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { sendPushNotification } from '../_shared/expo-push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'message' | 'new_offer' | 'offer_status';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const jwt = authHeader.replace('Bearer ', '');

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(jwt);

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as {
      action?: Action;
      conversationId?: string;
      offerId?: string;
      kind?: 'accepted' | 'rejected';
    };

    const action = body.action;
    if (!action) {
      return new Response(JSON.stringify({ error: 'Missing action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'message') {
      const conversationId = body.conversationId;
      if (!conversationId) {
        return new Response(JSON.stringify({ error: 'Missing conversationId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: conv, error: cErr } = await admin
        .from('conversations')
        .select('id, buyer_id, seller_id, request_id')
        .eq('id', conversationId)
        .maybeSingle();

      if (cErr || !conv) {
        return new Response(JSON.stringify({ error: 'Conversation not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (conv.buyer_id !== user.id && conv.seller_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const recipientId =
        conv.buyer_id === user.id ? (conv.seller_id as string) : (conv.buyer_id as string);

      const requestId = conv.request_id as string;
      const result = await sendPushNotification(
        admin,
        recipientId,
        'New message',
        'You have a new message — tap to open the chat.',
        {
          conversationId,
          requestId,
        }
      );

      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'new_offer') {
      const offerId = body.offerId;
      if (!offerId) {
        return new Response(JSON.stringify({ error: 'Missing offerId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: offer, error: oErr } = await admin
        .from('offers')
        .select('id, seller_id, request_id, status')
        .eq('id', offerId)
        .maybeSingle();

      if (oErr || !offer) {
        return new Response(JSON.stringify({ error: 'Offer not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (offer.seller_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (offer.status !== 'PENDING') {
        return new Response(JSON.stringify({ error: 'Offer must be pending' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: reqRow, error: brErr } = await admin
        .from('buyer_requests')
        .select('buyer_id')
        .eq('id', offer.request_id)
        .maybeSingle();

      if (brErr || !reqRow) {
        return new Response(JSON.stringify({ error: 'Request not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const buyerId = reqRow.buyer_id as string;
      const requestId = offer.request_id as string;

      const result = await sendPushNotification(
        admin,
        buyerId,
        'Someone can fulfill your request',
        'A seller marked “I have this” — tap to view the offer.',
        {
          requestId,
          offerId,
        }
      );

      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'offer_status') {
      const offerId = body.offerId;
      const kind = body.kind;
      if (!offerId || !kind || (kind !== 'accepted' && kind !== 'rejected')) {
        return new Response(JSON.stringify({ error: 'Missing offerId or kind' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: offer, error: oErr } = await admin
        .from('offers')
        .select('id, seller_id, request_id, status')
        .eq('id', offerId)
        .maybeSingle();

      if (oErr || !offer) {
        return new Response(JSON.stringify({ error: 'Offer not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: reqRow, error: brErr } = await admin
        .from('buyer_requests')
        .select('buyer_id')
        .eq('id', offer.request_id)
        .maybeSingle();

      if (brErr || !reqRow) {
        return new Response(JSON.stringify({ error: 'Request not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const buyerId = reqRow.buyer_id as string;
      if (user.id !== buyerId) {
        return new Response(JSON.stringify({ error: 'Only the buyer can update offer status' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (offer.status !== (kind === 'accepted' ? 'ACCEPTED' : 'REJECTED')) {
        return new Response(JSON.stringify({ error: 'Offer status mismatch' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const sellerId = offer.seller_id as string;
      const requestId = offer.request_id as string;

      if (kind === 'accepted') {
        const conversationId = body.conversationId;
        if (!conversationId) {
          return new Response(JSON.stringify({ error: 'Missing conversationId for accepted offer' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: convCheck } = await admin
          .from('conversations')
          .select('id')
          .eq('id', conversationId)
          .eq('offer_id', offerId)
          .maybeSingle();

        if (!convCheck) {
          return new Response(JSON.stringify({ error: 'Invalid conversation for offer' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const result = await sendPushNotification(
          admin,
          sellerId,
          'Offer accepted',
          'The buyer accepted your offer — tap to open the chat.',
          {
            conversationId,
            requestId,
            offerId,
          }
        );

        return new Response(JSON.stringify({ ok: true, ...result }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await sendPushNotification(
        admin,
        sellerId,
        'Offer declined',
        'The buyer declined your offer — tap to view the request.',
        {
          requestId,
          offerId,
        }
      );

      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
