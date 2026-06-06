export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_likes: {
        Row: {
          activity_type: string
          created_at: string
          id: string
          liker_id: string
          source_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          id?: string
          liker_id: string
          source_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          id?: string
          liker_id?: string
          source_id?: string
        }
        Relationships: []
      }
      show_alert_subscriptions: {
        Row:    { id: string; subscriber_id: string; account_id: string; created_at: string }
        Insert: { id?: string; subscriber_id: string; account_id: string; created_at?: string }
        Update: { id?: string; subscriber_id?: string; account_id?: string; created_at?: string }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string | null
          dismissed: boolean | null
          event_id: string | null
          id: string
          message: string
          recurrence_group_id: string | null
          snoozed_until: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          dismissed?: boolean | null
          event_id?: string | null
          id?: string
          message: string
          recurrence_group_id?: string | null
          snoozed_until?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          dismissed?: boolean | null
          event_id?: string | null
          id?: string
          message?: string
          recurrence_group_id?: string | null
          snoozed_until?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          notes: string | null
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_id: string
          target_kind: string
          target_user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id: string
          target_kind: string
          target_user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id?: string
          target_kind?: string
          target_user_id?: string
        }
        Relationships: []
      }
      conversation_members: {
        Row: {
          conversation_id: string
          deleted_at: string | null
          joined_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          deleted_at?: string | null
          joined_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          deleted_at?: string | null
          joined_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string
          name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          name?: string | null
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      event_likes: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_likes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_views: {
        Row: {
          event_id: string
          id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          event_id: string
          id?: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          event_id?: string
          id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_views_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_wall_posts: {
        Row: {
          body: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          event_id: string
          id: string
          image_url: string | null
          is_venue_post: boolean
          like_count: number
          media_height: number | null
          media_source_id: string | null
          media_type: string | null
          media_url: string | null
          media_width: number | null
          parent_id: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          event_id: string
          id?: string
          image_url?: string | null
          is_venue_post?: boolean
          like_count?: number
          media_height?: number | null
          media_source_id?: string | null
          media_type?: string | null
          media_url?: string | null
          media_width?: number | null
          parent_id?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          event_id?: string
          id?: string
          image_url?: string | null
          is_venue_post?: boolean
          like_count?: number
          media_height?: number | null
          media_source_id?: string | null
          media_type?: string | null
          media_url?: string | null
          media_width?: number | null
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_wall_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_wall_posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "event_wall_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_wall_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          fill_frame: boolean | null
          focal_x: number | null
          focal_y: number | null
          id: string
          is_recurring: boolean
          like_count: number
          location_lat: number | null
          location_lng: number | null
          neighborhood: string | null
          poster_offset_x: number | null
          poster_offset_y: number | null
          poster_url: string | null
          recurrence_frequency: string | null
          recurrence_group_id: string | null
          recurrence_rule: string | null
          sold_out: boolean
          sold_out_report_count: number
          show_times: string[] | null
          starts_at: string
          status: string
          created_by: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          title: string
          venue_id: string | null
          view_count: number
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          fill_frame?: boolean | null
          focal_x?: number | null
          focal_y?: number | null
          id?: string
          is_recurring?: boolean
          like_count?: number
          location_lat?: number | null
          location_lng?: number | null
          neighborhood?: string | null
          poster_offset_x?: number | null
          poster_offset_y?: number | null
          poster_url?: string | null
          recurrence_frequency?: string | null
          recurrence_group_id?: string | null
          recurrence_rule?: string | null
          sold_out?: boolean
          sold_out_report_count?: number
          show_times?: string[] | null
          starts_at: string
          status?: string
          created_by?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          title: string
          venue_id?: string | null
          view_count?: number
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          fill_frame?: boolean | null
          focal_x?: number | null
          focal_y?: number | null
          id?: string
          is_recurring?: boolean
          like_count?: number
          location_lat?: number | null
          location_lng?: number | null
          neighborhood?: string | null
          poster_offset_x?: number | null
          poster_offset_y?: number | null
          poster_url?: string | null
          recurrence_frequency?: string | null
          recurrence_group_id?: string | null
          recurrence_rule?: string | null
          sold_out?: boolean
          sold_out_report_count?: number
          show_times?: string[] | null
          starts_at?: string
          status?: string
          created_by?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          title?: string
          venue_id?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          accepted_at: string | null
          created_at: string
          follower_id: string
          following_id: string
          id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          media_height: number | null
          media_source_id: string | null
          media_type: string | null
          media_url: string | null
          media_width: number | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          media_height?: number | null
          media_source_id?: string | null
          media_type?: string | null
          media_url?: string | null
          media_width?: number | null
          sender_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          media_height?: number | null
          media_source_id?: string | null
          media_type?: string | null
          media_url?: string | null
          media_width?: number | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body_preview: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          recipient_id: string
          sender_id: string | null
          target_event_id: string | null
          target_post_id: string | null
        }
        Insert: {
          body_preview?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          recipient_id: string
          sender_id?: string | null
          target_event_id?: string | null
          target_post_id?: string | null
        }
        Update: {
          body_preview?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string | null
          target_event_id?: string | null
          target_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_target_event_id_fkey"
            columns: ["target_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_target_post_id_fkey"
            columns: ["target_post_id"]
            isOneToOne: false
            referencedRelation: "event_wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "event_wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          avatar_diamond_url: string | null
          avatar_full_url: string | null
          avatar_url: string | null
          banner_url: string | null
          banner_focal_y: number
          bio: string | null
          created_at: string
          email_hash: string | null
          id: string
          interests: string[]
          is_admin: boolean
          is_ingester: boolean
          is_public: boolean
          is_suspended: boolean
          pending_account_type: string | null
          phone_hash: string | null
          show_social_publicly: boolean
          username: string | null
          venue_id: string | null
        }
        Insert: {
          account_type?: string
          avatar_diamond_url?: string | null
          avatar_full_url?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          banner_focal_y?: number
          bio?: string | null
          created_at?: string
          email_hash?: string | null
          id: string
          interests?: string[]
          is_admin?: boolean
          is_ingester?: boolean
          is_public?: boolean
          is_suspended?: boolean
          pending_account_type?: string | null
          phone_hash?: string | null
          show_social_publicly?: boolean
          username?: string | null
          venue_id?: string | null
        }
        Update: {
          account_type?: string
          avatar_diamond_url?: string | null
          avatar_full_url?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          banner_focal_y?: number
          bio?: string | null
          created_at?: string
          email_hash?: string | null
          id?: string
          interests?: string[]
          is_admin?: boolean
          is_ingester?: boolean
          is_public?: boolean
          is_suspended?: boolean
          pending_account_type?: string | null
          phone_hash?: string | null
          show_social_publicly?: boolean
          username?: string | null
          venue_id?: string | null
        }
        Relationships: []
      }
      superlatives: {
        Row: {
          awarded_at: string | null
          id: string
          title: string
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          awarded_at?: string | null
          id?: string
          title: string
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          awarded_at?: string | null
          id?: string
          title?: string
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "superlatives_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "superlatives_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_mutes: {
        Row: {
          created_at: string
          muted_id: string
          muter_id: string
        }
        Insert: {
          created_at?: string
          muted_id: string
          muter_id: string
        }
        Update: {
          created_at?: string
          muted_id?: string
          muter_id?: string
        }
        Relationships: []
      }
      staff_venue_checkoff: {
        Row: {
          worker_id: string
          venue_id: string
          checked_at: string
        }
        Insert: {
          worker_id: string
          venue_id: string
          checked_at?: string
        }
        Update: {
          worker_id?: string
          venue_id?: string
          checked_at?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          avatar_diamond_url: string | null
          avatar_url: string | null
          banner_url: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          diamond_focal_x: number | null
          diamond_focal_y: number | null
          hours: string | null
          id: string
          instagram: string | null
          is_verified: boolean
          location_lat: number | null
          location_lng: number | null
          name: string
          neighborhood: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          avatar_diamond_url?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          diamond_focal_x?: number | null
          diamond_focal_y?: number | null
          hours?: string | null
          id?: string
          instagram?: string | null
          is_verified?: boolean
          location_lat?: number | null
          location_lng?: number | null
          name: string
          neighborhood?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          avatar_diamond_url?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          diamond_focal_x?: number | null
          diamond_focal_y?: number | null
          hours?: string | null
          id?: string
          instagram?: string | null
          is_verified?: boolean
          location_lat?: number | null
          location_lng?: number | null
          name?: string
          neighborhood?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_follow_request: {
        Args: { follower_user_id: string }
        Returns: undefined
      }
      activity_feed: {
        Args: {
          before_cursor?: string
          before_round?: number
          page_size?: number
        }
        Returns: {
          activity_type: string
          actor_account_type: string
          actor_avatar_diamond_url: string
          actor_id: string
          actor_username: string
          body_preview: string
          created_at: string
          like_count: number
          media_type: string
          media_url: string
          round_num: number
          source_id: string
          target_event_id: string
          target_event_poster_url: string
          target_event_starts_at: string
          target_event_title: string
          viewer_has_liked: boolean
        }[]
      }
      add_like_count: {
        Args: { delta: number; p_event_id: string }
        Returns: undefined
      }
      add_members_to_conversation: {
        Args: { p_conversation_id: string; p_member_ids: string[] }
        Returns: number
      }
      add_post_like_count: {
        Args: { delta: number; p_post_id: string }
        Returns: undefined
      }
      add_view_count: {
        Args: { delta: number; p_event_id: string }
        Returns: undefined
      }
      nearby_venue_accounts: {
        Args: {
          user_lat: number
          user_lng: number
          max_results?: number
        }
        Returns: {
          profile_id: string
          username: string
          venue_name: string
          neighborhood: string | null
          avatar_diamond_url: string | null
          distance_km: number
        }[]
      }
      admin_list_venues_with_account_status: {
        Args: Record<string, never>
        Returns: {
          venue_id: string
          venue_name: string
          neighborhood: string | null
          address: string | null
          has_account: boolean
          account_profile_id: string | null
          account_username: string | null
          account_banner_url: string | null
          account_avatar_diamond_url: string | null
        }[]
      }
      admin_pending_events: {
        Args: Record<string, never>
        Returns: {
          id: string
          title: string
          starts_at: string
          venue_id: string | null
          venue_name: string | null
          poster_url: string | null
          category: string | null
          created_by: string
          uploader: string | null
          created_at: string
          is_duplicate: boolean
          duplicate_of: string | null
        }[]
      }
      admin_approve_va_request: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_decline_va_request: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_resolve_report: {
        Args: {
          p_action: string
          p_admin_notes?: string
          p_report_id: string
          p_warning_message?: string
        }
        Returns: Json
      }
      admin_set_report_reviewing: {
        Args: { p_report_id: string }
        Returns: undefined
      }
      admin_unsuspend_user: { Args: { p_user_id: string }; Returns: undefined }
      are_mutual_follows: { Args: { other_user_id: string }; Returns: boolean }
      create_conversation_with_members: {
        Args: { p_member_ids: string[]; p_name?: string }
        Returns: string
      }
      create_or_get_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      decline_follow_request: {
        Args: { follower_user_id: string }
        Returns: undefined
      }
      delete_wall_post: { Args: { p_post_id: string }; Returns: Json }
      dismiss_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      follow_status: { Args: { other_user_id: string }; Returns: string }
      match_contacts: {
        Args: { hashes: string[] }
        Returns: { id: string; username: string; avatar_diamond_url: string | null; avatar_url: string | null; account_type: string; matched_phone_hash: string | null; matched_email_hash: string | null }[]
      }
      get_unread_count: { Args: never; Returns: number }
      can_ingest: { Args: { user_id: string }; Returns: boolean }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_blocked_either_way: {
        Args: { target_id: string; viewer_id: string }
        Returns: boolean
      }
      is_caller_suspended: { Args: never; Returns: boolean }
      is_conversation_member: {
        Args: { conv_id: string; uid: string }
        Returns: boolean
      }
      is_muted_by: {
        Args: { target_id: string; viewer_id: string }
        Returns: boolean
      }
      like_activity: {
        Args: { in_activity_type: string; in_source_id: string }
        Returns: undefined
      }
      list_followers: {
        Args: { target_user_id: string }
        Returns: {
          account_type: string
          avatar_diamond_url: string
          avatar_url: string
          followed_at: string
          id: string
          username: string
        }[]
      }
      list_following: {
        Args: { target_user_id: string }
        Returns: {
          account_type: string
          avatar_diamond_url: string
          avatar_url: string
          followed_at: string
          id: string
          username: string
        }[]
      }
      list_my_blocks_and_mutes: {
        Args: never
        Returns: {
          avatar_diamond_url: string
          avatar_url: string
          created_at: string
          id: string
          kind: string
          username: string
        }[]
      }
      pending_follow_request_count: { Args: never; Returns: number }
      pending_follow_requests: {
        Args: never
        Returns: {
          avatar_diamond_url: string
          avatar_url: string
          created_at: string
          follower_id: string
          id: string
          username: string
        }[]
      }
      process_wall_post_mentions: {
        Args: { p_post_id: string }
        Returns: number
      }
      register_event_view: { Args: { p_event_id: string }; Returns: undefined }
      report_sold_out: { Args: { p_event_id: string }; Returns: number }
      confirm_sold_out: { Args: { p_event_id: string }; Returns: undefined }
      consolidate_events: { Args: { p_keep_id: string; p_remove_ids: string[] }; Returns: undefined }
      scrub_my_account_data: { Args: never; Returns: boolean }
      search_my_messages: {
        Args: { p_query: string }
        Returns: {
          body: string
          conversation_id: string
          created_at: string
          message_id: string
          rank: number
          sender_id: string
        }[]
      }
      search_users: {
        Args: { p_query: string }
        Returns: {
          avatar_diamond_url: string
          avatar_url: string
          has_interacted: boolean
          id: string
          username: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      social_diamond_row: {
        Args: { target_user_id: string }
        Returns: {
          account_type: string
          avatar_diamond_url: string
          avatar_url: string
          created_at: string
          follow_row_id: string
          id: string
          kind: string
          username: string
        }[]
      }
      soft_delete_message: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      unfollow_user: { Args: { other_user_id: string }; Returns: undefined }
      unlike_activity: {
        Args: { in_activity_type: string; in_source_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
