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
          master_reference: string
          new_data: Json | null
          round_number: number | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          master_reference: string
          new_data?: Json | null
          round_number?: number | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          master_reference?: string
          new_data?: Json | null
          round_number?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      inventory_counts: {
        Row: {
          audit_round: number
          created_at: string | null
          id: string
          location_id: string | null
          operario_id: string | null
          quantity_counted: number
          supervisor_id: string | null
          updated_at: string | null
        }
        Insert: {
          audit_round?: number
          created_at?: string | null
          id?: string
          location_id?: string | null
          operario_id?: string | null
          quantity_counted: number
          supervisor_id?: string | null
          updated_at?: string | null
        }
        Update: {
          audit_round?: number
          created_at?: string | null
          id?: string
          location_id?: string | null
          operario_id?: string | null
          quantity_counted?: number
          supervisor_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_master: {
        Row: {
          assigned_admin_id: string | null
          audit_round: number | null
          cant_alm_mp: number | null
          cant_alm_pp: number | null
          cant_pld: number | null
          cant_plr: number | null
          cant_prov_d: number | null
          cant_prov_pp: number | null
          cant_prov_r: number | null
          cant_t_mp: number | null
          cant_total_erp: number | null
          cant_total_pp: number | null
          cant_za: number | null
          control: string | null
          costo_t: number | null
          costo_u_mp: number | null
          costo_u_pp: number | null
          count_history: Json | null
          created_at: string | null
          material_type: Database["public"]["Enums"]["material_type"]
          mo_costo: number | null
          mp_costo: number | null
          referencia: string
          servicio: number | null
          status_slug: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_admin_id?: string | null
          audit_round?: number | null
          cant_alm_mp?: number | null
          cant_alm_pp?: number | null
          cant_pld?: number | null
          cant_plr?: number | null
          cant_prov_d?: number | null
          cant_prov_pp?: number | null
          cant_prov_r?: number | null
          cant_t_mp?: number | null
          cant_total_erp?: number | null
          cant_total_pp?: number | null
          cant_za?: number | null
          control?: string | null
          costo_t?: number | null
          costo_u_mp?: number | null
          costo_u_pp?: number | null
          count_history?: Json | null
          created_at?: string | null
          material_type: Database["public"]["Enums"]["material_type"]
          mo_costo?: number | null
          mp_costo?: number | null
          referencia: string
          servicio?: number | null
          status_slug?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_admin_id?: string | null
          audit_round?: number | null
          cant_alm_mp?: number | null
          cant_alm_pp?: number | null
          cant_pld?: number | null
          cant_plr?: number | null
          cant_prov_d?: number | null
          cant_prov_pp?: number | null
          cant_prov_r?: number | null
          cant_t_mp?: number | null
          cant_total_erp?: number | null
          cant_total_pp?: number | null
          cant_za?: number | null
          control?: string | null
          costo_t?: number | null
          costo_u_mp?: number | null
          costo_u_pp?: number | null
          count_history?: Json | null
          created_at?: string | null
          material_type?: Database["public"]["Enums"]["material_type"]
          mo_costo?: number | null
          mp_costo?: number | null
          referencia?: string
          servicio?: number | null
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
      locations: {
        Row: {
          assigned_admin_id: string | null
          assigned_supervisor_id: string | null
          created_at: string | null
          discovered_at_round: number | null
          id: string
          location_detail: string | null
          location_name: string | null
          master_reference: string
          metodo_conteo: string | null
          observaciones: string | null
          operario_c1_id: string | null
          operario_c2_id: string | null
          operario_c3_id: string | null
          operario_c4_id: string | null
          punto_referencia: string | null
          status_c1: string | null
          status_c2: string | null
          status_c3: string | null
          status_c4: string | null
          subcategoria: string | null
          updated_at: string | null
          validated_at_round: number | null
          validated_quantity: number | null
        }
        Insert: {
          assigned_admin_id?: string | null
          assigned_supervisor_id?: string | null
          created_at?: string | null
          discovered_at_round?: number | null
          id?: string
          location_detail?: string | null
          location_name?: string | null
          master_reference: string
          metodo_conteo?: string | null
          observaciones?: string | null
          operario_c1_id?: string | null
          operario_c2_id?: string | null
          operario_c3_id?: string | null
          operario_c4_id?: string | null
          punto_referencia?: string | null
          status_c1?: string | null
          status_c2?: string | null
          status_c3?: string | null
          status_c4?: string | null
          subcategoria?: string | null
          updated_at?: string | null
          validated_at_round?: number | null
          validated_quantity?: number | null
        }
        Update: {
          assigned_admin_id?: string | null
          assigned_supervisor_id?: string | null
          created_at?: string | null
          discovered_at_round?: number | null
          id?: string
          location_detail?: string | null
          location_name?: string | null
          master_reference?: string
          metodo_conteo?: string | null
          observaciones?: string | null
          operario_c1_id?: string | null
          operario_c2_id?: string | null
          operario_c3_id?: string | null
          operario_c4_id?: string | null
          punto_referencia?: string | null
          status_c1?: string | null
          status_c2?: string | null
          status_c3?: string | null
          status_c4?: string | null
          subcategoria?: string | null
          updated_at?: string | null
          validated_at_round?: number | null
          validated_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "count_tasks_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_tasks_master_reference_fkey"
            columns: ["master_reference"]
            isOneToOne: false
            referencedRelation: "inventory_master"
            referencedColumns: ["referencia"]
          },
          {
            foreignKeyName: "locations_operario_c1_id_fkey"
            columns: ["operario_c1_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_operario_c2_id_fkey"
            columns: ["operario_c2_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_operario_c3_id_fkey"
            columns: ["operario_c3_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_operario_c4_id_fkey"
            columns: ["operario_c4_id"]
            isOneToOne: false
            referencedRelation: "operarios"
            referencedColumns: ["id"]
          },
        ]
      }
      operarios: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          turno: number | null
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          turno?: number | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          turno?: number | null
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
      admin_can_access_reference: {
        Args: { _reference: string; _user_id: string }
        Returns: boolean
      }
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
      is_any_admin: { Args: { _user_id: string }; Returns: boolean }
      is_location_validated: {
        Args: { _location_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      validate_and_close_round: {
        Args: { _admin_id: string; _reference: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin"
        | "admin_mp"
        | "admin_pp"
        | "supervisor"
        | "operario"
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
      app_role: [
        "superadmin",
        "admin",
        "admin_mp",
        "admin_pp",
        "supervisor",
        "operario",
      ],
      material_type: ["MP", "PP"],
    },
  },
} as const
