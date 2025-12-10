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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          master_reference: string | null
          new_data: Json | null
          notes: string | null
          previous_data: Json | null
          round_number: number | null
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          master_reference?: string | null
          new_data?: Json | null
          notes?: string | null
          previous_data?: Json | null
          round_number?: number | null
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          master_reference?: string | null
          new_data?: Json | null
          notes?: string | null
          previous_data?: Json | null
          round_number?: number | null
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_master_reference_fkey"
            columns: ["master_reference"]
            isOneToOne: false
            referencedRelation: "inventory_master"
            referencedColumns: ["reference"]
          },
          {
            foreignKeyName: "audit_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "count_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      count_tasks: {
        Row: {
          assigned_supervisor_id: string | null
          audit_round: number
          created_at: string | null
          id: string
          is_completed: boolean | null
          location_detail: string | null
          location_name: string
          master_reference: string
          operario_id: string | null
          quantity_counted: number | null
          responsible_name: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_supervisor_id?: string | null
          audit_round?: number
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          location_detail?: string | null
          location_name: string
          master_reference: string
          operario_id?: string | null
          quantity_counted?: number | null
          responsible_name?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_supervisor_id?: string | null
          audit_round?: number
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          location_detail?: string | null
          location_name?: string
          master_reference?: string
          operario_id?: string | null
          quantity_counted?: number | null
          responsible_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "count_tasks_master_reference_fkey"
            columns: ["master_reference"]
            isOneToOne: false
            referencedRelation: "inventory_master"
            referencedColumns: ["reference"]
          },
          {
            foreignKeyName: "count_tasks_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_master: {
        Row: {
          assigned_admin_id: string | null
          audit_round: number | null
          count_history: Json | null
          created_at: string | null
          description: string | null
          erp_alm: number | null
          erp_pld: number | null
          erp_plr: number | null
          erp_target_qty: number | null
          erp_za: number | null
          material_type: Database["public"]["Enums"]["material_type"]
          reference: string
          status_slug: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_admin_id?: string | null
          audit_round?: number | null
          count_history?: Json | null
          created_at?: string | null
          description?: string | null
          erp_alm?: number | null
          erp_pld?: number | null
          erp_plr?: number | null
          erp_target_qty?: number | null
          erp_za?: number | null
          material_type: Database["public"]["Enums"]["material_type"]
          reference: string
          status_slug?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_admin_id?: string | null
          audit_round?: number | null
          count_history?: Json | null
          created_at?: string | null
          description?: string | null
          erp_alm?: number | null
          erp_pld?: number | null
          erp_plr?: number | null
          erp_target_qty?: number | null
          erp_za?: number | null
          material_type?: Database["public"]["Enums"]["material_type"]
          reference?: string
          status_slug?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_master_status_slug_fkey"
            columns: ["status_slug"]
            isOneToOne: false
            referencedRelation: "task_statuses"
            referencedColumns: ["slug"]
          },
        ]
      }
      operarios: {
        Row: {
          created_at: string | null
          document_id: string | null
          full_name: string
          id: string
          is_active: boolean | null
        }
        Insert: {
          created_at?: string | null
          document_id?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
        }
        Update: {
          created_at?: string | null
          document_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      task_statuses: {
        Row: {
          is_final: boolean | null
          label: string
          slug: string
        }
        Insert: {
          is_final?: boolean | null
          label: string
          slug: string
        }
        Update: {
          is_final?: boolean | null
          label?: string
          slug?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
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
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      validate_and_close_round: {
        Args: { _admin_id: string; _reference: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "superadmin" | "admin" | "supervisor" | "operario"
      material_type: "MP" | "PP"
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
      app_role: ["superadmin", "admin", "supervisor", "operario"],
      material_type: ["MP", "PP"],
    },
  },
} as const
