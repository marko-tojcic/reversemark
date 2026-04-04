import { supabase } from './supabase';

export type UserRatingSummary = {
  average_rating: number;
  total_reviews: number;
};

export async function getUserRating(userId: string): Promise<UserRatingSummary> {
  const { data, error } = await supabase.rpc('get_user_rating', { p_user_id: userId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    average_rating: Number(row?.average_rating ?? 0),
    total_reviews: Number(row?.total_reviews ?? 0),
  };
}

export async function submitRating(params: {
  requestId: string;
  revieweeId: string;
  rating: number;
  comment?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('submit_rating', {
    p_request_id: params.requestId,
    p_reviewee_id: params.revieweeId,
    p_rating: params.rating,
    p_comment: params.comment ?? null,
  });
  if (error) throw error;
}
