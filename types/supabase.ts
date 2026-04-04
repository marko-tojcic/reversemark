export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
          username: string
          avatar_path: string | null
        }
        Insert: {
          id: string
          created_at?: string
          username: string
          avatar_path?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          username?: string
          avatar_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      categories: {
        Row: {
          id: string
          created_at: string
          name: string
        }
        Insert: {
          id?: string
          created_at?: string
          name: string
        }
        Update: {
          id?: string
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      buyer_requests: {
        Row: {
          id: string
          created_at: string
          buyer_id: string
          title: string
          description: string
          category_id: string
          condition_text: string | null
          budget_min_eur: number
          budget_max_eur: number
          location_text: string
          location: unknown // PostGIS geography point - we'll use helpers
          status:
            | 'OPEN'
            | 'IN_PROGRESS'
            | 'FULFILLED'
            | 'CLOSED'
            | 'EXPIRED'
            | 'COMPLETED'
            | 'CANCELED'
          accepted_offer_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          buyer_id: string
          title: string
          description: string
          category_id: string
          condition_text?: string | null
          budget_min_eur: number
          budget_max_eur: number
          location_text: string
          location: unknown // PostGIS geography point - we'll use helpers
          status?:
            | 'OPEN'
            | 'IN_PROGRESS'
            | 'FULFILLED'
            | 'CLOSED'
            | 'EXPIRED'
            | 'COMPLETED'
            | 'CANCELED'
          accepted_offer_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          buyer_id?: string
          title?: string
          description?: string
          category_id?: string
          condition_text?: string | null
          budget_min_eur?: number
          budget_max_eur?: number
          location_text?: string
          location?: unknown // PostGIS geography point - we'll use helpers
          status?:
            | 'OPEN'
            | 'IN_PROGRESS'
            | 'FULFILLED'
            | 'CLOSED'
            | 'EXPIRED'
            | 'COMPLETED'
            | 'CANCELED'
          accepted_offer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_requests_buyer_id_fkey"
            columns: ["buyer_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_requests_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_requests_accepted_offer_id_fkey"
            columns: ["accepted_offer_id"]
            referencedRelation: "offers"
            referencedColumns: ["id"]
          }
        ]
      }
      buyer_request_photos: {
        Row: {
          id: string
          created_at: string
          request_id: string
          storage_path: string
          sort_order: number
        }
        Insert: {
          id?: string
          created_at?: string
          request_id: string
          storage_path: string
          sort_order: number
        }
        Update: {
          id?: string
          created_at?: string
          request_id?: string
          storage_path?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "buyer_request_photos_request_id_fkey"
            columns: ["request_id"]
            referencedRelation: "buyer_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      offers: {
        Row: {
          id: string
          created_at: string
          request_id: string
          seller_id: string
          price_eur: number
          message: string
          status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'
        }
        Insert: {
          id?: string
          created_at?: string
          request_id: string
          seller_id: string
          price_eur: number
          message: string
          status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'
        }
        Update: {
          id?: string
          created_at?: string
          request_id?: string
          seller_id?: string
          price_eur?: number
          message?: string
          status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'
        }
        Relationships: [
          {
            foreignKeyName: "offers_request_id_fkey"
            columns: ["request_id"]
            referencedRelation: "buyer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_seller_id_fkey"
            columns: ["seller_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      conversations: {
        Row: {
          id: string
          created_at: string
          request_id: string
          buyer_id: string
          seller_id: string
          last_message_at: string
        }
        Insert: {
          id?: string
          created_at?: string
          request_id: string
          buyer_id: string
          seller_id: string
          last_message_at?: string
        }
        Update: {
          id?: string
          created_at?: string
          request_id?: string
          buyer_id?: string
          seller_id?: string
          last_message_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_request_id_fkey"
            columns: ["request_id"]
            referencedRelation: "buyer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_buyer_id_fkey"
            columns: ["buyer_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          id: string
          created_at: string
          conversation_id: string
          sender_id: string
          body: string
          read_at: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          conversation_id: string
          sender_id: string
          body: string
          read_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          conversation_id?: string
          sender_id?: string
          body?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      push_tokens: {
        Row: {
          id: string
          user_id: string
          token: string
          platform: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token: string
          platform: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token?: string
          platform?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      seller_profiles: {
        Row: {
          user_id: string
          preferred_categories: string[]
          preferred_brands: string[]
          clothing_sizes: string[]
          cosmetic_types: string[]
          location: unknown | null
          search_radius_km: number
          updated_at: string
        }
        Insert: {
          user_id: string
          preferred_categories?: string[]
          preferred_brands?: string[]
          clothing_sizes?: string[]
          cosmetic_types?: string[]
          location?: unknown | null
          search_radius_km?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          preferred_categories?: string[]
          preferred_brands?: string[]
          clothing_sizes?: string[]
          cosmetic_types?: string[]
          location?: unknown | null
          search_radius_km?: number
          updated_at?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          id: string
          request_id: string
          reviewer_id: string
          reviewee_id: string
          rating: number
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          reviewer_id: string
          reviewee_id: string
          rating: number
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          reviewer_id?: string
          reviewee_id?: string
          rating?: number
          comment?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ratings_request_id_fkey'
            columns: ['request_id']
            referencedRelation: 'buyer_requests'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {}
    Functions: {
      get_my_seller_profile: {
        Args: Record<string, never>
        Returns: Json | null
      }
      upsert_my_seller_profile: {
        Args: {
          p_preferred_categories: string[]
          p_preferred_brands: string[]
          p_clothing_sizes: string[]
          p_cosmetic_types: string[]
          p_lat: number | null
          p_lng: number | null
          p_search_radius_km: number
        }
        Returns: undefined
      }
      seller_user_ids_for_request_push: {
        Args: { p_request_id: string }
        Returns: { user_id: string }[]
      }
      get_user_rating: {
        Args: { p_user_id: string }
        Returns: { average_rating: number; total_reviews: number }[]
      }
      submit_rating: {
        Args: {
          p_request_id: string
          p_reviewee_id: string
          p_rating: number
          p_comment?: string | null
        }
        Returns: undefined
      }
    }
    Enums: {
      request_status:
        | 'OPEN'
        | 'IN_PROGRESS'
        | 'FULFILLED'
        | 'CLOSED'
        | 'EXPIRED'
        | 'COMPLETED'
        | 'CANCELED'
      offer_status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'
    }
  }
}

// Helper types for UI components
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type BuyerRequest = Database['public']['Tables']['buyer_requests']['Row']
export type BuyerRequestPhoto = Database['public']['Tables']['buyer_request_photos']['Row']
export type Offer = Database['public']['Tables']['offers']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type SellerProfileRow = Database['public']['Tables']['seller_profiles']['Row']

// Insert types
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type BuyerRequestInsert = Database['public']['Tables']['buyer_requests']['Insert']
export type BuyerRequestPhotoInsert = Database['public']['Tables']['buyer_request_photos']['Insert']
export type OfferInsert = Database['public']['Tables']['offers']['Insert']
export type ConversationInsert = Database['public']['Tables']['conversations']['Insert']
export type MessageInsert = Database['public']['Tables']['messages']['Insert']
export type SellerProfileInsert = Database['public']['Tables']['seller_profiles']['Insert']

// Update types
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
export type BuyerRequestUpdate = Database['public']['Tables']['buyer_requests']['Update']
export type OfferUpdate = Database['public']['Tables']['offers']['Update']
export type MessageUpdate = Database['public']['Tables']['messages']['Update']

// Helper type for PostGIS point
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// Helper to convert GeoPoint to PostGIS format
export const geoPointToPostgis = (point: GeoPoint): string => {
  return `POINT(${point.longitude} ${point.latitude})`;
}
