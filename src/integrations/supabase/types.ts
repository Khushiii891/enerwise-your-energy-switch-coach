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
  public: {
    Tables: {
      contracts: {
        Row: {
          contract_end_date: string | null
          exit_fee: number
          exit_fee_condition: string
          feed_in_compensation_per_kwh: number
          feed_in_cost_per_kwh: number
          price_per_gas: number
          price_per_kwh: number
          supplier: string
          tariff_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contract_end_date?: string | null
          exit_fee?: number
          exit_fee_condition?: string
          feed_in_compensation_per_kwh?: number
          feed_in_cost_per_kwh?: number
          price_per_gas: number
          price_per_kwh: number
          supplier: string
          tariff_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contract_end_date?: string | null
          exit_fee?: number
          exit_fee_condition?: string
          feed_in_compensation_per_kwh?: number
          feed_in_cost_per_kwh?: number
          price_per_gas?: number
          price_per_kwh?: number
          supplier?: string
          tariff_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      control_settings: {
        Row: {
          allowed_types: string[]
          cancel_window_days: number
          created_at: string
          excluded_suppliers: string[]
          min_savings: number
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_types?: string[]
          cancel_window_days?: number
          created_at?: string
          excluded_suppliers?: string[]
          min_savings?: number
          mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_types?: string[]
          cancel_window_days?: number
          created_at?: string
          excluded_suppliers?: string[]
          min_savings?: number
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          helpful: boolean
          id: string
          recommendation_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          helpful: boolean
          id?: string
          recommendation_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          helpful?: boolean
          id?: string
          recommendation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_switches: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: string
          net_savings: number
          planned_date: string
          status: string
          supplier: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          net_savings: number
          planned_date: string
          status?: string
          supplier: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          net_savings?: number
          planned_date?: string
          status?: string
          supplier?: string
          user_id?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          best_supplier: string | null
          created_at: string
          current_supplier: string | null
          decision: string
          id: string
          input_hash: string | null
          lang: string
          model: string
          net_savings: number | null
          prompt_version: string
          rationale_text: Json
          user_id: string
        }
        Insert: {
          best_supplier?: string | null
          created_at?: string
          current_supplier?: string | null
          decision: string
          id?: string
          input_hash?: string | null
          lang?: string
          model: string
          net_savings?: number | null
          prompt_version: string
          rationale_text: Json
          user_id: string
        }
        Update: {
          best_supplier?: string | null
          created_at?: string
          current_supplier?: string | null
          decision?: string
          id?: string
          input_hash?: string | null
          lang?: string
          model?: string
          net_savings?: number | null
          prompt_version?: string
          rationale_text?: Json
          user_id?: string
        }
        Relationships: []
      }
      tariffs: {
        Row: {
          contract_length: number
          feed_in_compensation_per_kwh: number
          feed_in_cost_per_kwh: number
          gas_price: number
          id: string
          kwh_price: number
          promo: number
          supplier: string
          tariff_type: string
        }
        Insert: {
          contract_length: number
          feed_in_compensation_per_kwh?: number
          feed_in_cost_per_kwh?: number
          gas_price: number
          id?: string
          kwh_price: number
          promo?: number
          supplier: string
          tariff_type?: string
        }
        Update: {
          contract_length?: number
          feed_in_compensation_per_kwh?: number
          feed_in_cost_per_kwh?: number
          gas_price?: number
          id?: string
          kwh_price?: number
          promo?: number
          supplier?: string
          tariff_type?: string
        }
        Relationships: []
      }
      usage: {
        Row: {
          annual_feed_in: number
          annual_grid_import: number
          estimate_used: boolean
          has_battery: boolean | null
          has_solar: boolean
          monthly_electricity: number
          monthly_gas: number
          orientation: string | null
          panel_count: number | null
          panel_wattage: number | null
          shading: string | null
          total_usage_kwh: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          annual_feed_in?: number
          annual_grid_import?: number
          estimate_used?: boolean
          has_battery?: boolean | null
          has_solar?: boolean
          monthly_electricity: number
          monthly_gas: number
          orientation?: string | null
          panel_count?: number | null
          panel_wattage?: number | null
          shading?: string | null
          total_usage_kwh?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          annual_feed_in?: number
          annual_grid_import?: number
          estimate_used?: boolean
          has_battery?: boolean | null
          has_solar?: boolean
          monthly_electricity?: number
          monthly_gas?: number
          orientation?: string | null
          panel_count?: number | null
          panel_wattage?: number | null
          shading?: string | null
          total_usage_kwh?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
