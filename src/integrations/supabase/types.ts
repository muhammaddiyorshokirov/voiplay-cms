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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_logs: {
        Row: {
          context: Json
          created_at: string
          event: string | null
          id: string
          ip_address: string | null
          level: string
          message: string
          path: string | null
          request_id: string | null
          source: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          event?: string | null
          id?: string
          ip_address?: string | null
          level: string
          message: string
          path?: string | null
          request_id?: string | null
          source: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          event?: string | null
          id?: string
          ip_address?: string | null
          level?: string
          message?: string
          path?: string | null
          request_id?: string | null
          source?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          button_text: string | null
          content_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          order_index: number
          subtitle: string | null
          title: string
        }
        Insert: {
          button_text?: string | null
          content_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          order_index?: number
          subtitle?: string | null
          title: string
        }
        Update: {
          button_text?: string | null
          content_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          order_index?: number
          subtitle?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "banners_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          content_id: string
          created_at: string
          episode_id: string | null
          id: string
          is_hidden: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          content_id: string
          created_at?: string
          episode_id?: string | null
          id?: string
          is_hidden?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          content_id?: string
          created_at?: string
          episode_id?: string | null
          id?: string
          is_hidden?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      content_genres: {
        Row: {
          content_id: string
          genre_id: string
          id: string
        }
        Insert: {
          content_id: string
          genre_id: string
          id?: string
        }
        Update: {
          content_id?: string
          genre_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_genres_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_genres_genre_id_fkey"
            columns: ["genre_id"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["id"]
          },
        ]
      }
      content_maker_channels: {
        Row: {
          channel_banner_url: string | null
          channel_description: string | null
          channel_logo_url: string | null
          channel_name: string | null
          created_at: string
          id: string
          instagram_url: string | null
          owner_id: string
          status: Database["public"]["Enums"]["channel_status"]
          telegram_url: string | null
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          channel_banner_url?: string | null
          channel_description?: string | null
          channel_logo_url?: string | null
          channel_name?: string | null
          created_at?: string
          id?: string
          instagram_url?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["channel_status"]
          telegram_url?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          channel_banner_url?: string | null
          channel_description?: string | null
          channel_logo_url?: string | null
          channel_name?: string | null
          created_at?: string
          id?: string
          instagram_url?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["channel_status"]
          telegram_url?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: []
      }
      content_views: {
        Row: {
          content_id: string
          created_at: string
          id: string
          user_id: string | null
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_views_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      contents: {
        Row: {
          age_rating: string | null
          alternative_title: string | null
          banner_url: string | null
          channel_id: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_minutes: number | null
          has_dub: boolean
          has_subtitle: boolean
          id: string
          imdb_rating: number | null
          is_featured: boolean
          is_premium: boolean
          is_trending: boolean
          poster_url: string | null
          publish_status: Database["public"]["Enums"]["publish_status"]
          published_at: string | null
          quality_label: string | null
          rating: number | null
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          studio: string | null
          subtitle: string | null
          thumbnail_url: string | null
          title: string
          total_episodes: number | null
          total_seasons: number | null
          trailer_url: string | null
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
          view_count: number
          year: number | null
        }
        Insert: {
          age_rating?: string | null
          alternative_title?: string | null
          banner_url?: string | null
          channel_id?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          has_dub?: boolean
          has_subtitle?: boolean
          id?: string
          imdb_rating?: number | null
          is_featured?: boolean
          is_premium?: boolean
          is_trending?: boolean
          poster_url?: string | null
          publish_status?: Database["public"]["Enums"]["publish_status"]
          published_at?: string | null
          quality_label?: string | null
          rating?: number | null
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          studio?: string | null
          subtitle?: string | null
          thumbnail_url?: string | null
          title: string
          total_episodes?: number | null
          total_seasons?: number | null
          trailer_url?: string | null
          type: Database["public"]["Enums"]["content_type"]
          updated_at?: string
          view_count?: number
          year?: number | null
        }
        Update: {
          age_rating?: string | null
          alternative_title?: string | null
          banner_url?: string | null
          channel_id?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          has_dub?: boolean
          has_subtitle?: boolean
          id?: string
          imdb_rating?: number | null
          is_featured?: boolean
          is_premium?: boolean
          is_trending?: boolean
          poster_url?: string | null
          publish_status?: Database["public"]["Enums"]["publish_status"]
          published_at?: string | null
          quality_label?: string | null
          rating?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          studio?: string | null
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string
          total_episodes?: number | null
          total_seasons?: number | null
          trailer_url?: string | null
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string
          view_count?: number
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contents_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "content_maker_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          channel_id: string | null
          content_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          episode_number: number
          id: string
          is_premium: boolean
          is_published: boolean
          release_date: string | null
          season_id: string | null
          stream_url: string | null
          subtitle_url: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          video_url: string | null
          view_count: number
        }
        Insert: {
          channel_id?: string | null
          content_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          episode_number: number
          id?: string
          is_premium?: boolean
          is_published?: boolean
          release_date?: string | null
          season_id?: string | null
          stream_url?: string | null
          subtitle_url?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Update: {
          channel_id?: string | null
          content_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          episode_number?: number
          id?: string
          is_premium?: boolean
          is_published?: boolean
          release_date?: string | null
          season_id?: string | null
          stream_url?: string | null
          subtitle_url?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "episodes_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "content_maker_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          content_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      genres: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          target_type: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          target_type?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          target_type?: string | null
          title?: string
        }
        Relationships: []
      }
      premium_plans: {
        Row: {
          code: string
          created_at: string
          days: number
          description: string | null
          download_allowed: boolean
          id: string
          is_active: boolean
          max_devices: number
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          days: number
          description?: string | null
          download_allowed?: boolean
          id?: string
          is_active?: boolean
          max_devices?: number
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          days?: number
          description?: string | null
          download_allowed?: boolean
          id?: string
          is_active?: boolean
          max_devices?: number
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_premium: boolean
          premium_expires_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_premium?: boolean
          premium_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_premium?: boolean
          premium_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      seasons: {
        Row: {
          channel_id: string | null
          content_id: string
          created_at: string
          description: string | null
          id: string
          season_number: number
          title: string | null
        }
        Insert: {
          channel_id?: string | null
          content_id: string
          created_at?: string
          description?: string | null
          id?: string
          season_number: number
          title?: string | null
        }
        Update: {
          channel_id?: string | null
          content_id?: string
          created_at?: string
          description?: string | null
          id?: string
          season_number?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seasons_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "content_maker_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          days: number
          download_allowed: boolean
          expires_at: string
          id: string
          max_devices: number
          payment_callback_payload: Json | null
          payment_create_payload: Json | null
          payment_expires_at: string | null
          payment_paid_at: string | null
          payment_provider: string | null
          payment_provider_invoice_id: string | null
          payment_requested_at: string | null
          payment_transaction_id: string | null
          payment_url: string | null
          plan_id: string
          plan_name: string
          price: number
          profile_id: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days?: number
          download_allowed?: boolean
          expires_at: string
          id?: string
          max_devices?: number
          payment_callback_payload?: Json | null
          payment_create_payload?: Json | null
          payment_expires_at?: string | null
          payment_paid_at?: string | null
          payment_provider?: string | null
          payment_provider_invoice_id?: string | null
          payment_requested_at?: string | null
          payment_transaction_id?: string | null
          payment_url?: string | null
          plan_id: string
          plan_name: string
          price?: number
          profile_id: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days?: number
          download_allowed?: boolean
          expires_at?: string
          id?: string
          max_devices?: number
          payment_callback_payload?: Json | null
          payment_create_payload?: Json | null
          payment_expires_at?: string | null
          payment_paid_at?: string | null
          payment_provider?: string | null
          payment_provider_invoice_id?: string | null
          payment_requested_at?: string | null
          payment_transaction_id?: string | null
          payment_url?: string | null
          plan_id?: string
          plan_name?: string
          price?: number
          profile_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "premium_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          browser_name: string | null
          browser_version: string | null
          created_at: string
          device_id: string
          device_name: string
          device_type: string
          first_login_at: string
          first_seen_at: string
          force_logout_at: string | null
          force_logout_reason: string | null
          id: string
          is_active: boolean
          last_login_at: string
          last_seen_at: string
          model_name: string | null
          os_name: string | null
          os_version: string | null
          platform: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser_name?: string | null
          browser_version?: string | null
          created_at?: string
          device_id: string
          device_name: string
          device_type?: string
          first_login_at?: string
          first_seen_at?: string
          force_logout_at?: string | null
          force_logout_reason?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string
          last_seen_at?: string
          model_name?: string | null
          os_name?: string | null
          os_version?: string | null
          platform?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser_name?: string | null
          browser_version?: string | null
          created_at?: string
          device_id?: string
          device_name?: string
          device_type?: string
          first_login_at?: string
          first_seen_at?: string
          force_logout_at?: string | null
          force_logout_reason?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string
          last_seen_at?: string
          model_name?: string | null
          os_name?: string | null
          os_version?: string | null
          platform?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          notification_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watch_history: {
        Row: {
          completed: boolean
          content_id: string
          created_at: string
          episode_id: string | null
          id: string
          progress_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          content_id: string
          created_at?: string
          episode_id?: string | null
          id?: string
          progress_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          content_id?: string
          created_at?: string
          episode_id?: string | null
          id?: string
          progress_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_history_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_history_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          content_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_pending_subscription: {
        Args: {
          _paid_at?: string
          _payment_payload?: Json
          _provider_invoice_id?: string
          _subscription_id: string
          _transaction_id: string
        }
        Returns: {
          created_at: string
          days: number
          download_allowed: boolean
          expires_at: string
          id: string
          max_devices: number
          payment_callback_payload: Json | null
          payment_create_payload: Json | null
          payment_expires_at: string | null
          payment_paid_at: string | null
          payment_provider: string | null
          payment_provider_invoice_id: string | null
          payment_requested_at: string | null
          payment_transaction_id: string | null
          payment_url: string | null
          plan_id: string
          plan_name: string
          price: number
          profile_id: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_effective_user_devices: {
        Args: { _user_id: string }
        Returns: {
          browser_name: string | null
          browser_version: string | null
          created_at: string
          device_id: string
          device_name: string
          device_type: string
          first_login_at: string
          first_seen_at: string
          force_logout_at: string | null
          force_logout_reason: string | null
          id: string
          is_active: boolean
          last_login_at: string
          last_seen_at: string
          model_name: string | null
          os_name: string | null
          os_version: string | null
          platform: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "user_devices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_user_device_inactive: {
        Args: { _device_id: string }
        Returns: {
          browser_name: string | null
          browser_version: string | null
          created_at: string
          device_id: string
          device_name: string
          device_type: string
          first_login_at: string
          first_seen_at: string
          force_logout_at: string | null
          force_logout_reason: string | null
          id: string
          is_active: boolean
          last_login_at: string
          last_seen_at: string
          model_name: string | null
          os_name: string | null
          os_version: string | null
          platform: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prepare_user_device_login: { Args: { _device_id: string }; Returns: Json }
      purchase_premium_plan: {
        Args: { _plan_id: string }
        Returns: {
          created_at: string
          days: number
          download_allowed: boolean
          expires_at: string
          id: string
          max_devices: number
          payment_callback_payload: Json | null
          payment_create_payload: Json | null
          payment_expires_at: string | null
          payment_paid_at: string | null
          payment_provider: string | null
          payment_provider_invoice_id: string | null
          payment_requested_at: string | null
          payment_transaction_id: string | null
          payment_url: string | null
          plan_id: string
          plan_name: string
          price: number
          profile_id: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_profile_subscription_state: {
        Args: { _profile_id: string }
        Returns: undefined
      }
      register_user_device: {
        Args: {
          _browser_name?: string
          _browser_version?: string
          _device_id: string
          _device_name: string
          _device_type?: string
          _mark_login?: boolean
          _model_name?: string
          _os_name?: string
          _os_version?: string
          _platform?: string
          _user_agent?: string
        }
        Returns: {
          browser_name: string | null
          browser_version: string | null
          created_at: string
          device_id: string
          device_name: string
          device_type: string
          first_login_at: string
          first_seen_at: string
          force_logout_at: string | null
          force_logout_reason: string | null
          id: string
          is_active: boolean
          last_login_at: string
          last_seen_at: string
          model_name: string | null
          os_name: string | null
          os_version: string | null
          platform: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      replace_user_device: {
        Args: {
          _browser_name?: string
          _browser_version?: string
          _device_id: string
          _device_name: string
          _device_type?: string
          _model_name?: string
          _os_name?: string
          _os_version?: string
          _platform?: string
          _target_device_id: string
          _user_agent?: string
        }
        Returns: {
          browser_name: string | null
          browser_version: string | null
          created_at: string
          device_id: string
          device_name: string
          device_type: string
          first_login_at: string
          first_seen_at: string
          force_logout_at: string | null
          force_logout_reason: string | null
          id: string
          is_active: boolean
          last_login_at: string
          last_seen_at: string
          model_name: string | null
          os_name: string | null
          os_version: string | null
          platform: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_user_device_limit: {
        Args: { _user_id: string }
        Returns: {
          max_devices: number
          plan_name: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "content_maker"
      channel_status: "active" | "draft" | "hidden"
      content_status: "ongoing" | "completed" | "upcoming"
      content_type: "anime" | "serial" | "movie"
      publish_status: "draft" | "published" | "scheduled"
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
  public: {
    Enums: {
      app_role: ["admin", "user", "content_maker"],
      channel_status: ["active", "draft", "hidden"],
      content_status: ["ongoing", "completed", "upcoming"],
      content_type: ["anime", "serial", "movie"],
      publish_status: ["draft", "published", "scheduled"],
    },
  },
} as const
