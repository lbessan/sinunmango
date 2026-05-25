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
      shares: {
        Row: {
          accepted_at:     string | null
          expires_at:      string
          id:              string
          invite_token:    string
          invited_at:      string
          invitee_user_id: string | null
          owner_user_id:   string
          revoked_at:      string | null
          role:            string
        }
        Insert: {
          accepted_at?:     string | null
          expires_at?:      string
          id?:              string
          invite_token:     string
          invited_at?:      string
          invitee_user_id?: string | null
          owner_user_id:    string
          revoked_at?:      string | null
          role:             string
        }
        Update: {
          accepted_at?:     string | null
          expires_at?:      string
          id?:              string
          invite_token?:    string
          invited_at?:      string
          invitee_user_id?: string | null
          owner_user_id?:   string
          revoked_at?:      string | null
          role?:            string
        }
        Relationships: []
      }
      share_resources: {
        Row: {
          added_at:        string
          resource_id:     string
          resource_type:   string
          share_id:        string
        }
        Insert: {
          added_at?:       string
          resource_id:     string
          resource_type:   string
          share_id:        string
        }
        Update: {
          added_at?:       string
          resource_id?:    string
          resource_type?:  string
          share_id?:       string
        }
        Relationships: []
      }
      bancos_custom: {
        Row: {
          color: string
          created_at: string
          id: string
          imagen_banner_url: string | null
          imagen_url: string | null
          nombre: string
          tipo: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id: string
          imagen_banner_url?: string | null
          imagen_url?: string | null
          nombre: string
          tipo?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          imagen_banner_url?: string | null
          imagen_url?: string | null
          nombre?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      categorias: {
        Row: {
          created_at: string | null
          icono: string | null
          id: string
          imagen_url: string | null
          nombre_categoria: string
          tipo_default: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          icono?: string | null
          id: string
          imagen_url?: string | null
          nombre_categoria: string
          tipo_default?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          icono?: string | null
          id?: string
          imagen_url?: string | null
          nombre_categoria?: string
          tipo_default?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cuentas: {
        Row: {
          activa: boolean
          color_primario: string | null
          created_at: string | null
          fecha_cierre_tarjeta: string | null
          fecha_vencimiento_tarjeta: string | null
          id: string
          imagen_banner_url: string | null
          imagen_url: string | null
          institucion: string | null
          moneda: string
          nombre_cuenta: string
          saldo_inicial: number
          terminacion_tarjeta: string | null
          tipo_cuenta: string
          user_id: string | null
        }
        Insert: {
          activa?: boolean
          color_primario?: string | null
          created_at?: string | null
          fecha_cierre_tarjeta?: string | null
          fecha_vencimiento_tarjeta?: string | null
          id: string
          imagen_banner_url?: string | null
          imagen_url?: string | null
          institucion?: string | null
          moneda?: string
          nombre_cuenta: string
          saldo_inicial?: number
          terminacion_tarjeta?: string | null
          tipo_cuenta: string
          user_id?: string | null
        }
        Update: {
          activa?: boolean
          color_primario?: string | null
          created_at?: string | null
          fecha_cierre_tarjeta?: string | null
          fecha_vencimiento_tarjeta?: string | null
          id?: string
          imagen_banner_url?: string | null
          imagen_url?: string | null
          institucion?: string | null
          moneda?: string
          nombre_cuenta?: string
          saldo_inicial?: number
          terminacion_tarjeta?: string | null
          tipo_cuenta?: string
          user_id?: string | null
        }
        Relationships: []
      }
      gastos_fijos: {
        Row: {
          activo: boolean
          created_at: string | null
          cuenta_pago_default: string | null
          dia_vencimiento: number | null
          id: string
          id_categoria: string | null
          id_subcategoria: string | null
          moneda: string
          monto_estimado: number
          nombre_gasto: string
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          cuenta_pago_default?: string | null
          dia_vencimiento?: number | null
          id: string
          id_categoria?: string | null
          id_subcategoria?: string | null
          moneda?: string
          monto_estimado?: number
          nombre_gasto: string
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          cuenta_pago_default?: string | null
          dia_vencimiento?: number | null
          id?: string
          id_categoria?: string | null
          id_subcategoria?: string | null
          moneda?: string
          monto_estimado?: number
          nombre_gasto?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_fijos_cuenta_pago_default_fkey"
            columns: ["cuenta_pago_default"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_fijos_cuenta_pago_default_fkey"
            columns: ["cuenta_pago_default"]
            isOneToOne: false
            referencedRelation: "saldo_actual_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_fijos_id_categoria_fkey"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_fijos_id_subcategoria_fkey"
            columns: ["id_subcategoria"]
            isOneToOne: false
            referencedRelation: "subcategorias"
            referencedColumns: ["id"]
          },
        ]
      }
      inversiones: {
        Row: {
          capital_inicial: number
          created_at: string
          datos: Json
          estado: string
          fecha_inicio: string
          fecha_vencimiento: string | null
          id: string
          moneda: string
          movimiento_origen_id: string | null
          nombre: string | null
          notas: string | null
          tipo: string
          updated_at: string
          user_id: string
          valor_actual: number | null
        }
        Insert: {
          capital_inicial?: number
          created_at?: string
          datos?: Json
          estado?: string
          fecha_inicio?: string
          fecha_vencimiento?: string | null
          id?: string
          moneda?: string
          movimiento_origen_id?: string | null
          nombre?: string | null
          notas?: string | null
          tipo: string
          updated_at?: string
          user_id: string
          valor_actual?: number | null
        }
        Update: {
          capital_inicial?: number
          created_at?: string
          datos?: Json
          estado?: string
          fecha_inicio?: string
          fecha_vencimiento?: string | null
          id?: string
          moneda?: string
          movimiento_origen_id?: string | null
          nombre?: string | null
          notas?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
          valor_actual?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inversiones_movimiento_origen_id_fkey"
            columns: ["movimiento_origen_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inversiones_movimiento_origen_id_fkey"
            columns: ["movimiento_origen_id"]
            isOneToOne: false
            referencedRelation: "movimientos_completos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos: {
        Row: {
          categoria: string | null
          ciclo_actual: number
          conciliado: boolean
          cotizacion: number | null
          created_at: string | null
          cuenta_destino: string | null
          cuenta_origen: string | null
          cuota_actual: number
          cuotas_total: number
          detalle: string | null
          fecha: string
          foto_comprobante: string | null
          grupo_cuotas: string | null
          id: string
          moneda: string
          monto: number
          notas: string | null
          periodo_tarjeta: string | null
          subcategoria: string | null
          tipo_movimiento: string
          user_id: string | null
        }
        Insert: {
          categoria?: string | null
          ciclo_actual?: number
          conciliado?: boolean
          cotizacion?: number | null
          created_at?: string | null
          cuenta_destino?: string | null
          cuenta_origen?: string | null
          cuota_actual?: number
          cuotas_total?: number
          detalle?: string | null
          fecha: string
          foto_comprobante?: string | null
          grupo_cuotas?: string | null
          id: string
          moneda?: string
          monto: number
          notas?: string | null
          periodo_tarjeta?: string | null
          subcategoria?: string | null
          tipo_movimiento: string
          user_id?: string | null
        }
        Update: {
          categoria?: string | null
          ciclo_actual?: number
          conciliado?: boolean
          cotizacion?: number | null
          created_at?: string | null
          cuenta_destino?: string | null
          cuenta_origen?: string | null
          cuota_actual?: number
          cuotas_total?: number
          detalle?: string | null
          fecha?: string
          foto_comprobante?: string | null
          grupo_cuotas?: string | null
          id?: string
          moneda?: string
          monto?: number
          notas?: string | null
          periodo_tarjeta?: string | null
          subcategoria?: string | null
          tipo_movimiento?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_categoria_fkey"
            columns: ["categoria"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_cuenta_destino_fkey"
            columns: ["cuenta_destino"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_cuenta_destino_fkey"
            columns: ["cuenta_destino"]
            isOneToOne: false
            referencedRelation: "saldo_actual_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_cuenta_origen_fkey"
            columns: ["cuenta_origen"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_cuenta_origen_fkey"
            columns: ["cuenta_origen"]
            isOneToOne: false
            referencedRelation: "saldo_actual_cuentas"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros: {
        Row: {
          created_at: string | null
          fecha: string | null
          id: string
          user_id: string | null
          valor: number
        }
        Insert: {
          created_at?: string | null
          fecha?: string | null
          id: string
          user_id?: string | null
          valor: number
        }
        Update: {
          created_at?: string | null
          fecha?: string | null
          id?: string
          user_id?: string | null
          valor?: number
        }
        Relationships: []
      }
      rate_limit_log: {
        Row: {
          at: string
          endpoint: string
          user_id: string
        }
        Insert: {
          at?: string
          endpoint: string
          user_id: string
        }
        Update: {
          at?: string
          endpoint?: string
          user_id?: string
        }
        Relationships: []
      }
      subcategorias: {
        Row: {
          categoria_padre: string | null
          created_at: string | null
          icono: string | null
          id: string
          nombre_subcategoria: string
          user_id: string | null
        }
        Insert: {
          categoria_padre?: string | null
          created_at?: string | null
          icono?: string | null
          id: string
          nombre_subcategoria: string
          user_id?: string | null
        }
        Update: {
          categoria_padre?: string | null
          created_at?: string | null
          icono?: string | null
          id?: string
          nombre_subcategoria?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_categoria_padre_fkey"
            columns: ["categoria_padre"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_monthly: {
        Row: {
          count: number
          feature: string
          month: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          count?: number
          feature: string
          month: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          count?: number
          feature?: string
          month?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          alerta_resumen_mensual: boolean | null
          alerta_resumen_semanal: boolean | null
          alerta_vencimientos_activa: boolean | null
          alerta_vencimientos_dias: number[] | null
          created_at: string | null
          email_inbound_token: string | null
          gmail_verification_code: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alerta_resumen_mensual?: boolean | null
          alerta_resumen_semanal?: boolean | null
          alerta_vencimientos_activa?: boolean | null
          alerta_vencimientos_dias?: number[] | null
          created_at?: string | null
          email_inbound_token?: string | null
          gmail_verification_code?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alerta_resumen_mensual?: boolean | null
          alerta_resumen_semanal?: boolean | null
          alerta_vencimientos_activa?: boolean | null
          alerta_vencimientos_dias?: number[] | null
          created_at?: string | null
          email_inbound_token?: string | null
          gmail_verification_code?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          authorized: boolean | null
          created_at: string | null
          deleted_at: string | null
          early_access: boolean
          early_access_expires_at: string | null
          email: string
          mp_payer_id: string | null
          mp_preapproval_id: string | null
          mp_status: string | null
          onboarding_completed_at: string | null
          plan: string
          plan_amount: number | null
          plan_expires_at: string | null
          plan_period: string | null
          plan_renews_at: string | null
          plan_updated_at: string | null
          subscribed_at: string | null
          user_id: string
        }
        Insert: {
          authorized?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          early_access?: boolean
          early_access_expires_at?: string | null
          email: string
          mp_payer_id?: string | null
          mp_preapproval_id?: string | null
          mp_status?: string | null
          onboarding_completed_at?: string | null
          plan?: string
          plan_amount?: number | null
          plan_expires_at?: string | null
          plan_period?: string | null
          plan_renews_at?: string | null
          plan_updated_at?: string | null
          subscribed_at?: string | null
          user_id: string
        }
        Update: {
          authorized?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          early_access?: boolean
          early_access_expires_at?: string | null
          email?: string
          mp_payer_id?: string | null
          mp_preapproval_id?: string | null
          mp_status?: string | null
          onboarding_completed_at?: string | null
          plan?: string
          plan_amount?: number | null
          plan_expires_at?: string | null
          plan_period?: string | null
          plan_renews_at?: string | null
          plan_updated_at?: string | null
          subscribed_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          mp_payment_id: string
          mp_preapproval_id: string | null
          period_end: string | null
          period_start: string | null
          raw_event: Json | null
          status: string
          status_detail: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          mp_payment_id: string
          mp_preapproval_id?: string | null
          period_end?: string | null
          period_start?: string | null
          raw_event?: Json | null
          status: string
          status_detail?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          mp_payment_id?: string
          mp_preapproval_id?: string | null
          period_end?: string | null
          period_start?: string | null
          raw_event?: Json | null
          status?: string
          status_detail?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      dashboard_resumen: {
        Row: {
          deuda_tarjetas_periodo: number | null
          disponible_real: number | null
          gastos_actuales: number | null
          gastos_fijos_pendientes: number | null
          ingresos_actuales: number | null
          ingresos_futuros_mes: number | null
          pagos_tarjeta_mes: number | null
          periodo_actual: string | null
          user_id: string | null
        }
        Relationships: []
      }
      movimientos_completos: {
        Row: {
          categoria: string | null
          categoria_icono: string | null
          categoria_nombre: string | null
          ciclo_actual: number | null
          conciliado: boolean | null
          cotizacion: number | null
          created_at: string | null
          cuenta_destino: string | null
          cuenta_destino_nombre: string | null
          cuenta_origen: string | null
          cuenta_origen_nombre: string | null
          cuenta_origen_tipo: string | null
          cuota_actual: number | null
          cuotas_total: number | null
          detalle: string | null
          fecha: string | null
          foto_comprobante: string | null
          grupo_cuotas: string | null
          id: string | null
          moneda: string | null
          monto: number | null
          monto_estimado: number | null
          notas: string | null
          periodo_tarjeta: string | null
          subcategoria: string | null
          tipo_movimiento: string | null
          tipo_movimiento_calculado: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_categoria_fkey"
            columns: ["categoria"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_cuenta_destino_fkey"
            columns: ["cuenta_destino"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_cuenta_destino_fkey"
            columns: ["cuenta_destino"]
            isOneToOne: false
            referencedRelation: "saldo_actual_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_cuenta_origen_fkey"
            columns: ["cuenta_origen"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_cuenta_origen_fkey"
            columns: ["cuenta_origen"]
            isOneToOne: false
            referencedRelation: "saldo_actual_cuentas"
            referencedColumns: ["id"]
          },
        ]
      }
      saldo_actual_cuentas: {
        Row: {
          activa: boolean | null
          fecha_cierre_tarjeta: string | null
          fecha_vencimiento_tarjeta: string | null
          id: string | null
          moneda: string | null
          nombre_cuenta: string | null
          saldo_actual: number | null
          saldo_inicial: number | null
          tipo_cuenta: string | null
          user_id: string | null
        }
        Insert: {
          activa?: boolean | null
          fecha_cierre_tarjeta?: string | null
          fecha_vencimiento_tarjeta?: string | null
          id?: string | null
          moneda?: string | null
          nombre_cuenta?: string | null
          saldo_actual?: never
          saldo_inicial?: number | null
          tipo_cuenta?: string | null
          user_id?: string | null
        }
        Update: {
          activa?: boolean | null
          fecha_cierre_tarjeta?: string | null
          fecha_vencimiento_tarjeta?: string | null
          id?: string | null
          moneda?: string | null
          nombre_cuenta?: string | null
          saldo_actual?: never
          saldo_inicial?: number | null
          tipo_cuenta?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calcular_periodo_tarjeta: {
        Args: {
          p_fecha: string
          p_fecha_cierre: string
          p_fecha_vencimiento: string
          p_tipo_cuenta: string
        }
        Returns: string
      }
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_max: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      get_all_usage: {
        Args: never
        Returns: {
          count: number
          feature: string
        }[]
      }
      get_usage: { Args: { p_feature: string }; Returns: number }
      increment_usage: { Args: { p_feature: string }; Returns: number }
      increment_usage_admin: {
        Args: { p_feature: string; p_limit: number; p_user_id: string }
        Returns: Json
      }
      is_authorized: { Args: { uid: string }; Returns: boolean }
      monto_estimado: {
        Args: {
          p_conciliado: boolean
          p_cotizacion: number
          p_moneda: string
          p_monto: number
        }
        Returns: number
      }
      today_ar: { Args: never; Returns: string }
      user_has_pro_access: { Args: { p_user_id: string }; Returns: boolean }
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
