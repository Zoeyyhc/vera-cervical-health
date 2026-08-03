export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      abuse_events: {
        Row: {
          created_at: string
          id: string
          message_excerpt: string | null
          session_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_excerpt?: string | null
          session_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_excerpt?: string | null
          session_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abuse_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abuse_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
          session_id: string
          sources: Json | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          session_id: string
          sources?: Json | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          starred_at: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          starred_at?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          starred_at?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      directory_links: {
        Row: {
          confirmation_notice: string
          coverage: string
          created_at: string
          directory_name: string
          id: string
          next_review_at: string | null
          reviewed_at: string | null
          search_url_template: string
          sort_order: number
          source_id: string
          status: string
          supports: string[]
        }
        Insert: {
          confirmation_notice: string
          coverage?: string
          created_at?: string
          directory_name: string
          id?: string
          next_review_at?: string | null
          reviewed_at?: string | null
          search_url_template: string
          sort_order?: number
          source_id: string
          status?: string
          supports?: string[]
        }
        Update: {
          confirmation_notice?: string
          coverage?: string
          created_at?: string
          directory_name?: string
          id?: string
          next_review_at?: string | null
          reviewed_at?: string | null
          search_url_template?: string
          sort_order?: number
          source_id?: string
          status?: string
          supports?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "directory_links_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "trusted_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_runs: {
        Row: {
          candidates_staged: number
          finished_at: string | null
          gaps_processed: number
          id: string
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          candidates_staged?: number
          finished_at?: string | null
          gaps_processed?: number
          id?: string
          started_at?: string
          status?: string
          trigger: string
        }
        Update: {
          candidates_staged?: number
          finished_at?: string | null
          gaps_processed?: number
          id?: string
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      knowledge_candidates: {
        Row: {
          authority_score: number | null
          content_hash: string
          created_at: string
          domain_tags: string[]
          gap_refs: Json
          id: string
          raw_content: string
          relevance_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_url: string
          status: string
          summary: string | null
          title: string | null
          trusted_source_id: string | null
        }
        Insert: {
          authority_score?: number | null
          content_hash: string
          created_at?: string
          domain_tags?: string[]
          gap_refs?: Json
          id?: string
          raw_content: string
          relevance_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url: string
          status?: string
          summary?: string | null
          title?: string | null
          trusted_source_id?: string | null
        }
        Update: {
          authority_score?: number | null
          content_hash?: string
          created_at?: string
          domain_tags?: string[]
          gap_refs?: Json
          id?: string
          raw_content?: string
          relevance_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string
          status?: string
          summary?: string | null
          title?: string | null
          trusted_source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_candidates_trusted_source_id_fkey"
            columns: ["trusted_source_id"]
            isOneToOne: false
            referencedRelation: "trusted_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          created_at: string | null
          embedding: string
          id: string
          metadata: Json | null
          source: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding: string
          id?: string
          metadata?: Json | null
          source?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string
          id?: string
          metadata?: Json | null
          source?: string | null
        }
        Relationships: []
      }
      llm_calls: {
        Row: {
          agent: string
          cache_read_tokens: number
          cache_write_tokens: number
          cost_usd: number | null
          created_at: string
          duration_ms: number
          error_message: string | null
          id: string
          input_tokens: number
          max_tokens: number
          model: string
          output_tokens: number
          prompt_hash: string
          prompt_id: string
          prompt_version: string
          session_id: string | null
          started_at: string
          status: string
          streamed: boolean
          temperature: number | null
          user_id: string | null
        }
        Insert: {
          agent: string
          cache_read_tokens?: number
          cache_write_tokens?: number
          cost_usd?: number | null
          created_at?: string
          duration_ms: number
          error_message?: string | null
          id?: string
          input_tokens: number
          max_tokens: number
          model: string
          output_tokens: number
          prompt_hash: string
          prompt_id: string
          prompt_version: string
          session_id?: string | null
          started_at: string
          status: string
          streamed?: boolean
          temperature?: number | null
          user_id?: string | null
        }
        Update: {
          agent?: string
          cache_read_tokens?: number
          cache_write_tokens?: number
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          input_tokens?: number
          max_tokens?: number
          model?: string
          output_tokens?: number
          prompt_hash?: string
          prompt_id?: string
          prompt_version?: string
          session_id?: string | null
          started_at?: string
          status?: string
          streamed?: boolean
          temperature?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_call_logs: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          input_summary: Json
          latency_ms: number
          outcome: string
          result_ids: string[]
          source_ids: string[]
          tool_name: string
        }
        Insert: {
          correlation_id: string
          created_at?: string
          id?: string
          input_summary?: Json
          latency_ms: number
          outcome: string
          result_ids?: string[]
          source_ids?: string[]
          tool_name: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          input_summary?: Json
          latency_ms?: number
          outcome?: string
          result_ids?: string[]
          source_ids?: string[]
          tool_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          locale: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          locale?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          locale?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trusted_sources: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          canonical_host: string
          created_at: string
          id: string
          jurisdiction: string
          next_review_at: string | null
          notes: string | null
          organisation: string
          permitted_content: string[]
          reviewed_at: string | null
          source_class: string
          status: string
          terms_url: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          canonical_host: string
          created_at?: string
          id?: string
          jurisdiction: string
          next_review_at?: string | null
          notes?: string | null
          organisation: string
          permitted_content?: string[]
          reviewed_at?: string | null
          source_class: string
          status?: string
          terms_url?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          canonical_host?: string
          created_at?: string
          id?: string
          jurisdiction?: string
          next_review_at?: string | null
          notes?: string | null
          organisation?: string
          permitted_content?: string[]
          reviewed_at?: string | null
          source_class?: string
          status?: string
          terms_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trusted_sources_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_events: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          expires_at: string | null
          format: string
          id: string
          location_label: string
          name: string
          postcode: string | null
          registration_url: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string
          source_url: string
          starts_at: string
          status: string
          suburb: string | null
          topic: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          expires_at?: string | null
          format: string
          id?: string
          location_label: string
          name: string
          postcode?: string | null
          registration_url: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id: string
          source_url: string
          starts_at: string
          status?: string
          suburb?: string | null
          topic?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          expires_at?: string | null
          format?: string
          id?: string
          location_label?: string
          name?: string
          postcode?: string | null
          registration_url?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string
          source_url?: string
          starts_at?: string
          status?: string
          suburb?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verified_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_events_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "trusted_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      list_knowledge_documents: {
        Args: never
        Returns: {
          chunk_count: number
          created_at: string
          source: string
          title: string
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity_score: number
          source: string
        }[]
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

